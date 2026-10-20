import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The knowledge base (`knowledge/`) says how DSNR works in plain words, for people. What it names must be real, or it
 * misleads the very people it is for: so every label it shows in bold is text the app shows, every path it names is in the
 * repository, every `dsnr` command is one the command has, and every page it links to is there.
 */
const REPO = join(__dirname, '..', '..');
const KNOWLEDGE = join(REPO, 'knowledge');
const PAGES = readdirSync(KNOWLEDGE).filter((f) => f.endsWith('.md'));

const filesUnder = (dir: string, ext: RegExp): string[] =>
	readdirSync(dir).flatMap((name) => {
		const path = join(dir, name);
		if (name === 'node_modules' || name === 'dist') return [];
		return statSync(path).isDirectory() ? filesUnder(path, ext) : ext.test(name) ? [path] : [];
	});

/**
 * Every word the app can show: its source, with its vocabulary's words (`HOST`, GitHub) put in where the source names them,
 * and its commands as VS Code shows them, in a menu (the title) and in the palette (with "DSNR:").
 */
const shown = (() => {
	const workspace = join(REPO, 'workspace');
	const vocabulary = [...readFileSync(join(workspace, 'src', 'shared', 'vocabulary.ts'), 'utf8').matchAll(/^export const ([A-Z_]+) = '([^']*)'/gm)];
	const source = vocabulary.reduce(
		(text, [, name, value]) => text.replaceAll(`\${${name}}`, value as string),
		[join(workspace, 'src'), join(workspace, 'extension', 'src'), join(workspace, 'extension', 'webview')]
			.flatMap((dir) => filesUnder(dir, /\.tsx?$/))
			.map((f) => readFileSync(f, 'utf8'))
			.join('\n'),
	);
	const manifest = JSON.parse(readFileSync(join(workspace, 'extension', 'package.json'), 'utf8')) as {
		contributes: { commands: { title: string; category?: string }[] };
	};
	const commands = manifest.contributes.commands.flatMap((c) => (c.category ? [c.title, `${c.category}: ${c.title}`] : [c.title]));
	return { source, commands };
})();

const dsnrCommands = new Set(
	[...readFileSync(join(REPO, 'workspace', 'src', 'cli', 'dsnr.ts'), 'utf8').matchAll(/^ {2}dsnr ([a-z-]+)/gm)].map((m) => m[1]),
);

const each = (pattern: RegExp, text: string): string[] => [...text.matchAll(pattern)].map((m) => m[1] as string);

const escaped = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Shown as the app shows it: the whole of a string (after a VS Code icon, `$(cloud) Synced`, if it has one), or the whole
 * text of an element, however it is wrapped. Never a word inside code.
 */
const isShown = (label: string): boolean => {
	const l = escaped(label);
	return shown.commands.includes(label) || new RegExp(`(['"\`])(?:\\$\\([\\w-]+\\) )?${l}\\1|>\\s*${l}\\s*<`).test(shown.source);
};

describe('the knowledge base names only what is real', () => {
	it('has its pages, each linked from its front page', () => {
		const front = readFileSync(join(KNOWLEDGE, 'README.md'), 'utf8');
		expect(PAGES.length).toBeGreaterThan(10);
		for (const page of PAGES.filter((p) => p !== 'README.md')) expect(front, page).toContain(`(${page})`);
	});

	for (const page of PAGES) {
		const text = readFileSync(join(KNOWLEDGE, page), 'utf8');

		it(`${page}: every label in bold is one the app shows, as it shows it`, () => {
			const labels = each(/\*\*([^*\n]+)\*\*/g, text);
			const missing = labels.filter((l) => !isShown(l));
			expect(missing, 'bold is only for what is on screen: a label the app does not show, or not as written').toEqual([]);
		});

		it(`${page}: every path it names is in the repository, and every page it links to is here`, () => {
			const paths = each(/`((?:agents|skills|standards|knowledge|projects|workspace)\/[^`\s]*)`/g, text);
			expect(
				paths.filter((p) => !existsSync(join(REPO, p))),
				'a path in the repository',
			).toEqual([]);
			const links = each(/\]\(([\w-]+\.md)\)/g, text);
			expect(
				links.filter((l) => !existsSync(join(KNOWLEDGE, l))),
				'a page beside it',
			).toEqual([]);
		});

		it(`${page}: every dsnr command it names is one the command has`, () => {
			const named = each(/`dsnr ([a-z-]+)/g, text);
			expect(named.filter((c) => !dsnrCommands.has(c))).toEqual([]);
		});
	}
});
