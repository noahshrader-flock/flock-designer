/**
 * A design system's preview page, started by the generated entry (`previewBuild.ts`), which hands it the library's own
 * React, Storybook and story files, so it never draws with a second React. **A story behaves as it does in Storybook, no
 * more:** portable stories leave out redrawing on `useArgs`, so the page supplies just that.
 */
import type * as ReactNamespace from 'react';
import { PREVIEW_COMPONENT, PREVIEW_FILE, PREVIEW_HEIGHT, PREVIEW_SHOW, PREVIEW_SPECIMEN, type SpecimenLine } from '../shared/catalog';
import { tryValues } from './instances';
import { drawSpecimens } from './specimens';

/** What a library's Storybook gives, read only for the parts named here: anything else of it is the library's own. */
type Args = Record<string, unknown>;
/** A story as portable stories compose it: a component that draws it, with what Storybook knows of it. */
type ComposedStory = ReactNamespace.ComponentType<Args> & { id?: string; args?: Args; argTypes?: Args };
/** A story file, as a module: its default export (the meta) and its stories. */
type StoryModule = { default?: { component?: unknown; render?: unknown } } & Record<string, unknown>;
/** The globals a library's preview declares, by name, with what its toolbar offers. */
type GlobalTypes = Record<string, { toolbar?: { items?: unknown[] } } | undefined>;
/** The library's `.storybook/preview`, as a module: its globals declared as a named export or on its default one. */
type PreviewModule = { default?: { globalTypes?: GlobalTypes }; globalTypes?: GlobalTypes };
/** The names of Storybook's events this page hears and says (its `core-events`). */
type ChannelEvents = Record<'UPDATE_STORY_ARGS' | 'RESET_STORY_ARGS' | 'STORY_RENDERED', string>;
/** Storybook's channel, for the events this page hears and says. */
interface Channel {
	on(event: string, listener: (said: { storyId: string; updatedArgs?: Args }) => void): void;
	emit(event: string, ...args: unknown[]): void;
}

/** What the generated entry hands the page: the library's own React and Storybook, and its story files. */
export interface PreviewDeps {
	React: typeof ReactNamespace;
	createRoot: (el: Element) => { render(node: ReactNamespace.ReactNode): void };
	flushSync: (draw: () => void) => void;
	composeStories: (module: StoryModule) => Record<string, ComposedStory>;
	setProjectAnnotations: (annotations: object[]) => void;
	/** The library's `.storybook/preview`, as a module; null for one with none. */
	preview: PreviewModule | null;
	/** Each story file, by its path, as a dynamic import. */
	files: Record<string, () => Promise<StoryModule>>;
	/**
	 * Storybook's preview API and its events (Storybook 8 and later's `storybook/internal/preview-api` and `core-events`), for
	 * its channel; null where the library's Storybook has none.
	 */
	channel: Promise<[{ addons: { getChannel(): Channel } }, ChannelEvents] | null>;
}

/**
 * Dark as the library's Storybook draws it, when the page is in dark (its theme script answers from its address): its themes
 * addon's `theme` global, and every global the library's preview declares with a `dark` option in its toolbar (Primer's
 * `colorScheme`), declared as a named export or on its default one.
 */
const darkGlobals = (declared: GlobalTypes): Record<string, string> => {
	const dark: Record<string, string> = { theme: 'dark' };
	for (const [name, type] of Object.entries(declared)) {
		const value = (type?.toolbar?.items ?? [])
			.map((item) => (typeof item === 'string' ? item : (item as { value?: unknown } | null)?.value))
			.find((v): v is string => typeof v === 'string' && v.toLowerCase() === 'dark');
		if (value !== undefined) dark[name] = value;
	}
	return dark;
};

/**
 * A story that only sets args and sets `checked` has it held by React for good, so a click does nothing; it is given as
 * `defaultChecked` instead. Only `checked`: `value` is also what a label shows (FUI's PopoverLineItem), so it is left
 * alone. A story that draws itself holds its own values.
 */
const startingValues = (args: Args) => ('checked' in args ? { checked: undefined, defaultChecked: args.checked } : {});

/** Whether a story draws itself: a function, or one with a render of its own. */
const renders = (story: unknown): boolean => typeof story === 'function' || typeof (story as { render?: unknown } | null)?.render === 'function';

const spaced = (name: string) => name.replace(/([a-z0-9])([A-Z])/g, '$1 $2');

