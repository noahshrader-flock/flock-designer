import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { DEFINITIONS, entryFiles, writeEntryFiles } from '../src/core/services/projects/entryFiles';

const dirs: string[] = [];
afterEach(() => {
	for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

/** A product beside its design repository, as they sit on a person's machine. */
const machine = () => {
	const home = mkdtempSync(join(tmpdir(), 'dsnr-entry-'));
	dirs.push(home);
	const product = join(home, 'flock-coke');
	mkdirSync(product);
	return { product, design: join(home, 'flock-designer') };
};
const put = (root: string, path: string, text: string) => {
	mkdirSync(dirname(join(root, path)), { recursive: true });
	writeFileSync(join(root, path), text);
};
const read = (root: string, path: string) => readFileSync(join(root, path), 'utf8');

describe('what every agent is given, so none has guidance another lacks', () => {
	const files = entryFiles('../flock-designer');
	const pointed = (prefix: string) =>
		files
			.filter((f) => f.path.startsWith(prefix))
			.map((f) => /\.\.\/flock-designer\/agents\/([\w-]+)\.md/.exec(f.text(null))?.[1])
			.sort();

	it('points Claude Code’s agents and Codex’s skills at the same definitions, each one of them', () => {
		const all = DEFINITIONS.map((d) => d.name).sort();
		expect(pointed('.claude/agents/')).toEqual(all);
		expect(pointed('.agents/skills/')).toEqual(all);
	});

	it('points only at definitions the design repository has, and copies none of them', () => {
		const agents = join(__dirname, '../../agents');
		for (const { name } of DEFINITIONS) expect(existsSync(join(agents, `${name}.md`)), name).toBe(true);
		for (const f of files) expect(f.text(null).length, f.path).toBeLessThan(1200);
	});

	it('gives AGENTS.md, which every agent reads, the guide and the workflow, and makes CLAUDE.md read it', () => {
		const agentsMd = files.find((f) => f.path === 'AGENTS.md')!.text(null);
		expect(agentsMd).toContain('../flock-designer/agents/ui-guide.md');
		expect(agentsMd).toContain('../flock-designer/agents/dsnr.md');
		// An agent's own subagent left running ends with the work half done.
		expect(agentsMd).toMatch(/Wait for whatever you hand to an agent of your own before you finish/);
		expect(files.find((f) => f.path === 'CLAUDE.md')!.text(null)).toBe('@AGENTS.md\n');
	});

	it('keeps the reviewers read-only where an agent is told its tools', () => {
		for (const { name, readOnly } of DEFINITIONS) {
			const claude = files.find((f) => f.path === `.claude/agents/${name}.md`)!.text(null);
			expect(/^tools: .*\b(Write|Edit)\b/m.test(claude), name).toBe(!readOnly);
		}
	});
});

describe('writing them into a product', () => {
	it('writes each into a product that has none, pointing at the design repository beside it, and changes nothing the second time', () => {
		const { product, design } = machine();
		const first = writeEntryFiles(product, design);
		expect(first.written).toEqual(entryFiles('../flock-designer').map((f) => f.path));
		expect(first.left).toEqual([]);
		expect(read(product, '.agents/skills/dsnr/SKILL.md')).toMatch(
			/^---\nname: dsnr\ndescription: .+\n---\n\nRead \*\*`\.\.\/flock-designer\/agents\/dsnr\.md`\*\*/,
		);
		expect(writeEntryFiles(product, design)).toEqual({ written: [], unchanged: first.written, left: [] });
	});

	it('keeps what a product’s AGENTS.md says of itself, and holds DSNR’s part to its own section, said once', () => {
		const { product, design } = machine();
		put(product, 'AGENTS.md', '# Repository Guide\n\nUse npm ci.\n');
		writeEntryFiles(product, design);
		writeEntryFiles(product, design);
		const text = read(product, 'AGENTS.md');
		expect(text.startsWith('# Repository Guide\n\nUse npm ci.\n\n<!-- dsnr:agents -->')).toBe(true);
		expect(text.match(/<!-- dsnr:agents -->/g)).toHaveLength(1);
	});

	it('puts its section in place of the one a product made by hand before DSNR wrote them, never beside it', () => {
		const { product, design } = machine();
		const handMade = '## Product UI and prototype work\n\nFor any product UI work, read `../flock-designer/agents/ui-guide.md` first.\n';
		put(product, 'AGENTS.md', `# Repository Guide\n\n${handMade}\n## Testing\n\nRun npm test.\n`);
		expect(writeEntryFiles(product, design).written).toContain('AGENTS.md');
		const text = read(product, 'AGENTS.md');
		expect(text.match(/^## Product UI and prototype work$/gm)).toHaveLength(1);
		expect(text).toMatch(
			/^# Repository Guide\n\n<!-- dsnr:agents -->\n## Product UI and prototype work\n[\s\S]+<!-- \/dsnr:agents -->\n\n## Testing\n\nRun npm test\.\n$/,
		);
		expect(writeEntryFiles(product, design).unchanged).toContain('AGENTS.md');
	});

	it('leaves a section of that name that is the product’s own, which does not send work to the guide, saying why', () => {
		const { product, design } = machine();
		put(product, 'AGENTS.md', '## Product UI and prototype work\n\nOur own way.\n');
		expect(writeEntryFiles(product, design).left).toContainEqual({ path: 'AGENTS.md', why: expect.stringMatching(/section of its own/) });
		expect(read(product, 'AGENTS.md')).toBe('## Product UI and prototype work\n\nOur own way.\n');
	});

	it('replaces its own pointers, a hand-made one at the same definition included, and leaves what is the product’s own, saying why', () => {
		const { product, design } = machine();
		put(product, 'CLAUDE.md', '# Our own rules\n');
		put(product, '.claude/agents/dsnr.md', 'Read **`../flock-designer/agents/dsnr.md`** in full.\n');
		put(product, '.claude/agents/implementation-reviewer.md', 'Our own reviewer.\n');
		const done = writeEntryFiles(product, design);
		expect(done.written).toContain('.claude/agents/dsnr.md');
		expect(read(product, '.claude/agents/dsnr.md')).toMatch(/^---\nname: dsnr\n/);
		expect(done.left).toEqual([
			{ path: 'CLAUDE.md', why: expect.stringMatching(/Claude Code reads in place of AGENTS\.md/) },
			{ path: '.claude/agents/implementation-reviewer.md', why: 'it is not a pointer at ../flock-designer/agents/implementation-reviewer.md' },
		]);
		expect(read(product, 'CLAUDE.md')).toBe('# Our own rules\n');
		expect(read(product, '.claude/agents/implementation-reviewer.md')).toBe('Our own reviewer.\n');
	});
});
