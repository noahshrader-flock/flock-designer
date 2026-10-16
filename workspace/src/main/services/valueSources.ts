/**
 * Where the values tried on a component's instances are written, and what writing them reaches (Phase 4 of adjusting a
 * component, DESIGN_SYSTEM_PLAN.md), found in the background while they are tried, the newest only, so the tab says each
 * value's place, or why it cannot be saved, before Save.
 *
 * **Found by its effect** (`valueLocator.ts`): each place the drawn value is written is changed alone, on a build kept
 * open for it, to a value of DSNR's own, and the component's stories drawn again, light, against what the index drew
 * (T6): the places that move the instances tried on are where it is written. That depends on the value drawn, not on the
 * one tried, so each is found once per commit and kept: moving a slider only writes and reads back.
 *
 * **Then written and read back:** every value found is written in its place, the whole library drawn with the writes, light
 * and dark, as a change to the tokens is (`ComponentTokens.reachWith`), and each value tried must draw on its instances as
 * asked, or it is refused and written with none. What the writes reach is what else they move: a size table two
 * components share moves both.
 *
 * Refused, in words, and never guessed at: a value not written in the design system's own files (from a package, or worked
 * out: `${n}px`); written in more places than are tried one by one; written in places that each draw it; written once for
 * parts tried apart; or one that does not read back as asked.
 */
import type { ChangeReach, StoryPreview, TriedValue, ValuePlace, ValueProperty, ValueSource, ValueSources as Answer } from '../../shared/contract';
import { COLOR_VALUES, VALUE_PROPERTIES, triedId } from '../../shared/contract';
import { asRecord } from '../../shared/json';
import { hexOf } from '../../shared/tokens';
import { allParts, partsIn } from '../../shared/valueParts';
import type { ComponentTokens, DrawnIndex, Instance, Measure } from './componentTokens';
import { isNothing } from './tokenTags';
import { newestAnswer } from './newestAnswer';
import type { OpenedBuild } from './storyPreviews';
import { type Place, placesIn, probeFor, searchedFiles, withWrites, writtenAs } from './valueLocator';

/** How many values a component's instances can be tried with at once: far beyond any tab's, short of anything that could hurt. */
const MOST_TRIED = 50;

/**
 * The values the window sent as tried, or an error: only what the contract says one is (a property, its value as CSS
 * writes it, the instances it is on). What is written into the library is never this text: it is the number or the colour
 * it reads as, in the way its place writes it (`writtenAs`), so nothing else can be written.
 */
export const triedValuesOf = (sent: unknown): TriedValue[] => {
	if (!Array.isArray(sent) || sent.length > MOST_TRIED) throw new Error('Values tried are a list of values.');
	const text = (x: unknown, most: number): x is string => typeof x === 'string' && x.length > 0 && x.length <= most;
	return sent.map((v: unknown) => {
		const o = asRecord(v);
		const { property, value, targets } = o;
		if (
			(VALUE_PROPERTIES as readonly unknown[]).includes(property) &&
			text(value, 100) &&
			Array.isArray(targets) &&
			targets.length > 0 &&
			targets.length <= 500 &&
			targets.every((k) => text(k, 400))
		)
			return { property: property as ValueProperty, value, targets: targets as string[] };
		throw new Error('A value tried names its property, its value as CSS writes it, and the instances it is tried on.');
	});
};

/**
 * How many places one value may be written in to be tried: in halves, the one place in four hundred takes about eighteen
 * builds of two seconds each. More is refused, and said.
 */
export const MOST_PLACES = 400;

export interface ValueSourcesDeps {
	tokens: Pick<ComponentTokens, 'drawn' | 'reachWith' | 'asIs'>;
	previews: { opened(purpose: 'locate'): Promise<OpenedBuild | Exclude<StoryPreview, { state: 'ready' }>> };
	measure: Measure;
}

/**
 * The places that move a value's instances, each with which of them and which of their parts it moves (`moved`): a size
 * table writes each size's in a place of its own. Or why there are none to try; or that they could not be tried (the
 * previews would not build), which is not kept, so it is tried again.
 */
type Located =
	{ state: 'found'; places: { place: Place; moves: Set<string> }[] } | { state: 'refused'; why: string } | { state: 'failed'; error: string };

