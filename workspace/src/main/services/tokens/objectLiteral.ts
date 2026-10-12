/**
 * A reader for the object literals design libraries keep their tokens in, as text, never run: each entry with the line it
 * starts on. Strings, templates and comments are stepped over whole, so a brace or a comma inside them counts for
 * nothing. Each value also has where it is written (`span`), so a change replaces exactly the text that was read. Used
 * by the theme-files source (`themeFiles.ts`), and for token files (JSON is an object literal too).
 */

export type Node = { kind: 'object'; entries: Entry[] } | { kind: 'value'; text: string };
export interface Entry {
	key: string | null;
	/** `...name`: the entries of another object, spread in. */
	spread?: string;
	value: Node;
	line: number;
	/** Where its value is written: from its first character to just past its last, comments and white space left out. */
	span: [number, number];
}

export const lineAt = (text: string, i: number): number => text.slice(0, i).split('\n').length;

/** Just past a string, template or comment starting at `i`, or `i` when none does. */
const skipNonCode = (text: string, i: number): number => {
	const c = text[i];
	if (c === '/' && text[i + 1] === '/') {
		const end = text.indexOf('\n', i);
		return end < 0 ? text.length : end;
	}
	if (c === '/' && text[i + 1] === '*') {
		const end = text.indexOf('*/', i + 2);
		return end < 0 ? text.length : end + 2;
	}
	if (c === "'" || c === '"') {
		let j = i + 1;
		while (j < text.length && text[j] !== c && text[j] !== '\n') j += text[j] === '\\' ? 2 : 1;
		return j + 1;
	}
	if (c === '`') {
		let j = i + 1;
		let inner = 0;
		while (j < text.length) {
			if (text[j] === '\\') j += 2;
			else if (inner === 0 && text[j] === '`') return j + 1;
			else if (text[j] === '$' && text[j + 1] === '{') {
				inner++;
				j += 2;
			} else if (inner > 0 && text[j] === '}') {
				inner--;
				j++;
			} else j++;
		}
		return text.length;
	}
	return i;
};

/** Where the code of a stretch of text starts, past white space and comments. */
const codeStart = (text: string, from: number, to: number): number => {
	let i = from;
	while (i < to) {
		if (/\s/.test(text[i] as string)) i++;
		else {
			const j = text[i] === '/' ? skipNonCode(text, i) : i;
			if (j === i) return i;
			i = j;
		}
	}
	return to;
};

/** Just past the last character of code in a stretch of text: a string counts, a comment or white space after it does not. */
const codeEnd = (text: string, from: number, to: number): number => {
	let end = from;
	let i = from;
	while (i < to) {
		const j = skipNonCode(text, i);
		if (j > i) {
			if (text[i] !== '/') end = j;
			i = j;
		} else {
			if (!/\s/.test(text[i] as string)) end = i + 1;
			i++;
		}
	}
	return Math.min(end, to);
};

/**
 * The items of the array literal whose `[` is at `open`: each one's code as written, its line, and where it is. A string's
 * commas, and those inside a call or a nested literal, do not end an item.
 */
export const arrayItems = (text: string, open: number): { text: string; line: number; span: [number, number] }[] => {
	const items: { text: string; line: number; span: [number, number] }[] = [];
	const item = (from: number, to: number) => {
		const at = codeStart(text, from, to);
		if (at >= to) return;
		const end = codeEnd(text, at, to);
		items.push({ text: text.slice(at, end).replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '').trim(), line: lineAt(text, at), span: [at, end] });
	};
	let start = open + 1;
	let depth = 0;
	for (let i = open + 1; i < text.length; ) {
		const j = skipNonCode(text, i);
		if (j > i) {
			i = j;
			continue;
		}
		const c = text[i];
		if (c === '{' || c === '[' || c === '(') depth++;
		else if (c === '}' || c === ']' || c === ')') {
			if (depth === 0) {
				item(start, i);
				return items;
			}
			depth--;
		} else if (c === ',' && depth === 0) {
			item(start, i);
			start = i + 1;
		}
		i++;
	}
	return items;
};

/** The object literal whose `{` is at `open`, and where it ends. */
export const parseObject = (text: string, open: number): { node: Node; end: number } => {
	const entries: Entry[] = [];
	let start = open + 1;
	let depth = 0;
	const entry = (from: number, to: number) => {
		const at = codeStart(text, from, to);
		if (at >= to) return;
		const line = lineAt(text, at);
		if (text.startsWith('...', at)) {
			entries.push({ key: null, spread: text.slice(at + 3, to).trim(), value: { kind: 'value', text: '' }, line, span: [at, to] });
			return;
		}
		// The key ends at the first colon of the entry's own code.
		let i = at;
		while (i < to && text[i] !== ':') i = Math.max(skipNonCode(text, i), i + 1);
		const key = text.slice(at, i).trim().replace(/^['"]|['"]$/g, '');
		const valueAt = codeStart(text, i + 1, to);
		if (text[valueAt] === '{') {
			const { node, end } = parseObject(text, valueAt);
			entries.push({ key, value: node, line, span: [valueAt, end] });
			return;
		}
		entries.push({ key, value: { kind: 'value', text: text.slice(valueAt, to).replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '').trim() }, line, span: [valueAt, codeEnd(text, valueAt, to)] });
	};
	let i = open + 1;
	while (i < text.length) {
		const j = skipNonCode(text, i);
		if (j > i) {
			i = j;
			continue;
		}
		const c = text[i];
		if (c === '{' || c === '[' || c === '(') depth++;
		else if (c === '}' || c === ']' || c === ')') {
			if (depth === 0) {
				entry(start, i);
				return { node: { kind: 'object', entries }, end: i + 1 };
			}
			depth--;
		} else if (c === ',' && depth === 0) {
			entry(start, i);
			start = i + 1;
		}
		i++;
	}
	return { node: { kind: 'object', entries }, end: text.length };
};

/** Every `export const name = { … }` in a file, by name. */
export const exportedObjects = (text: string): Map<string, Entry[]> => {
	const found = new Map<string, Entry[]>();
	for (const m of text.matchAll(/export\s+const\s+(\w+)\s*(?::[^=]+)?=\s*\{/g)) {
		const { node } = parseObject(text, (m.index ?? 0) + m[0].length - 1);
		if (node.kind === 'object') found.set(m[1] as string, node.entries);
	}
	return found;
};

/**
 * The entry written as `key` on `line`, anywhere in a file's exported objects, however deep: where a token read from
 * there is written. Null unless exactly one is, so a change is never written to a guess.
 */
export const entryAt = (text: string, key: string, line: number): Entry | null => {
	const found: Entry[] = [];
	const walk = (entries: Entry[]) => {
		for (const e of entries) {
			if (e.key === key && e.line === line) found.push(e);
			if (e.value.kind === 'object') walk(e.value.entries);
		}
	};
	for (const entries of exportedObjects(text).values()) walk(entries);
	return found.length === 1 ? (found[0] as Entry) : null;
};

/** `text` with `span` replaced by `written`. */
export const replaced = (text: string, [from, to]: [number, number], written: string): string => `${text.slice(0, from)}${written}${text.slice(to)}`;

/** A plain string literal's text (`'#108062'`), or null for anything else. */
export const literal = (text: string): string | null => /^(['"])(.*)\1$/.exec(text)?.[2] ?? null;
