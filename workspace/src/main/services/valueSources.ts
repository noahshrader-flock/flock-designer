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
import { allParts, partsIn } from '../../shared/valueParts';
import type { ComponentTokens, DrawnIndex, Instance, Measure } from './componentTokens';
import { isNothing } from './tokenTags';
import { mergeTexts } from './git';
import { newestAnswer } from './newestAnswer';
import type { ValueAgent } from './valueAgent';
import { drawsOtherwise, partsBy, same } from './valueReadBack';
import type { OpenedBuild } from './storyPreviews';
import { type Place, placesIn, probeFor, searchable, searchedFiles, withWrites, writtenAs } from './valueLocator';

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
		const { property, value, targets, follows } = o;
		if (
			(VALUE_PROPERTIES as readonly unknown[]).includes(property) &&
			text(value, 100) &&
			Array.isArray(targets) &&
			targets.length > 0 &&
			targets.length <= 500 &&
			targets.every((k) => text(k, 400)) &&
			(follows === undefined || text(follows, 200))
		)
			return { property: property as ValueProperty, value, targets: targets as string[], ...(follows === undefined ? {} : { follows }) };
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
	/** What the agent has written for a value, when the person had it write one (`ValueAgent`). */
	agent: Pick<ValueAgent, 'of'>;
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

/** How a value is written: in the places it is found written in, or as the agent wrote it (Phase 4.5, 4.6). */
type Write =
	{ by: 'place'; writes: { place: Place; literal: string }[] } | { by: 'agent'; files: Map<string, string>; places: ValuePlace[]; said: string };

/** An answer, with the files it writes kept here for Save: never sent. */
type Worked = Answer & { files?: Map<string, string> };

/** One instance's part, by the instance's key and the part's place in the value: what a place is found to move. */
const moved = (key: string, part: number): string => `${key}\u0000${part}`;
const partOf = (pair: string): number => Number(pair.slice(pair.lastIndexOf('\u0000') + 1));

