/**
 * Asking in words (Phase 6 of adjusting a component, DESIGN_SYSTEM_PLAN.md; T8): "make the primary a little warmer", "make
 * the small size 28px high", made into **the same changes the controls make** (token edits, values tried on a component's
 * instances), which then go where those go: tried in the frame, what else moved, Save, Propose. Nothing here is a change of
 * its own kind.
 *
 * **The agent translates, the app checks.** The agent is given the facts (the tokens that can be changed, the component's
 * values as Values reads them, and what is being tried now) and answers in JSON; it reads and writes nothing, so it runs in an
 * empty folder. Its answer passes the rules a control's change does (`editProblem`, `triedValuesOf`, each value in its
 * property's form); one that does not goes back to it once, with why, and is then refused in words.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AskedChange, DesignToken, TokenEdit, TriedValue, ValueRow } from '../../shared/contract';
import { COLOR_VALUES, triedId } from '../../shared/contract';
import { isEditable } from '../../shared/primitives';
import { labelOf, placeOf } from '../../shared/tokens';
import { asTried } from '../../shared/valueParts';
import { VALUE_NAMES, followsOf, saidValue } from '../../shared/valueNames';
import { asRecord } from '../../shared/json';
import type { RunEnded } from './agent';
import type { ComponentTokens } from './componentTokens';
import { editProblem, tokenEditsOf } from './tokenEdits';
import { triedValuesOf } from './valueSources';

export interface AskInWordsDeps {
	tokens: Pick<ComponentTokens, 'drawn' | 'of'>;
	/** The agent, run to its end in a folder (`runToEnd`). */
	run: (cwd: string, task: string) => Promise<RunEnded>;
}

/** What is being tried now, which words are asked on top of: the token edits every page shares, and the tab's values. */
export interface Trying {
	edits: TokenEdit[];
	tried: TriedValue[];
}

/** How many times an answer that breaks the rules goes back to the agent, with why, before the person is told. */
const MOST_ROUNDS = 2;

/** A component's value, named for the agent (`v1`), with the instances a value tried on it is set on. */
interface Cell {
	id: string;
	row: ValueRow;
	cell: ValueRow['cells'][number];
}

/** A token as the agent is told of it: its path, its name, its kind, its value, and what it points at. */
const tokenLine = (t: DesignToken): string =>
	`- ${t.path} (${labelOf(t)}): ${t.kind} ${t.value}${t.ref ? `, points at ${t.ref.path}${t.ref.alpha ? ` with opacity ${t.ref.alpha}` : ''}` : ''}`;

/**
 * A component's value as the agent is told of it: its name, its property, its variant, what it draws, what it is made of, and
 * the tokens it could follow, as its control offers them (`followsOf`).
 */
const cellLine = ({ id, row, cell }: Cell, tokens: DesignToken[], name: (path: string) => string): string => {
	const made =
		cell.kind === 'token' ? `the token ${cell.tokens.map(name).join(', ')}` : cell.kind === 'derived' ? 'worked out from a token' : 'its own';
	const variant = cell.variant === null ? '' : `${row.by ?? 'variant'} ${cell.variant}, `;
	const could = followsOf(row.property, cell, tokens).map((t) => t.path);
	return `- ${id}: ${VALUE_NAMES[row.property]} (${row.property}), ${variant}${saidValue(row.property, cell.value)}, ${made}${could.length > 0 ? `; could follow ${could.join(', ')}` : ''}`;
};

/** The task: the words, the facts, what the answer is, and nothing else to do. */
export const askTask = (words: string, tokens: DesignToken[], cells: Cell[] | null, trying: Trying): string => {
	const byPath = new Map(tokens.map((t) => [t.path, t]));
	const name = (path: string) => {
		const t = byPath.get(path);
		return t ? `${path} (${labelOf(t)})` : path;
	};
	const triedNow = trying.tried.map((t) => {
		const at = cells?.find((c) => triedId({ property: c.row.property, targets: c.cell.targets }) === triedId(t));
		return `- ${at?.id ?? t.property}: ${t.value}${t.follows ? `, following ${t.follows}` : ''}`;
	});
	return [
		`A person changing a design system asks, in their words: "${words}"`,
		'',
		"Make it the change the design system's controls would make, and say it as JSON, nothing else: read no file and change none.",
		'',
		'The changes there are:',
		'- A token given a new value (`{ "path": "<token>", "value": "<hex, or a length>" }`) or pointed at another token of its kind (`{ "path": "<token>", "ref": "<token>" }`). A colour is a hex (#RRGGBB, or #RRGGBBAA); a length has its unit.',
		...(cells === null
			? []
			: [
					'- A value of the component\'s own tried on it (`{ "cell": "<v…>", "value": "<value>" }`): a colour as a hex; a length in pixels, and a padding, radius or gap with each of its parts (top right bottom left; a radius\'s corners; a gap\'s row and column). Or made to follow one of the tokens its line says it could follow (`{ "cell": "<v…>", "follows": "<token>" }`).',
				]),
		'',
		cells === null
			? 'Change the tokens the words are about.'
			: "Change a token when the words are about the design system or name a token, since it moves every component that uses it; change the component's values when they are about the component. A value that is a token's is changed as the token, unless the words say this component alone.",
		'A word like "a little" is a small step from where it is now, in the scale the value is in.',
		'',
		'The tokens that can be changed:',
		...tokens.map(tokenLine),
		...(cells === null ? [] : ['', "The component's values, as its stories draw them, in light:", ...cells.map((c) => cellLine(c, tokens, name))]),
		...(trying.edits.length + trying.tried.length === 0
			? []
			: [
					'',
					'Being tried now, which the words are asked on top of:',
					...trying.edits.map((e) => `- ${e.path}: ${'value' in e ? e.value : `points at ${e.ref}`}`),
					...triedNow,
				]),
		'',
		`Answer with one JSON object and nothing else: \`{ "tokens": [...],${cells === null ? '' : ' "values": [...],'} "said": "<one sentence a person reads: what you changed>" }\`. Only what the words change; what is being tried and not changed again stays as it is. When the words cannot be made one of these changes, answer \`{ "refused": "<why, in one sentence>" }\`.`,
	].join('\n');
};

