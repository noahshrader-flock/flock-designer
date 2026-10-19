/**
 * One writer for trying a change in the previews and for committing it. Each edit is read back by the same reader and must
 * read exactly as the change says (`withEdits`), nothing else moved, or it is refused.
 */
import type { DesignToken, TokenEdit } from '../../../shared/contract';
import { isEditable } from '../../../shared/primitives';
import { MOST_EDITS, fitsKind, placeOf, withEdits } from '../../../shared/tokens';
import { type CatalogReads, overlaid } from './componentCatalog';
import { readTokens, sourceNamed } from './designTokens';
import { asRecord } from '../../../shared/json';

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

/** Only the files that change, by path from the library's root. Throws, in words, for an edit that cannot be made. */
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

	const after = await readTokens(overlaid(reads, texts));
	const wrong = after.source === tokens.source ? mismatch(after.tokens, withEdits(tokens.tokens, edits)) : 'the library would be read another way';
	if (wrong) throw new Error(`The change was not made, because written into the library's files ${wrong}.`);
	return texts;
};