export class ValueSources {
	/** Each value's places, once found, by the story file, the property, its instances and the part drawn, for the commit drawn (`locatedFor`). */
	private readonly located = new Map<string, Promise<Located>>();
	private locatedFor: string | null = null;
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
		if (worked.values.some((v) => v.state === 'writing')) throw new Error('The agent is still writing a value; save once it has.');
		return worked.files ?? new Map();
	}

	private async worked(file: string, tried: TriedValue[]): Promise<Worked> {
		if (tried.length === 0) return { state: 'none' };
		const index = await this.deps.tokens.drawn();
		if (index.state !== 'ready') return index;
		// What the agent has written for each, as part of what the answer is for: it is worked out again when that changes.
		const agent = tried.map((t) => this.deps.agent.of(index, file, t)?.state ?? '');
		const key = `${index.key}\u0000${file}\u0000${JSON.stringify(tried)}\u0000${agent.join()}`;
		return this.newest(key, () => this.work(index, file, tried)) ?? { state: 'building' };
	}

	private async work(index: DrawnIndex, file: string, tried: TriedValue[]): Promise<Worked> {
		// Held against the library as it is, drawn as a change is (`asIs`), so only the change differs.
		const drawing = (await this.deps.tokens.asIs(index)).get(file)?.light;
		const before = drawing?.instances;
		// A rem written in the library is of the page's root size, as it was drawn.
		const perRem = drawing?.rootPx ?? 16;
		if (!before) return { state: 'failed', error: 'Its stories did not draw, so where its values are written cannot be found.' };
		// Each value: the places it is found written in, what the agent wrote for it, being written, or why it cannot be saved.
		const writes = new Map<string, Write>();
		const sources = new Map<string, ValueSource>();
		for (const t of tried) {
			const id = triedId(t);
			const agent = this.deps.agent.of(index, file, t);
			// A value to follow a token is the agent's to write; one found where it is written, the locator's.
			const found = t.follows === undefined ? await this.writesOf(index.key, file, t, before, perRem) : null;
			if (found && !('why' in found)) writes.set(id, { by: 'place', writes: found.writes });
			else if (agent?.state === 'written') writes.set(id, { by: 'agent', files: agent.files, places: agent.places, said: agent.said });
			else if (agent?.state === 'writing') sources.set(id, { id, state: 'writing' });
			else {
				const offer = t.follows === undefined ? 'write' : 'follow';
				const why = agent?.state === 'refused' ? agent.why : found && 'why' in found ? found.why : `To follow ${t.follows}, the agent writes it.`;
				sources.set(id, { id, state: 'refused', why, agent: offer });
			}
		}
		// One place written two ways is refused for the second.
		const byPlace = new Map<string, string>();
		for (const [id, w] of writes) {
			if (w.by !== 'place') continue;
			for (const { place, literal } of w.writes) {
				const at = `${place.file}:${place.at}`;
				if (byPlace.has(at) && byPlace.get(at) !== literal) {
					writes.delete(id);
					sources.set(id, {
						id,
						state: 'refused',
						why: `It is written in the same place as another value tried (${place.file}, line ${place.line}), so they cannot be saved apart.`,
					});
				} else byPlace.set(at, literal);
			}
		}
		let { files, reach, after, clashed } = await this.written(index, writes);
		// Read back: each value written must draw as asked on its instances, or it is refused and the rest written again.
		const misread = tried.flatMap((t) => {
			const drew = writes.has(triedId(t)) && !clashed.has(triedId(t)) ? drawsOtherwise(t, after.get(file)) : null;
			return drew === null ? [] : [{ t, drew }];
		});
		for (const id of clashed) {
			writes.delete(id);
			sources.set(id, {
				id,
				state: 'refused',
				why: 'The agent wrote it in the same lines as another value tried, so they cannot be saved together.',
			});
		}
		for (const { t, drew } of misread) {
			const by = writes.get(triedId(t))?.by === 'agent' ? 'by the agent' : 'where it was found';
			writes.delete(triedId(t));
			sources.set(triedId(t), { id: triedId(t), state: 'refused', why: `Written ${by}, it draws ${drew}, not ${t.value}, so it is not saved.` });
		}
		if (misread.length > 0 || clashed.size > 0) ({ files, reach } = await this.written(index, writes));
		const values: ValueSource[] = tried.map((t) => {
			const id = triedId(t);
			const w = writes.get(id);
			if (w?.by === 'agent') return { id, state: 'found', places: w.places, by: 'agent', said: w.said };
			if (w?.by === 'place')
				return {
					id,
					state: 'found',
					places: w.writes.map(({ place, literal }) => ({ file: place.file, line: place.line, written: place.written, writes: literal })),
				};
			return sources.get(id) as ValueSource;
		});
		return { state: 'ready', values, reach, files };
	}

	/**
	 * The library drawn with `writes`: the files they change, what they reach, and what each component drew with them. The
	 * places found are written in the commit's text; what the agent wrote is put together with them as git puts two changes
	 * together, and one that changes the same lines as another is not written (`clashed`).
	 */
	private async written(index: DrawnIndex, writes: Map<string, Write>) {
		const clashed = new Set<string>();
		if (writes.size === 0) return { files: new Map<string, string>(), reach: { state: 'none' } as ChangeReach, after: new Map(), clashed };
		const files = new Map<string, string>();
		const { reach, after } = await this.deps.tokens.reachWith(
			index,
			async (reads) => {
				const placed = [...writes.values()].flatMap((w) => (w.by === 'place' ? w.writes : []));
				for (const path of new Set(placed.map((w) => w.place.file)))
					files.set(
						path,
						withWrites(
							await reads.readFile(path),
							placed.filter((w) => w.place.file === path),
						),
					);
				for (const [id, w] of writes) {
					if (w.by !== 'agent') continue;
					const merged = new Map<string, string>();
					for (const [path, text] of w.files) {
						const base = await reads.readFile(path).catch(() => '');
						const together = await mergeTexts(base, files.get(path) ?? base, text);
						if (together === null) break;
						merged.set(path, together);
					}
					if (merged.size === w.files.size) for (const [path, text] of merged) files.set(path, text);
					else clashed.add(id);
				}
				return files;
			},
			'written',
		);
		return { files, reach, after, clashed };
	}

	/** What writing one tried value takes: the places to write and what, or why it cannot be saved. */
	private async writesOf(
		indexKey: string,
		file: string,
		t: TriedValue,
		before: Instance[],
		perRem: number,
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
			if (!searchable(t.property, part))
				return { why: `${part} is drawn in a form DSNR cannot look for in the source yet, so where it is written cannot be found.` };
			const located = await this.locate(indexKey, file, t, part, perRem);
			if (located.state === 'refused') return { why: located.why };
			if (located.state === 'failed') throw new Error(located.error);
			// Each instance's part tried is to be written in exactly one place: several each drawing one is a guess.
			const parts = changed.filter((i) => drawn[i] === part);
			const needed = new Set(t.targets.flatMap((key) => parts.map((i) => moved(key, i))));
			const reaching = located.places.filter((p) => [...p.moves].some((m) => needed.has(m)));
			if (reaching.length === 0)
				return {
					why: `${part} is not written as a value in the design system's own files for it: it comes from a package, a utility class or a variable, or is worked out.`,
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
	private locate(indexKey: string, file: string, t: TriedValue, part: string, perRem: number): Promise<Located> {
		// Kept for the commit drawn: once the library moves, what was found on the one before is let go.
		if (this.locatedFor !== indexKey) {
			this.located.clear();
			this.locatedFor = indexKey;
		}
		const key = [file, t.property, t.targets.join('\u0001'), part].join('\u0000');
		let found = this.located.get(key);
		if (!found) {
			found = this.find(file, t, part, perRem);
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
	private async find(file: string, t: TriedValue, part: string, perRem: number): Promise<Located> {
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
				const here = placesIn(path, text, t.property, part, perRem);
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
				// One that no longer draws an instance tried is halved again, as one that does not build is: what draws them is not lost.
				if (!t.targets.every((key) => now.has(key))) return null;
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