/** An answer, with the files it writes kept here for Save: never sent. */
type Worked = Answer & { files?: Map<string, string> };

/** Two drawn parts are the same: colours as hex, whatever way the browser wrote them; lengths as written. */
const same = (property: ValueProperty, a: string | undefined, b: string | undefined): boolean =>
	COLOR_VALUES.has(property) ? (a !== undefined && b !== undefined && hexOf(a) === hexOf(b)) || a === b : a === b;

/** One instance's part, by the instance's key and the part's place in the value: what a place is found to move. */
const moved = (key: string, part: number): string => `${key}\u0000${part}`;
const partOf = (pair: string): number => Number(pair.slice(pair.lastIndexOf('\u0000') + 1));

/** Each instance's parts of a property, by its key. */
const partsBy = (instances: Instance[] | undefined, property: ValueProperty): Map<string, string[]> =>
	new Map((instances ?? []).map((i) => [i.key, allParts(i.values[property] ?? '', partsIn(property))]));

export class ValueSources {
	/** Each value's places, once found, by the commit, the story file, the property, its instances and the part drawn. */
	private readonly located = new Map<string, Promise<Located>>();
	private readonly newest = newestAnswer<Worked>((error) => ({ state: 'failed', error }));

	constructor(private readonly deps: ValueSourcesDeps) {}

	/** Where `tried`, values tried on the instances in story file `file`, are written: `building` while it is found. */
	async of(file: string, tried: TriedValue[]): Promise<Answer> {
		const { files: _files, ...answer } = await this.worked(file, tried);
		return answer;
	}

	/** The files writing `tried` changes, path to text, when every one was found and read back; else why not, in words. */
	async files(file: string, tried: TriedValue[]): Promise<Map<string, string>> {
		const worked = await this.worked(file, tried);
		if (worked.state === 'building') throw new Error('Where the values are written is still being found; save once it is.');
		if (worked.state === 'failed') throw new Error(worked.error);
		if (worked.state === 'none' || worked.values.length === 0) throw new Error('There is no value to save.');
		const refused = worked.values.find((v): v is Extract<ValueSource, { state: 'refused' }> => v.state === 'refused');
		if (refused) throw new Error(refused.why);
		return worked.files ?? new Map();
	}

	private async worked(file: string, tried: TriedValue[]): Promise<Worked> {
		if (tried.length === 0) return { state: 'none' };
		const index = await this.deps.tokens.drawn();
		if (index.state !== 'ready') return index;
		const key = `${index.key}\u0000${file}\u0000${JSON.stringify(tried)}`;
		return this.newest(key, () => this.work(index, file, tried)) ?? { state: 'building' };
	}

	private async work(index: DrawnIndex, file: string, tried: TriedValue[]): Promise<Worked> {
		// Held against the library as it is, drawn as a change is (`asIs`), so only the change differs.
		const before = (await this.deps.tokens.asIs(index)).get(file)?.light?.instances;
		if (!before) return { state: 'failed', error: 'Its stories did not draw, so where its values are written cannot be found.' };
		// Each value: its writes, found, or why it cannot be saved.
		const writes = new Map<string, { place: Place; literal: string }[]>();
		const refused = new Map<string, string>();
		for (const t of tried) {
			const r = await this.writesOf(index.key, file, t, before);
			if ('why' in r) refused.set(triedId(t), r.why);
			else writes.set(triedId(t), r.writes);
		}
		// One place written two ways is refused for the second.
		const byPlace = new Map<string, string>();
		for (const [id, ws] of writes)
			for (const w of ws) {
				const at = `${w.place.file}:${w.place.at}`;
				if (byPlace.has(at) && byPlace.get(at) !== w.literal) {
					writes.delete(id);
					refused.set(
						id,
						`It is written in the same place as another value tried (${w.place.file}, line ${w.place.line}), so they cannot be saved apart.`,
					);
				} else byPlace.set(at, w.literal);
			}
		let { files, reach, after } = await this.written(index, writes);
		// Read back: each value written must draw as asked on its instances, or it is refused and the rest written again.
		const misread = tried.flatMap((t) => {
			const drew = writes.has(triedId(t)) ? this.drawsOtherwise(t, after.get(file)) : null;
			return drew === null ? [] : [{ t, drew }];
		});
		if (misread.length > 0) {
			for (const { t, drew } of misread) {
				writes.delete(triedId(t));
				refused.set(triedId(t), `Written where it was found, it draws ${drew}, not ${t.value}, so it is not saved.`);
			}
			({ files, reach } = await this.written(index, writes));
		}
		const values: ValueSource[] = tried.map((t) => {
			const id = triedId(t);
			const why = refused.get(id);
			if (why !== undefined) return { id, state: 'refused', why };
			const places: ValuePlace[] = (writes.get(id) ?? []).map(({ place, literal }) => ({
				file: place.file,
				line: place.line,
				written: place.written,
				writes: literal,
			}));
			return { id, state: 'found', places };
		});
		return { state: 'ready', values, reach, files };
	}

