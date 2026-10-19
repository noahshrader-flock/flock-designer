import { readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { sourceFiles } from './fixtures';

const root = join(__dirname, '..');

/**
 * What would make DSNR work for one design system only: a library's name or repository, its components' prefix, the
 * address of its hosted Storybook, or its branch. Comments may name one, as the case that explains a choice.
 */
const NAMED = [
	/flock-react-component-lib|\bFUI\b/i,
	/\bprimer\b|\btremor\b/i,
	/\bFS[A-Z][a-z]\w*/,
	/chromatic\.com/i,
	/^(?:develop|origin\/develop|refs\/(?:heads|remotes\/origin)\/develop)$/,
];

// Flock's library's hosted Storybook, the default for that repository alone: any other design system's is asked for.
const ALLOWED = new Set(['src/shared/config.ts']);
// The extension's own test, which may use a real library, as every real-library test does: it is not shipped.
const TESTS = /^extension\/test\//;

/** Each string, template part, JSX text and name in a script, never its comments. */
const codeOf = (path: string, text: string): string[] => {
	const file = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, path.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
	const found: string[] = [];
	const visit = (node: ts.Node) => {
		if (ts.isStringLiteralLike(node) || ts.isJsxText(node) || ts.isIdentifier(node)) found.push(node.text);
		else if (ts.isTemplateExpression(node)) found.push(node.head.text, ...node.templateSpans.map((span) => span.literal.text));
		ts.forEachChild(node, visit);
	};
	visit(file);
	return found;
};

const named = () =>
	['src', 'extension']
		.flatMap((dir) => sourceFiles(join(root, dir)))
		.filter((path) => !path.endsWith('.css'))
		.map((path) => ({ path: relative(root, path), text: readFileSync(path, 'utf8') }))
		.filter(({ path }) => !ALLOWED.has(path) && !TESTS.test(path))
		.flatMap(({ path, text }) =>
			codeOf(path, text)
				.filter((said) => NAMED.some((name) => name.test(said)))
				.map((said) => `${path}: ${said}`),
		);

describe('DSNR’s code', () => {
	it('names no design system: no library, component prefix, hosted Storybook or branch of one, but Flock’s default address', () => {
		expect(named()).toEqual([]);
	});
});
