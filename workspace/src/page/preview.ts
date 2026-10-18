/**
 * A design system's preview page, the part DSNR writes: started by the generated entry (`core/services/storyPreviews.ts`,
 * `previewEntry`), which imports the library's own React, Storybook and story files and hands them here, so the page is
 * drawn with the library's React and never a second one. Bundled into the entry as text (`?page`). Page code, typed.
 *
 * **A story behaves as it does in Storybook, no more.** Portable stories leave out the one part of Storybook's preview
 * that redraws a story when it updates its own args (`useArgs`), so a story wired that way (tabs, selects, drawers in
 * FUI) would not respond; the page supplies just that. A story that pins a value without it does not respond in
 * Storybook either, and does not here: making it respond is the story's to do, in the library.
 */
import type * as ReactNamespace from 'react';
import { PREVIEW_COMPONENT, PREVIEW_FILE, PREVIEW_HEIGHT, PREVIEW_SHOW, PREVIEW_SPECIMEN, type SpecimenLine } from '../shared/catalog';
import { tryValues } from './instances';
import { drawSpecimens } from './specimens';

/** What a library's Storybook gives, which DSNR reads as it is: its preview set-up, its stories, its args. */
type Loose = any;

/** What the generated entry hands the page: the library's own React and Storybook, and its story files. */
export interface PreviewDeps {
	React: typeof ReactNamespace;
	createRoot: (el: Element) => { render(node: ReactNamespace.ReactNode): void };
	flushSync: (draw: () => void) => void;
	composeStories: (module: Loose) => Record<string, Loose>;
	setProjectAnnotations: (annotations: Loose[]) => void;
	/** The library's `.storybook/preview`, as a module; null for one with none. */
	preview: Loose | null;
	/** Each story file, by its path, as a dynamic import. */
	files: Record<string, () => Promise<Loose>>;
	/**
	 * Storybook's preview API and its events (Storybook 8 and later's `storybook/internal/preview-api` and `core-events`), for
	 * its channel; null where the library's Storybook has none.
	 */
	channel: Promise<[{ addons: { getChannel(): Loose } }, Record<string, string>] | null>;
}

/**
 * Dark as the library's Storybook draws it, when the page is in dark (its theme script answers from its address): its themes
 * addon's `theme` global, and every global the library's preview declares with a `dark` option in its toolbar (Primer's
 * `colorScheme`), declared as a named export or on its default one.
 */
const darkGlobals = (declared: Record<string, Loose>): Record<string, string> => {
	const dark: Record<string, string> = { theme: 'dark' };
	for (const [name, type] of Object.entries(declared)) {
		const value = ((type?.toolbar?.items ?? []) as Loose[])
			.map((item) => (typeof item === 'string' ? item : item?.value))
			.find((v): v is string => typeof v === 'string' && v.toLowerCase() === 'dark');
		if (value !== undefined) dark[name] = value;
	}
	return dark;
};

/**
 * A story that only sets args, with no render of its own, and sets `checked` (a switch, a checkbox) has it held by React
 * for good, so a click does nothing. It is given as where the control starts instead, by React's own rule for a checkable
 * control: `defaultChecked`. Only `checked`, which means one thing: `value` is also what a label shows (FUI's
 * PopoverLineItem), so it is left alone. A story that draws itself holds its own values, as with useArgs.
 */
const startingValues = (args: Record<string, unknown>) => ('checked' in args ? { checked: undefined, defaultChecked: args.checked } : {});

const spaced = (name: string) => name.replace(/([a-z0-9])([A-Z])/g, '$1 $2');