/** Draws the page: the story file its address names, or a type specimen, and tells the frame's owner its height. */
export const startPreview = ({ React, createRoot, flushSync, composeStories, setProjectAnnotations, preview, files, channel }: PreviewDeps): void => {
	const h = React.createElement;
	// What the page tells whoever reads it, by name, on its window.
	const page = window as unknown as Record<string, unknown>;
	// Given as Storybook 8.2 and later take it (`initialGlobals`) and as earlier ones do (`globals`).
	const annotations: object[] = preview === null ? [] : [preview];
	if (matchMedia('(prefers-color-scheme: dark)').matches) {
		const dark = darkGlobals(preview === null ? {} : { ...preview.default?.globalTypes, ...preview.globalTypes });
		annotations.push({ initialGlobals: dark, globals: dark });
	}
	if (annotations.length > 0) setProjectAnnotations(annotations);

	class Boundary extends React.Component<{ children?: ReactNamespace.ReactNode }, { error: unknown }> {
		override state = { error: null as unknown };
		static getDerivedStateFromError(error: unknown) {
			return { error };
		}
		override render() {
			const { error } = this.state;
			return error ? h('pre', { className: 'fd-error' }, String((error as Error)?.message ?? error)) : this.props.children;
		}
	}

	// Storybook's channel (8 and later), for the two parts portable stories leave out: a story drawn again when it calls
	// useArgs' updateArgs or resetArgs, and STORY_RENDERED once drawn, which is when decorators' effects run (the themes
	// addon setting the theme).
	const argsOf = new Map<string, ReactNamespace.Dispatch<ReactNamespace.SetStateAction<Args>>>();
	const storybook = channel.then((given) => {
		if (given === null) return null;
		const [{ addons }, events] = given;
		const said = addons.getChannel();
		said.on(events.UPDATE_STORY_ARGS, ({ storyId, updatedArgs }) => argsOf.get(storyId)?.((args) => ({ ...args, ...updatedArgs })));
		said.on(events.RESET_STORY_ARGS, ({ storyId }) => argsOf.get(storyId)?.({}));
		return { rendered: (id: string) => said.emit(events.STORY_RENDERED, id) };
	});
	const Live = ({ Story, drawsItself }: { Story: ComposedStory; drawsItself: boolean }) => {
		const [args, setArgs] = React.useState<Args>({});
		React.useEffect(() => {
			const id = Story.id ?? '';
			argsOf.set(id, setArgs);
			return () => void argsOf.delete(id);
		}, [Story.id]);
		return h(Story, { ...(drawsItself ? {} : startingValues(Story.args ?? {})), ...args });
	};

	const root = createRoot(document.getElementById('root') as Element);
	const fail = (error: unknown) => root.render(h('pre', { className: 'fd-error' }, String((error as Error)?.message ?? error)));
	const tell = () => parent.postMessage({ [PREVIEW_HEIGHT]: Math.ceil(document.documentElement.scrollHeight) }, '*');
	new ResizeObserver(tell).observe(document.body);

	// One story file drawn in place of the last, so reading every story loads the page once. The last asked for wins: one
	// asked before it (the page's own, as it opens) that loads after it draws nothing.
	let shown = 0;
	const show = (file: string | null, vary?: { stories: string[]; props: { name: string; values: unknown[] }[] } | null): Promise<void> => {
		const turn = ++shown;
		// The component the stories are of, as their default export names it, and the props its stories name as controls: what
		// reads its values finds its instances by it, and tells them apart by those. Never the last file's.
		page[PREVIEW_COMPONENT] = null;
		const load = file === null ? undefined : files[file];
		if (!load) return Promise.resolve(fail('There is no such story file in this build.'));
		return load().then((m) => {
			if (turn !== shown) return;
			const stories = Object.entries(composeStories(m));
			try {
				const component = m.default?.component;
				// Varied, the props varied are what tells its instances apart.
				const controls = vary
					? vary.props.map((p) => p.name)
					: [...new Set(stories.flatMap(([, Story]) => Object.keys({ ...Story.args, ...Story.argTypes })))];
				page[PREVIEW_COMPONENT] = component ? { component, controls } : null;
			} catch {
				// A file whose stories cannot be asked is drawn all the same; only its values are not read.
			}
			const drawsItself = (name: string) => renders(m[name]) || typeof m.default?.render === 'function';
			// Each value of each prop asked for, on the story asked for, else the file's first drawn from its args, else
			// its first: a section for each, named for the story and the value, in place of the stories.
			const base = (vary && stories.find(([name]) => vary.stories.includes(name))) || stories.find(([name]) => !drawsItself(name)) || stories[0];
			const drawn: [string, ComposedStory, Args | null][] = !vary
				? stories.map(([name, Story]) => [name, Story, null])
				: !base
					? []
					: vary.props.flatMap(({ name: prop, values }) =>
							values.map((value): [string, ComposedStory, Args] => [`${base[0]} · ${prop}=${String(value)}`, base[1], { [prop]: value }]),
						);
			// Drawn at once, not at the next frame: a page drawn where nobody sees it gets no frames.
			flushSync(() =>
				root.render(
					h(
						React.Fragment,
						{ key: file },
						...drawn.map(([name, Story, args]) =>
							h(
								'section',
								{ key: name, className: 'fd-story', 'data-story': name },
								h('h4', { className: 'fd-name' }, spaced(name)),
								h(Boundary, null, args ? h(Story, args) : h(Live, { Story, drawsItself: drawsItself(name) })),
							),
						),
					),
				),
			);
			return storybook.then((said) => {
				for (const id of new Set(drawn.map(([, Story]) => Story.id).filter((named): named is string => !!named))) said?.rendered(id);
			});
		}, fail);
	};
	page[PREVIEW_SHOW] = show;

	tryValues();

	// A type specimen when the address asks for one, in place of a story file.
	const asked = new URLSearchParams(location.search);
	const specimen = asked.get(PREVIEW_SPECIMEN);
	if (specimen === null) void show(asked.get(PREVIEW_FILE));
	else {
		try {
			drawSpecimens(JSON.parse(specimen) as SpecimenLine[]).then(tell, fail);
		} catch (error) {
			fail(error);
		}
	}
};
