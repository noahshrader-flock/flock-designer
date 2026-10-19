import type { ComponentVariants as Answer, DeclaredProp } from '../../../shared/contract';
import type { ComponentTokens, Drawn, DrawnIndex } from './componentTokens';
import type { Measure } from '../../ports';
import { type ComponentProps, programFor, propsOf } from './componentProps';
import { readValues } from './componentValues';
import { NOT_VARIANT } from '../../../shared/valueParts';
import { newestAnswer } from '../platform/newestAnswer';
import type { StoryPreview } from '../../../shared/contract';

export interface ComponentVariantsDeps {
	tokens: Pick<ComponentTokens, 'drawn' | 'asIs'>;
	previews: { copy(): Promise<string | Exclude<StoryPreview, { state: 'ready' }>>; preview(): Promise<StoryPreview> };
	measure: Measure;
	typeLibs: string | null;
	/** The design system's package in its repository, in a monorepo; '' for the repository itself. */
	folder: () => string;
}

/** Props its story was given but did not draw with, because the story sets them itself, so each value draws the same. */
const fixedIn = (drawn: Drawn, props: DeclaredProp[]): string[] =>
	props
		.filter(({ name, values }) => {
			if (NOT_VARIANT.test(name)) return false;
			return values.some((value) =>
				(drawn.instances ?? []).filter((i) => i.story.endsWith(` · ${name}=${value}`)).some((i) => i.props[name] !== String(value)),
			);
		})
		.map((p) => p.name);

/** How many of its stories are drawn to find one that takes its props: each is a drawing of its own. */
const MOST_STORIES_TRIED = 3;

export class ComponentVariants {
	private program: { key: string; made: ReturnType<typeof programFor> } | null = null;
	private readonly newest = newestAnswer<Answer>((error) => ({ state: 'failed', error }));

	constructor(private readonly deps: ComponentVariantsDeps) {}

	async of(file: string): Promise<Answer> {
		const index = await this.deps.tokens.drawn();
		if (index.state !== 'ready') return index;
		return this.newest(`${index.key}\u0000${file}`, () => this.work(index, file)) ?? { state: 'building' };
	}

	private async declared(index: DrawnIndex, file: string): Promise<ComponentProps | null> {
		const libs = this.deps.typeLibs;
		if (libs === null) throw new Error("The compiler's type libraries are not with the app, so its props cannot be read.");
		const copy = await this.deps.previews.copy();
		if (typeof copy !== 'string') throw new Error('The previews could not be built, so its props could not be read.');
		if (this.program?.key !== index.key) {
			const made = programFor(copy, this.deps.folder(), index.built.order, libs);
			this.program = { key: index.key, made };
			// One that could not be made is made again on the next ask.
			made.catch(() => this.program?.made === made && (this.program = null));
		}
		const { ts, program } = await this.program.made;
		return propsOf(ts, program, copy, file);
	}

	/** Only stories that draw it once, so each section is one instance with one prop changed, not a story that draws every case. */
	private async storiesFor(index: DrawnIndex, file: string): Promise<string[]> {
		const instances = (await this.deps.tokens.asIs(index)).get(file)?.light?.instances ?? [];
		const counts = new Map<string, number>();
		for (const i of instances) counts.set(i.story, (counts.get(i.story) ?? 0) + 1);
		return [...counts].filter(([, n]) => n === 1).map(([story]) => story);
	}

	/**
	 * Found by drawing, since a story written as a function may pass its args on or not and only drawing it says which.
	 * Null when there are no stories, for the page's own pick.
	 */
	private async storyTaking(
		base: string,
		file: string,
		props: DeclaredProp[],
		stories: string[],
	): Promise<{ story: string; drawn: Drawn | null } | null> {
		let best: { story: string; drawn: Drawn | null; fixed: number } | null = null;
		for (const story of stories.slice(0, MOST_STORIES_TRIED)) {
			const [[drawn]] = (await this.deps.measure([{ base, mode: 'light', files: [file], vary: { stories: [story], props } }])) as [[Drawn | null]];
			const fixed = drawn ? fixedIn(drawn, props).length : props.length;
			if (best === null || fixed < best.fixed) best = { story, drawn, fixed };
			if (fixed === 0) break;
		}
		return best;
	}

	private async work(index: DrawnIndex, file: string): Promise<Answer> {
		const declared = await this.declared(index, file);
		if (declared === null) return { state: 'none' };
		const { props, unvaried } = declared;
		if (props.length === 0) return { state: 'ready', props, fixed: [], unvaried, values: { state: 'none-drawn' } };
		const plain = await this.deps.previews.preview();
		if (plain.state !== 'ready') throw new Error('The previews could not be built, so its variants could not be drawn.');
		// In light only, which is what the tab shows of them.
		const { tags, tokens, tagged } = index.built.reading;
		const taking = await this.storyTaking(plain.base, file, props, await this.storiesFor(index, file));
		const vary = { stories: taking === null ? [] : [taking.story], props };
		const run = (base: string) => ({ base, mode: 'light' as const, files: [file], vary });
		// The story taken is drawn already, as it is, in finding it: drawn again only with the tags, or for the page's own pick.
		const [asIs, withTags] =
			taking?.drawn != null
				? [[taking.drawn], ...(tagged === null ? [] : await this.deps.measure([run(tagged)]))]
				: await this.deps.measure([run(plain.base), ...(tagged === null ? [] : [run(tagged)])]);
		const light = asIs?.[0];
		if (!light) throw new Error('Its story did not draw with its props changed, so its variants could not be read.');
		const values = readValues({ plain: light, tagged: withTags?.[0] ?? null }, undefined, tags, tokens);
		return { state: 'ready', props, fixed: fixedIn(light, props), unvaried, values };
	}
}
