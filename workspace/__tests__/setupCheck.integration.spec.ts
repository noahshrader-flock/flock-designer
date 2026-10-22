import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { writeEntryFiles } from '../src/core/services/products/entryFiles';
import { NO_CLONES } from '../src/core/services/products/discovery';
import { setupCheck } from '../src/core/services/products/setupCheck';
import { g, makeDesignSystem, writeFiles } from './fixtures';

let home: string;
let product: string;
let design: string;
const NO_ANSWERS = { of: () => undefined };
const check = () => setupCheck(product, { answers: NO_ANSWERS, clones: NO_CLONES });

/** The workspace file the setup note's own example is: what an agent following it writes for a product with those scripts. */
const NOTE_EXAMPLE = () => {
	const note = readFileSync(join(__dirname, '../../skills/set-up-a-product.md'), 'utf8');
	return /```json\n([\s\S]*?)\n```/.exec(note)![1]!;
};

/** A product set up as the note says: its workspace file, what every agent reads first, and the agent files DSNR writes. */
const setUp = (workspace = NOTE_EXAMPLE()) => {
	writeFiles(product, {
		'.dsnr/workspace.json': workspace,
		'.dsnr/README.md': '# Acme Admin\n',
		'.dsnr/manifest.md': '# Acme Admin\n\n## Accessibility conformance target\n\n| | |\n|---|---|\n| **Target** | WCAG 2.2 AA |\n',
		'.dsnr/standards/non-negotiables.md': '# Non-negotiables here\n',
	});
	writeEntryFiles(product, design);
};

beforeEach(() => {
	home = mkdtempSync(join(tmpdir(), 'dsnr-setup-'));
	product = join(home, 'acme-admin');
	design = join(home, 'flock-designer');
	writeFiles(product, { 'package.json': JSON.stringify({ name: 'acme-admin', scripts: { lint: 'eslint .' } }) });
	g(product, 'init', '-q');
	mkdirSync(join(design, '.git'), { recursive: true });
	for (const name of ['dsnr', 'implementation-reviewer', 'product-parity-reviewer']) writeFiles(design, { [`agents/${name}.md`]: `# ${name}\n` });
	makeDesignSystem(join(home, 'ui'), '@acme/ui');
});
afterEach(() => rmSync(home, { recursive: true, force: true }));

describe('how far a product is set up, as DSNR reads it', () => {
	it('has nothing to fix when it is set up as the note says, the note’s own example included, and lists what DSNR may run', async () => {
		setUp();
		const { problems, commands } = await check();
		expect(problems).toEqual([]);
		expect(commands.map((c) => `${c.id}: ${c.argv.join(' ')}`)).toEqual(['install: npm ci', 'typecheck: npx tsc --noEmit', 'lint: npm run lint']);
	});

	it('says what DSNR would use that the product does not have, each with what it is for, as nothing to fix', async () => {
		setUp();
		const { problems, missing } = await check();
		expect(problems).toEqual([]);
		expect(missing).toEqual([
			'No design-mode command: it runs the real product on mock data, for codebase work and its accessibility check.',
			'No check-iteration command: it runs the light check after every step of codebase work.',
			'No handoff command: it runs the gate that says codebase work is fit for engineering.',
			'No a11y command: it runs the accessibility scan the reviewers use.',
		]);
	});

	it('says a workspace file it cannot read, and nothing else', async () => {
		writeFiles(product, { '.dsnr/workspace.json': '{ "version": 2 }' });
		expect(await check()).toEqual({ problems: ['.dsnr/workspace.json declares version 2; this app understands 1'], missing: [], commands: [] });
	});

	it('refuses a command that runs a script package.json does not have, or runs anything but npm, npx or node', async () => {
		const workspace = JSON.parse(NOTE_EXAMPLE()) as { commands: unknown[] };
		workspace.commands.push({ id: 'test', label: 'Tests', argv: ['npm', 'test'] }, { id: 'build', label: 'Build', argv: ['make', 'all'] });
		setUp(JSON.stringify(workspace));
		expect((await check()).problems).toEqual([
			'test runs the script test, which package.json does not have.',
			'build runs make: DSNR runs commands through npm, npx, node only.',
		]);
	});

	it('refuses a product without what every agent reads before building, or with agent files not as DSNR writes them', async () => {
		writeFiles(product, { '.dsnr/workspace.json': NOTE_EXAMPLE() });
		expect((await check()).problems).toEqual([
			'There is no .dsnr/README.md, which every agent reads before building.',
			'There is no .dsnr/manifest.md, which every agent reads before building.',
			'There is no .dsnr/standards/non-negotiables.md, which every agent reads before building.',
			expect.stringMatching(/^Its agent files are not as DSNR writes them \(AGENTS\.md, .*\): run dsnr agent-files\.$/),
		]);
	});

	it('leaves the accessibility target, a design system it cannot find and a missing design repository to the team, in words', async () => {
		setUp(NOTE_EXAMPLE().replace('@acme/ui', '@acme/missing'));
		writeFileSync(join(product, '.dsnr', 'manifest.md'), '# Acme Admin\n');
		rmSync(join(design, '.git'), { recursive: true });
		const { problems, missing } = await check();
		expect(problems).toEqual([]);
		expect(missing).toEqual(
			expect.arrayContaining([
				"Acme Admin's .dsnr/manifest.md declares no accessibility target: the conformance level is the team's to decide, and every accessibility check needs it.",
				'No design system was found for @acme/missing, the package .dsnr/workspace.json names.',
				expect.stringMatching(/^DSNR could not find [\w-]+\/flock-designer, the design repository acme-admin belongs to/),
			]),
		);
	});
});
