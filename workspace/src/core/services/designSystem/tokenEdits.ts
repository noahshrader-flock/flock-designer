/**
 * A change to the library's tokens, written into its files (T3 of the design system plan, decisions 19 and 26): what the
 * previews are built from to try a change, and what T4 will commit to a branch. **One writer for both.**
 *
 * Each edit is checked before anything is written: the token is one the library has, a value fits its kind, and only a
 * token written as a pointer is pointed elsewhere. Each is then written by the source that read the token, in its place
 * and nowhere else (`tokens/`). **Then the files are read back**, by the same reader, and must read exactly as the change
 * says they will (`withEdits`, which the panel shows): every token edited, any written in the same place, every one
 * that points at one, and nothing else moved. A change that would not read back so is refused in words, and nothing is built from it.
 */
import type { DesignToken, TokenEdit } from '../../../shared/contract';
import { isEditable } from '../../../shared/primitives';
import { MOST_EDITS, fitsKind, placeOf, withEdits } from '../../../shared/tokens';
import type { CatalogReads } from './componentCatalog';
import { readTokens, sourceNamed } from './designTokens';
import { asRecord } from '../../../shared/json';

/** The edits the window sent, as edits, or an error: only what the contract says an edit is. */
export const tokenEditsOf = (sent: unknown): TokenEdit[] => {
	if (sent === undefined) return [];
	const isText = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 200;
	if (!Array.isArray(sent) || sent.length > MOST_EDITS) throw new Error('A change is a list of token edits.');
	return sent.map((e: unknown) => {
		const o = asRecord(e);
		if (isText(o.path) && isText(o.ref) && !('value' in o)) return { path: o.path, ref: o.ref };
		if (isText(o.path) && isText(o.value) && !('ref' in o)) return { path: o.path, value: o.value };
		throw new Error('A token edit names a token and either the token it points at or its new value.');
	});
};

/** The reason an edit cannot be made to these tokens, or null when it can. */
export const editProblem = (edit: TokenEdit, byPath: Map<string, DesignToken>): string | null => {
	const token = byPath.get(edit.path);
	if (!token) return `The library has no token ${edit.path}.`;
	if (!isEditable(token)) return `${token.path} is shown, not changed: only a color, a spacing or a radius is changed here.`;
	if ('value' in edit)
		return fitsKind(token.kind, edit.value)
			? null
			: `${edit.value} is not a ${token.kind === 'color' ? 'hex color' : 'length'}, so ${token.path} cannot be it.`;
	const target = byPath.get(edit.ref);
	if (!token.ref) return `${token.path} has a value of its own, not a pointer, so it is given a value, not pointed elsewhere.`;
	if (!target || target.kind !== token.kind || target.path === token.path) return `${token.path} cannot point at ${edit.ref}.`;
	return null;
};

/** The same reads, with some files as `texts` has them. */
const withTexts = (reads: CatalogReads, texts: Map<string, string>): CatalogReads => ({
	listFiles: (dir) => reads.listFiles(dir),
	readFile: async (path) => texts.get(path) ?? reads.readFile(path),
});

/** The first token that does not read back as the change says it will, in words; null when every one does. */
const mismatch = (read: DesignToken[], expected: DesignToken[]): string | null => {
	const got = new Map(read.map((t) => [t.path, t]));
	if (got.size !== expected.length) return 'the library would have a different list of tokens';
	for (const want of expected) {
		const t = got.get(want.path);
		if (!t) return `${want.path} would be gone`;
		if (t.value.toLowerCase() !== want.value.toLowerCase()) return `${want.path} would be ${t.value}, not ${want.value}`;
		if (t.ref?.path !== want.ref?.path || t.ref?.alpha !== want.ref?.alpha)
			return `${want.path} would point at ${t.ref?.path ?? 'nothing'}, not ${want.ref?.path ?? 'nothing'}`;
	}
	return null;
};

/**
 * The library's files with `edits` made, by path from the library's root: only the files that change. Throws, in words,
 * for an edit that cannot be made or a change that would not read back as it says.
 */
export const editedFiles = async (reads: CatalogReads, edits: TokenEdit[]): Promise<Map<string, string>> => {
	const tokens = await readTokens(reads);
	const source = sourceNamed(tokens.source);
	if (!source) throw new Error('No tokens were found in this library, so there is nothing to change.');
	const byPath = new Map(tokens.tokens.map((t) => [t.path, t]));
	for (const edit of edits) {
		const problem = editProblem(edit, byPath);
		if (problem) throw new Error(problem);
	}
	// Once for each place a token is written: two edits of one place (a shared role's Light and Dark) would contradict.
	if (new Set(edits.map((e) => placeOf(byPath.get(e.path) as DesignToken))).size !== edits.length) throw new Error('A change edits each token once.');

	const texts = new Map<string, string>();
	for (const edit of edits) {
		const token = byPath.get(edit.path) as DesignToken;
		const { file } = token.source;
		const text = texts.get(file) ?? (await reads.readFile(file));
		texts.set(file, source.edit(text, token, edit));
	}

	const after = await readTokens(withTexts(reads, texts));
	const wrong = after.source === tokens.source ? mismatch(after.tokens, withEdits(tokens.tokens, edits)) : 'the library would be read another way';
	if (wrong) throw new Error(`The change was not made, because written into the library's files ${wrong}.`);
	return texts;
};
