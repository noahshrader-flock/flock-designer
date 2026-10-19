import { readFileSync, readdirSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The comment rule (`npm run check`): no block over three lines of text in shipping code, and no history (a date, a plan, a
 * phase, a person) in any comment, tests included; the average is said, not held, so no comment loses context to a number.
 */
const root = dirname(fileURLToPath(import.meta.url));
const ts = createRequire(import.meta.url)('typescript');

/** The few that must be longer, by file and the words they begin with, each with its reason. */
const LONGER = [];

const MOST_LINES = 3;
const HISTORY = /\b20\d\d-\d\d-\d\d\b|\b[A-Z][A-Z_]*_PLAN\b|\bQUALITY_PASS\b|\bPhase \d|\bNoah\b/;
const SKIP = new Set(['node_modules', 'dist', 'out', 'fixtures']);

const sources = (dir) =>
	readdirSync(dir).flatMap((name) => {
		const path = join(dir, name);
		if (SKIP.has(name) || name.startsWith('.')) return [];
		if (statSync(path).isDirectory()) return sources(path);
		return /\.(tsx?|mjs|css)$/.test(name) && !name.endsWith('.d.ts') && !name.endsWith('.d.mts') ? [path] : [];
	});

const files = () => [
	...['src', 'extension', 'bin', 'functions', '__tests__'].flatMap((dir) => sources(join(root, dir))),
	...readdirSync(root)
		.filter((name) => /\.(mjs|ts)$/.test(name) && !/\.d\.m?ts$/.test(name))
		.map((name) => join(root, name)),
];

/** Every comment in a file, where it starts and ends: a stylesheet's by its markers, code's by TypeScript's own reading. */
const comments = (path, text) => {
	if (path.endsWith('.css')) return [...text.matchAll(/\/\*[\s\S]*?\*\//g)].map((m) => ({ pos: m.index, end: m.index + m[0].length, line: false }));
	const kind = path.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
	const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, kind);
	const found = new Map();
	const visit = (node) => {
		for (const r of [...(ts.getLeadingCommentRanges(text, node.pos) ?? []), ...(ts.getTrailingCommentRanges(text, node.end) ?? [])])
			found.set(r.pos, { pos: r.pos, end: r.end, line: r.kind === ts.SyntaxKind.SingleLineCommentTrivia });
		node.getChildren(source).forEach(visit);
	};
	visit(source);
	return [...found.values()].sort((a, b) => a.pos - b.pos);
};

/** A file's comment blocks: one `/* … *\/`, or `//` lines one under the other, each on a line of its own. */
const blocks = (path, text) => {
	const lineAt = (i) => text.slice(0, i).split('\n').length;
	const alone = (i) => /^\s*$/.test(text.slice(text.lastIndexOf('\n', i - 1) + 1, i));
	const out = [];
	for (const c of comments(path, text)) {
		const line = lineAt(c.pos);
		const last = out.at(-1);
		if (c.line && last?.lines && last.end === line - 1 && alone(c.pos)) {
			last.text += `\n${text.slice(c.pos, c.end)}`;
			last.end = line;
			continue;
		}
		out.push({ text: text.slice(c.pos, c.end), start: line, end: lineAt(c.end), lines: c.line && alone(c.pos) });
	}
	return out;
};

/** The code's line width (Prettier's): a comment line wider than it counts as the lines it would wrap to. */
const WIDTH = 150;

/** How many lines of words a block holds: not its markers, nor a directive to a tool. */
const linesOf = (block) =>
	block.text
		.split('\n')
		.filter((l) => {
			const words = l
				.replace(/^\s*(\/\*\*?|\*\/|\*(?!\/)|\/\/)\s?/, '')
				.replace(/\*\/\s*$/, '')
				.trim();
			return words && !/^(eslint-|@ts-|prettier-ignore)/.test(words);
		})
		.reduce((n, l) => n + Math.max(1, Math.ceil(l.replace(/\t/g, '  ').length / WIDTH)), 0);

/**
 * What is wrong with one file's comments, by its path from the workspace: a block over three lines (shipping code only),
 * and any history; with each block's lines, for the average.
 */
export const review = (file, text) => {
	const tests = file.startsWith('__tests__');
	const failures = [];
	const lines = [];
	for (const block of blocks(file, text)) {
		const n = linesOf(block);
		if (n === 0) continue;
		lines.push(n);
		const words = block.text.replace(/^[\s/*]+/, '');
		const longer = LONGER.some(([f, start]) => f === file && words.startsWith(start));
		if (!tests && n > MOST_LINES && !longer) failures.push(`${file}:${block.start} is ${n} lines (${MOST_LINES} at most)`);
		const history = HISTORY.exec(block.text);
		if (history) failures.push(`${file}:${block.start} says when, who or which plan ("${history[0]}"): that is git's and the Change log's`);
	}
	return { failures, lines };
};

/** `areas`, folders or files from the workspace, narrow it to them (`node commentCheck.mjs src/ui`); none is every file. */
const run = (areas) => {
	const failures = [];
	// Lines of comment and lines of everything else, for each: a reading, held to nothing, so growth shows.
	/** @type {Record<'shipping' | 'tests', [number, number]>} */
	const counts = { shipping: [0, 0], tests: [0, 0] };
	for (const path of files()) {
		const file = relative(root, path);
		if (areas.length && !areas.some((a) => file === a || file.startsWith(`${a.replace(/\/$/, '')}/`))) continue;
		const text = readFileSync(path, 'utf8');
		const found = review(file, text);
		failures.push(...found.failures);
		const count = counts[file.startsWith('__tests__') ? 'tests' : 'shipping'];
		const commented = found.lines.reduce((a, b) => a + b, 0);
		count[0] += commented;
		count[1] += text.split('\n').filter((l) => l.trim()).length - commented;
	}
	const per100 = ([comment, code]) => (code ? Math.round((comment / code) * 100) : 0);
	console.log(`comments: ${per100(counts.shipping)} lines per 100 of code in shipping code, ${per100(counts.tests)} in tests`);
	for (const f of failures) console.log(`  ${f}`);
	if (failures.length) {
		console.log(`comments: ${failures.length} to fix. A comment says why, or what the code cannot show, in three lines at most.`);
		process.exitCode = 1;
	}
};

if (process.argv[1] === fileURLToPath(import.meta.url)) run(process.argv.slice(2));