	/** The library drawn with `writes`: the files they change, what they reach, and what each component drew with them. */
	private async written(index: DrawnIndex, writes: Map<string, { place: Place; literal: string }[]>) {
		const all = [...writes.values()].flat();
		if (all.length === 0) return { files: new Map<string, string>(), reach: { state: 'none' } as ChangeReach, after: new Map() };
		const files = new Map<string, string>();
		const { reach, after } = await this.deps.tokens.reachWith(
			index,
			async (reads) => {
				for (const path of new Set(all.map((w) => w.place.file)))
					files.set(
						path,
						withWrites(
							await reads.readFile(path),
							all.filter((w) => w.place.file === path),
						),
					);
				return files;
			},
			'written',
		);
		return { files, reach, after };
	}

	/** What a value tried draws instead of what was asked, on an instance it was tried on, light; null when every one draws it. */
	private drawsOtherwise(t: TriedValue, drawn: { light: { instances?: Instance[] } | null } | undefined): string | null {
		const asked = allParts(t.value, partsIn(t.property));
		const now = partsBy(drawn?.light?.instances, t.property);
		for (const key of t.targets) {
			const parts = now.get(key);
			if (parts === undefined) return 'nothing it can be read on';
			if (!asked.every((p, i) => same(t.property, parts[i], p))) return parts.join(' ');
		}
		return null;
	}

	/** What writing one tried value takes: the places to write and what, or why it cannot be saved. */
	private async writesOf(
		indexKey: string,
		file: string,
		t: TriedValue,
		before: Instance[],
	): Promise<{ writes: { place: Place; literal: string }[] } | { why: string }> {
		const drawnBy = partsBy(before, t.property);
		const drawn = drawnBy.get(t.targets[0] as string);
		// A value's instances draw it alike: that is what makes them one value.
		if (!drawn || !t.targets.every((k) => drawnBy.get(k)?.join(' ') === drawn.join(' ')))
			return { why: 'Its instances were not found in its stories as drawn, so where it is written cannot be found.' };
		const asked = allParts(t.value, partsIn(t.property));
		// The parts tried apart from what is drawn, by the part drawn there: each is written where that part is.
		const changed = drawn.map((_, i) => i).filter((i) => !same(t.property, drawn[i], asked[i]));
		const writes: { place: Place; literal: string }[] = [];
		for (const part of new Set(changed.map((i) => drawn[i] as string))) {
			if (COLOR_VALUES.has(t.property) && isNothing(part)) return { why: 'It draws no colour here, so there is no colour written to change.' };
			const located = await this.locate(indexKey, file, t, part);
			if (located.state === 'refused') return { why: located.why };
			if (located.state === 'failed') throw new Error(located.error);
			// Each instance's part tried is to be written in exactly one place: several each drawing one is a guess.
			const parts = changed.filter((i) => drawn[i] === part);
			const needed = new Set(t.targets.flatMap((key) => parts.map((i) => moved(key, i))));
			const reaching = located.places.filter((p) => [...p.moves].some((m) => needed.has(m)));
			if (reaching.length === 0)
				return {
					why: `${part} is not written in the design system's own files for it: it comes from a package, or is worked out. It cannot be saved yet.`,
				};
			const counted = reaching.flatMap((p) => [...p.moves]);
			if (new Set(counted).size !== counted.length)
				return { why: `${part} is written in ${reaching.length} places that each draw it here, so which to change cannot be said.` };
			for (const { place, moves } of reaching) {
				const at = new Set([...moves].map(partOf));
				const to = new Set([...at].map((i) => asked[i]));
				if (to.size > 1 || [...at].some((i) => !parts.includes(i)))
					return {
						why: `${place.file}, line ${place.line}, writes ${place.written} once for parts tried apart: try them together, or it cannot be saved.`,
					};
				const literal = writtenAs(place, [...to][0] as string);
				if (literal === null) return { why: `${place.file}, line ${place.line}, writes ${place.written}, which ${t.value} cannot be written as.` };
				writes.push({ place, literal });
			}
			if (![...needed].every((m) => counted.includes(m)))
				return {
					why: `Only some of it is written where it can be found (${reaching.map((r) => `${r.place.file}, line ${r.place.line}`).join('; ')}).`,
				};
		}
		return { writes };
	}