/** Draws the page: the story file its address names, or a type specimen, and tells the frame's owner its height. */
export const startPreview = ({ React, createRoot, flushSync, composeStories, setProjectAnnotations, preview, files, channel }: PreviewDeps): void => {
	const h = React.createElement;
	// Given as Storybook 8.2 and later take it (`initialGlobals`) and as earlier ones do (`globals`).
	const annotations: Loose[] = preview === null ? [] : [preview];
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

	// Storybook's channel, as its preview speaks on it (Storybook 8 and later), for the two parts of its preview portable stories
	// leave out. When a story calls useArgs' updateArgs or resetArgs, it is drawn again with its args as updated; and once a
	// story is drawn, it is said to be, which is when its decorators' effects run (the themes addon setting the theme). Nothing
	// else, so a story behaves here as it does in Storybook.
	const argsOf = new Map<string, (change: Loose) => void>();
	const storybook = channel.then((given) => {
		if (given === null) return null;
		const [{ addons }, events] = given;
		const said = addons.getChannel();
		said.on(events.UPDATE_STORY_ARGS, ({ storyId, updatedArgs }: Loose) => argsOf.get(storyId)?.((args: Loose) => ({ ...args, ...updatedArgs })));
		said.on(events.RESET_STORY_ARGS, ({ storyId }: Loose) => argsOf.get(storyId)?.({}));
		return { rendered: (id: string) => said.emit(events.STORY_RENDERED, id) };
	});
	const Live = ({ Story, drawsItself }: { Story: Loose; drawsItself: boolean }) => {
		const [args, setArgs] = React.useState({});
		React.useEffect(() => {
			argsOf.set(Story.id, setArgs);
			return () => void argsOf.delete(Story.id);
		}, [Story.id]);
		return h(Story, { ...(drawsItself ? {} : startingValues(Story.args ?? {})), ...args });
	};

	const root = createRoot(document.getElementById('root') as Element);
	const fail = (error: unknown) => root.render(h('pre', { className: 'fd-error' }, String((error as Error)?.message ?? error)));
	const tell = () => parent.postMessage({ [PREVIEW_HEIGHT]: Math.ceil(document.documentElement.scrollHeight) }, '*');
	new ResizeObserver(tell).observe(document.body);

	// One story file drawn in place of the last, resolved once it is on the page. What reads every story (T6) draws them one
	// after another in one page this way, rather than loading the page again for each.
	// The last asked for is what is drawn: one asked before it (the page's own, as it opens) that loads after it draws nothing.
	let shown = 0;
	const show = (file: string | null, vary?: { stories: string[]; props: { name: string; values: unknown[] }[] } | null): Promise<void> => {
		const turn = ++shown;
		// The component the stories are of, as their default export names it, and the props its stories name as controls: what
		// reads its values finds its instances by it, and tells them apart by those. Never the last file's.
		(window as Loose)[PREVIEW_COMPONENT] = null;
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
				(window as Loose)[PREVIEW_COMPONENT] = component ? { component, controls } : null;
			} catch {
				// A file whose stories cannot be asked is drawn all the same; only its values are not read.
			}
			const drawsItself = (name: string) =>
				typeof m[name] === 'function' || typeof m[name]?.render === 'function' || typeof m.default?.render === 'function';
			// Each value of each prop asked for (Phase 5), on the story asked for, else the file's first drawn from its args, else
			// its first: a section for each, named for the story and the value, in place of the stories.
			const base = (vary && stories.find(([name]) => vary.stories.includes(name))) || stories.find(([name]) => !drawsItself(name)) || stories[0];
			const drawn: [string, Loose, Record<string, unknown> | null][] = !vary
				? stories.map(([name, Story]) => [name, Story, null])
				: !base
					? []
					: vary.props.flatMap(({ name: prop, values }) =>
							values.map((value): [string, Loose, Record<string, unknown>] => [`${base[0]} · ${prop}=${String(value)}`, base[1], { [prop]: value }]),
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
				for (const id of new Set(drawn.map(([, Story]) => Story.id as string).filter(Boolean))) said?.rendered(id);
			});
		}, fail);
	};
	(window as Loose)[PREVIEW_SHOW] = show;

	// Values a tab tries on the component's instances, set over the library's own and taken off again (Phase 2).
	tryValues();

	// A type specimen when the address asks for one (R3), in place of a story file.
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
