import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { expect, it } from 'vitest';
import { findCommand, readDescriptor } from '../src/core/services/projects/descriptor';
import { recordsRootFor } from '../src/core/services/projects/discovery';
import { REAL_COKE as COKE, cokeMissing, describeWith } from './realCheckouts';

/** Unit tests prove each piece behaves; this proves the pieces agree with an actual product repository. */
describeWith(cokeMissing, 'against the real Coke checkout', () => {
	it('parses the descriptor Coke ships', () => {
		const descriptor = readDescriptor(COKE);
		expect(descriptor.product).toContain('Coke');
		expect(descriptor.commands.length).toBeGreaterThan(0);
	});

	it('finds the preview command and the port it serves on', () => {
		const preview = findCommand(readDescriptor(COKE), 'preview');
		expect(preview.argv[0]).toBe('npm');
		expect(preview.servesPreviewOn).toBe(3100);
	});

	it('still refuses anything Coke does not declare', () => {
		expect(() => findCommand(readDescriptor(COKE), 'publish')).toThrow(/not a command/);
	});

	it("puts project records where the repository's own handoff gate looks for them", () => {
		// check-handoff.mjs resolves '../flock-designer/prototypes/<id>'. If these two
		// ever disagree, Workspace writes records the gate cannot find.
		expect(recordsRootFor(COKE)).toBe(join(dirname(COKE), 'flock-designer', 'projects'));
	});
});

/** A pointer that names a file that is not there sends an agent to nothing, silently. */
describeWith(cokeMissing, 'the entry points of the real Coke checkout', () => {
	const text = (path: string) => readFileSync(join(COKE, path), 'utf8');
	const entries = ['AGENTS.md', 'CLAUDE.md'];
	const pointers = readdirSync(join(COKE, '.claude', 'agents')).map((f) => `.claude/agents/${f}`);

	it('sends every agent that reads AGENTS.md to the guide and to the dsnr agent', () => {
		const agents = text('AGENTS.md');
		expect(agents).toContain('../flock-designer/agents/ui-guide.md');
		expect(agents).toContain('../flock-designer/agents/dsnr.md');
	});

	it('says it once: CLAUDE.md imports AGENTS.md and holds no section of its own about it', () => {
		const claude = text('CLAUDE.md');
		expect(claude).toMatch(/^@AGENTS\.md$/m);
		expect(claude).not.toMatch(/dsnr|flock-designer/i);
	});

	it('says it in one place for Copilot too: it reads AGENTS.md, so no instructions file repeats it', () => {
		// Add one for Copilot only if it is shown not to read AGENTS.md (09, AGENT-ANY-1): a second copy is a second thing to keep true.
		const copilot = readdirSync(join(COKE, '.github'), { recursive: true, encoding: 'utf8' }).filter((f) => f.endsWith('.md'));
		expect(copilot.filter((f) => /flock-designer/.test(text(`.github/${f}`)))).toEqual([]);
	});

	it('names only files that are there', () => {
		const missing = [...entries, ...pointers].flatMap((file) =>
			[...text(file).matchAll(/\.\.\/flock-designer\/([\w./-]+\.md)/g)]
				.map((m) => m[1] as string)
				.filter((path) => !existsSync(join(dirname(COKE), 'flock-designer', path)))
				.map((path) => `${file} -> ${path}`),
		);
		expect(missing).toEqual([]);
	});

	it('opens the folders the pointers assume, in one workspace', () => {
		const folders = (JSON.parse(text('dsnr.code-workspace')) as { folders: { path: string }[] }).folders.map((f) => f.path);
		expect(folders).toEqual(['.', '../flock-designer', '../flock-react-component-lib']);
		expect(folders.filter((f) => !existsSync(join(COKE, f)))).toEqual([]);
	});
});