	/** The places drawn part `part` of `t`'s instances is written, found once per commit and kept. */
	private locate(indexKey: string, file: string, t: TriedValue, part: string): Promise<Located> {
		const key = [indexKey, file, t.property, t.targets.join('\u0001'), part].join('\u0000');
		let found = this.located.get(key);
		if (!found) {
			found = this.find(file, t, part);
			this.located.set(key, found);
			// One that could not be tried is tried again next time.
			void found.then((l) => l.state === 'failed' && this.located.delete(key));
		}
		return found;
	}

	/**
	 * The places drawn part `part` of `t`'s instances is written: every place it is written in the design system's files, tried
	 * **in halves** (each half written with a value of DSNR's own at once, and only a half that moves the instances tried
	 * further), down to each place alone. A place is where it is written when the instances then draw that value exactly, not
	 * when they only change: a change that breaks what draws them (a stylesheet that no longer applies) is not where the
	 * value is. A half that does not build is halved again; a place alone that does not build is not where it is.
	 */
	private async find(file: string, t: TriedValue, part: string): Promise<Located> {
		const opened = await this.deps.previews.opened('locate');
		if (opened.state !== 'open')
			return {
				state: 'failed',
				error: opened.state === 'failed' ? opened.error : 'The previews could not be built, so where it is written could not be tried.',
			};
		try {
			const texts = new Map<string, string>();
			const places: Place[] = [];
			for (const path of searchedFiles(await opened.reads.listFiles(''))) {
				const text = await opened.reads.readFile(path);
				const here = placesIn(path, text, t.property, part);
				if (here.length > 0) texts.set(path, text);
				places.push(...here);
			}
			if (places.length > MOST_PLACES)
				return {
					state: 'refused',
					why: `${part} is written in ${places.length} places in the design system's files, more than are tried (${MOST_PLACES}).`,
				};
			const probe = probeFor(t.property, part);
			/** Which instances tried, and which of their parts, read the probe with `group` written with it; null when it does not build. */
			const tried = async (group: Place[]): Promise<Set<string> | null> => {
				const files = new Map<string, string>();
				for (const path of new Set(group.map((p) => p.file))) {
					const writes = group
						.filter((p) => p.file === path)
						.flatMap((place) => {
							const literal = writtenAs(place, probe);
							return literal === null ? [] : [{ place, literal }];
						});
					files.set(path, withWrites(texts.get(path) as string, writes));
				}
				const base = await opened.build(files).catch(() => null);
				if (base === null) return null;
				const [[drawn]] = (await this.deps.measure([{ base, mode: 'light', files: [file] }])) as [[{ instances?: Instance[] } | null]];
				const now = partsBy(drawn?.instances, t.property);
				const moves = new Set<string>();
				for (const key of t.targets) (now.get(key) ?? []).forEach((p, i) => same(t.property, p, probe) && moves.add(moved(key, i)));
				return moves;
			};
			const search = async (group: Place[]): Promise<{ place: Place; moves: Set<string> }[]> => {
				const moves = await tried(group);
				if (moves !== null && moves.size === 0) return [];
				if (group.length === 1) return moves === null ? [] : [{ place: group[0] as Place, moves }];
				const half = Math.ceil(group.length / 2);
				return [...(await search(group.slice(0, half))), ...(await search(group.slice(half)))];
			};
			return { state: 'found', places: places.length === 0 ? [] : await search(places) };
		} finally {
			await opened.close();
		}
	}
}