/** The JSON object the agent said, from the first `{` to the last `}` (it may say a word around it), or null. */
const answerIn = (said: string): Record<string, unknown> | null => {
	const [from, to] = [said.indexOf('{'), said.lastIndexOf('}')];
	if (from === -1 || to < from) return null;
	try {
		return asRecord(JSON.parse(said.slice(from, to + 1)));
	} catch {
		return null;
	}
};

/** A value as a control writes it (`asTried`), or why it is not one. */
const valueIn = ({ property }: ValueRow, value: unknown): string | { why: string } =>
	(typeof value === 'string' ? asTried(property, value) : null) ?? {
		why: `${property} is ${COLOR_VALUES.has(property) ? 'a colour, as a hex' : 'a length in pixels, every part'}, not ${String(value)}`,
	};

/** The answer as changes, each checked as a control's is, or the first reason it is not one. */
export const changesIn = (answer: Record<string, unknown>, tokens: DesignToken[], cells: Cell[] | null): AskedChange | { why: string } => {
	if (typeof answer.refused === 'string') return { why: answer.refused };
	let edits: TokenEdit[];
	let values: TriedValue[];
	try {
		edits = tokenEditsOf(answer.tokens ?? []);
	} catch (err) {
		return { why: (err as Error).message };
	}
	const byPath = new Map(tokens.map((t) => [t.path, t]));
	for (const e of edits) {
		const problem = editProblem(e, byPath);
		if (problem) return { why: problem };
	}
	if (new Set(edits.map((e) => placeOf(byPath.get(e.path) as DesignToken))).size !== edits.length) return { why: 'A change edits each token once.' };
	const sent = Array.isArray(answer.values) ? answer.values : [];
	// Asked of the design system alone, only its tokens are changed: a component's own values are changed on its tab.
	if (cells === null && sent.length > 0) return { why: 'only tokens are changed here, so answer with no values' };
	const tried: TriedValue[] = [];
	for (const v of sent) {
		const o = asRecord(v);
		const at = cells?.find((c) => c.id === o.cell);
		if (!at) return { why: typeof o.cell === 'string' ? `${o.cell} is not one of the component's values` : 'a value names its cell (v1, v2…)' };
		const { property } = at.row;
		// Made to follow a token as its control makes one: one the control offers, and drawn as it is until it is written.
		if (typeof o.follows === 'string') {
			if (!followsOf(property, at.cell, tokens).some((t) => t.path === o.follows)) return { why: `${at.id} cannot follow ${o.follows}` };
			tried.push({ property, value: at.cell.value, targets: at.cell.targets, follows: o.follows });
			continue;
		}
		const value = valueIn(at.row, o.value);
		if (typeof value !== 'string') return value;
		tried.push({ property, value, targets: at.cell.targets });
	}
	try {
		values = triedValuesOf(tried);
	} catch (err) {
		return { why: (err as Error).message };
	}
	if (edits.length + values.length === 0) return { why: 'The words changed nothing the controls change.' };
	const said = typeof answer.said === 'string' && answer.said.trim() !== '' ? answer.said.trim() : 'Changed as asked.';
	return { edits, values, said };
};

export class AskInWords {
	constructor(private readonly deps: AskInWordsDeps) {}

	/**
	 * `words` as changes, on the component of story file `file` (its tokens and its values), or on the design system alone
	 * (`null`: its tokens), on top of what is being tried now. Throws, in words, when they cannot be made one.
	 */
	async ask(file: string | null, words: string, trying: Trying): Promise<AskedChange> {
		const index = await this.deps.tokens.drawn();
		if (index.state !== 'ready') throw new Error('The design system is still being read: ask again once its components are drawn.');
		const tokens = index.built.reading.tokens.filter(isEditable);
		let cells: Cell[] | null = null;
		if (file !== null) {
			const of = await this.deps.tokens.of(file);
			if (of.state !== 'ready') throw new Error('Its values are not read yet: ask again once they are shown.');
			const rows = of.values.state === 'read' ? (of.values.rows.light ?? []) : [];
			cells = rows.flatMap((row) => row.cells.map((cell) => ({ row, cell }))).map((c, i) => ({ ...c, id: `v${i + 1}` }));
		}
		const dir = mkdtempSync(join(tmpdir(), 'dsnr-ask-'));
		try {
			let task = askTask(words, tokens, cells, trying);
			for (let round = 1; ; round++) {
				const ran = await this.deps.run(dir, task);
				if (!ran.ok) throw new Error(`The agent did not finish: ${ran.said.slice(-300)}`);
				const answer = answerIn(ran.said);
				const changes = answer === null ? { why: 'it did not answer with the JSON asked for' } : changesIn(answer, tokens, cells);
				if (!('why' in changes)) return changes;
				// Its own refusal is the person's to read; a broken answer goes back once.
				if (answer !== null && typeof answer.refused === 'string') throw new Error(changes.why);
				const why = changes.why.replace(/\.$/, '');
				if (round >= MOST_ROUNDS) throw new Error(`The words could not be made a change: ${why}.`);
				task = `${task}\n\nYour answer was not taken, because ${why}. Answer again, as asked.`;
			}
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	}
}
