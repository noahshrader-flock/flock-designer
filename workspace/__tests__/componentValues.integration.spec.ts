import { type Server, createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { build } from 'esbuild';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PREVIEW_COMPONENT, PREVIEW_SHOW, PREVIEW_TRY } from '../src/shared/catalog';
import { FIND_INSTANCES, TRY_VALUES } from './pageInstances';
import { chromeHeadless } from '../src/core/services/browser/chromeHeadless';
import { NO_CHROME } from './realChrome';

/** The preview page is minified as the previews are, so the component is found by identity and not by name. */

const PAGE_SCRIPT = `
import { cloneElement, createElement as h, forwardRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';

const Button = forwardRef(function Button({ size = 'md', variant = 'primary', disabled = false, children, onClick, ...rest }, ref) {
	return h('button', {
		ref, onClick, disabled, 'aria-label': 'Go', ...rest,
		style: { height: size === 'sm' ? 28 : 36, padding: '0 10px', borderRadius: 8, border: 0, color: '#fff', background: variant === 'primary' ? '#108062' : 'transparent' },
	}, h('span', { style: { padding: 4 } }, children));
});
// Another component that draws the button inside it: the button is still one instance, its own top element.
const Toolbar = ({ children }) => h('div', { style: { display: 'flex', gap: 8, padding: 12 } }, children);
// One that draws only what it is given, copied with more props, as a tooltip does: nothing on the page is its own.
const Tip = ({ children }) => cloneElement(children, { title: 'More' });
// One that is drawn inside another of itself: each is an instance, the outer first.
const Box = ({ tone, children }) => h('div', { style: { padding: tone === 'outer' ? 16 : 4 } }, children ?? 'Box');

// A field drawn with a border at the bottom only, as an underlined input is.
const Field = () => h('input', { style: { border: 0, borderBottom: '2px solid rgb(1, 2, 3)', height: 32 } });
// Tabs whose selected one changes its props and its class alone, on the same element, as a tab selected does.
const Tab = ({ selected, onClick, children }) => h('button', { className: selected ? 'tab on' : 'tab', onClick, style: { height: 30 } }, children);
const Tabs = () => {
	const [on, setOn] = useState(0);
	return h('div', null, ['One', 'Two'].map((name, i) => h(Tab, { key: name, selected: on === i, onClick: () => setOn(i) }, name)));
};

const files = {
	'field.stories.tsx': { meta: { component: Field }, stories: { Default: () => h(Field) } },
	'tabs.stories.tsx': { meta: { component: Tab }, stories: { Default: () => h(Tabs) } },
	'button.stories.tsx': {
		meta: { component: Button, args: { size: 'md' }, argTypes: { variant: {} } },
		stories: {
			Sizes: () => h(Toolbar, null, h(Button, { size: 'sm', onClick: () => {} }, 'Small'), h(Button, { size: 'md' }, 'Medium')),
			Ghost: () => h(Button, { variant: 'ghost', disabled: true, 'data-testid': 'g' }, 'Ghost'),
			// Drawn with no room on the page: passed over.
			Hidden: () => h(Button, { size: 'sm', hidden: true }, 'Hidden'),
		},
	},
	'tip.stories.tsx': { meta: { component: Tip }, stories: { Default: () => h(Tip, null, h(Button, { size: 'sm' }, 'Save')) } },
	'box.stories.tsx': { meta: { component: Box }, stories: { Nested: () => h(Box, { tone: 'outer' }, h(Box, { tone: 'inner' })) } },
	// A file drawn by a React that keeps its record of what it drew another way: its elements carry none of it.
	'unrecorded.stories.tsx': { unrecorded: true, meta: { component: Button }, stories: { Default: () => h(Button, null, 'Save') } },
	// A file whose stories threw, as the page says it in their place.
	'throws.stories.tsx': { meta: { component: Button }, stories: { Default: () => h('pre', { className: 'fd-error' }, 'Not installed here') } },
	// A file whose component cannot be asked for: reading its instances fails, and nothing else of its drawing does.
	'broken.stories.tsx': { broken: true, meta: {}, stories: { Default: () => h(Button, null, 'Broken') } },
	'loose.stories.tsx': { meta: {}, stories: { Plain: () => h(Button, null, 'Plain') } },
};

const root = createRoot(document.getElementById('root'));
window[${JSON.stringify(PREVIEW_SHOW)}] = async (file) => {
	const { meta, stories, broken, unrecorded } = files[file];
	window[${JSON.stringify(PREVIEW_COMPONENT)}] = broken
		? { get component() { throw new Error('No component here'); }, controls: [] }
		: meta.component ? { component: meta.component, controls: Object.keys({ ...meta.args, ...meta.argTypes }) } : null;
	flushSync(() => root.render(Object.entries(stories).map(([name, Story]) => h('section', { key: name, 'data-story': name }, h(Story)))));
	if (unrecorded) for (const el of document.querySelectorAll('[data-story] *')) for (const k of Object.keys(el)) if (k.startsWith('__react')) delete el[k];
};

// The values a tab tries, as the preview page hears them.
${TRY_VALUES}
`;

let server: Server;
let base: string;
const headless = chromeHeadless();
beforeAll(async () => {
	const bundled = await build({
		stdin: { contents: PAGE_SCRIPT, resolveDir: join(__dirname, '..'), loader: 'js' },
		bundle: true,
		minify: true,
		write: false,
		format: 'iife',
		define: { 'process.env.NODE_ENV': '"production"' },
	});
	const page = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Previews</title></head>
<body style="margin:0;background:#fff;font:16px sans-serif"><div id="root"></div><script>${bundled.outputFiles[0]?.text ?? ''}</script></body></html>`;
	server = createServer((_req, res) => res.writeHead(200, { 'content-type': 'text/html' }).end(page));
	await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
	base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/previews/`;
}, 60_000);
afterAll(async () => {
	await headless.close();
	await new Promise((r) => server.close(r));
});

describe.skipIf(NO_CHROME)('a component’s instances, in the browser on this machine', () => {
	type Read = NonNullable<Awaited<ReturnType<typeof headless.measure>>[number][number]>;
	const FILES = [
		'button.stories.tsx',
		'loose.stories.tsx',
		'tip.stories.tsx',
		'box.stories.tsx',
		'broken.stories.tsx',
		'throws.stories.tsx',
		'unrecorded.stories.tsx',
	];

	it('finds each by the component the stories name, with its top element’s values, each side as it is, and the props that say its variant', async () => {
		const [[drawn, loose]] = (await headless.measure([{ base, mode: 'light', files: FILES.slice(0, 2) }])) as [[Read, Read]];
		expect(drawn.component).toBe(true);
		expect(drawn.controls).toEqual(['size', 'variant']);
		// Three buttons, in the order drawn: the toolbar around two of them, the span inside each and the one with no room are
		// not instances; its handlers, its label for assistive technology and its test id are not what makes it a variant.
		expect(drawn.instances?.map((i) => [i.story, i.props])).toEqual([
			['Sizes', { size: 'sm' }],
			['Sizes', { size: 'md' }],
			['Ghost', { variant: 'ghost', disabled: 'true' }],
		]);
		expect(drawn.instances?.[0]?.values).toEqual({
			height: '28px',
			padding: '0px 10px 0px 10px',
			radius: '8px 8px 8px 8px',
			gap: 'normal normal',
			fontSize: '13.3333px',
			background: 'rgb(16, 128, 98)',
			text: 'rgb(255, 255, 255)',
		});
		expect(drawn.instances?.[1]?.values.height).toBe('36px');
		expect(drawn.instances?.[2]?.values.background).toBe('rgba(0, 0, 0, 0)');
		expect(loose.component).toBe(false);
		expect(loose.instances).toEqual([]);
	}, 60_000);

	it('counts one that only wraps what it is given apart, and stories that threw; finds one inside another of itself, outer first; keeps a failure to itself', async () => {
		const [[, , tip, box, broken, throws, unrecorded]] = (await headless.measure([{ base, mode: 'light', files: FILES }])) as [
			[Read, Read, Read, Read, Read, Read, Read],
		];
		// The tooltip's only element is the button it was given: not its own, so it is never read as the tooltip's.
		expect([tip.instances, tip.wrapping]).toEqual([[], 1]);
		expect(box.instances?.map((i) => [i.props, i.values.padding])).toEqual([
			[{ tone: 'outer' }, '16px 16px 16px 16px'],
			[{ tone: 'inner' }, '4px 4px 4px 4px'],
		]);
		expect(broken.instancesFailed).toBe('No component here');
		expect(Object.keys(broken.colors)).toContain('rgb(16, 128, 98)');
		expect([throws.instances, throws.storiesFailed]).toEqual([[], 1]);
		// A React whose record of what it drew cannot be read: said as that, never as stories that draw none.
		expect(unrecorded.instancesFailed).toBe("React's record of what it drew could not be read, so its instances cannot be found.");
	}, 60_000);

	it('reads the instances in dark too, as the page draws them there: the same ones, in the same order', async () => {
		const [[light], [dark]] = (await headless.measure([
			{ base, mode: 'light', files: FILES.slice(0, 1) },
			{ base, mode: 'dark', files: FILES.slice(0, 1) },
		])) as [[Read], [Read]];
		expect(dark.instances?.map((i) => [i.story, i.props])).toEqual(light.instances?.map((i) => [i.story, i.props]));
		expect(dark.instances?.[0]?.values.height).toBe('28px');
	}, 60_000);
});

describe.skipIf(NO_CHROME)('values tried on a component’s instances, in the browser on this machine', () => {
	it('reads a border from its first side that has one, as an underline is drawn', async () => {
		const [[field]] = (await headless.measure([{ base, mode: 'light', files: ['field.stories.tsx'] }])) as [
			[NonNullable<Awaited<ReturnType<typeof headless.measure>>[number][number]>],
		];
		expect(field.instances?.[0]?.values.border).toBe('rgb(1, 2, 3)');
		expect(field.colors['rgb(1, 2, 3)']).toBeGreaterThan(0);
	});

	it('sets a value tried on the instance that is now its variant, when a story changes which one is by its props and class alone', async () => {
		const { inChrome } = await import('./realChrome');
		await inChrome(async (browser) => {
			const tab = await browser.newPage();
			await tab.setContent(`<iframe src="${base}" style="width:800px;height:600px"></iframe>`);
			const frame = await tab.waitForFrame((f) => f.url() === base);
			await frame.waitForFunction((name) => typeof (window as unknown as Record<string, unknown>)[name] === 'function', {}, PREVIEW_SHOW);
			await frame.evaluate((name) => (window as unknown as Record<string, (x: string) => Promise<void>>)[name]?.('tabs.stories.tsx'), PREVIEW_SHOW);
			const heights = () =>
				frame.evaluate(() => [...document.querySelectorAll('button.tab')].map((b) => Math.round(b.getBoundingClientRect().height)));
			const settled = () => frame.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
			const selected = await frame.evaluate(
				(find, component) => {
					const of = (window as unknown as Record<string, { component: unknown } | null>)[component];
					const found = (0, eval)(find)(of?.component) as { instances: { key: string; props: Record<string, string> }[] };
					return found.instances.find((i) => i.props.selected === 'true')?.key;
				},
				FIND_INSTANCES,
				PREVIEW_COMPONENT,
			);
			await tab.evaluate((key, v) => document.querySelector('iframe')?.contentWindow?.postMessage({ [key]: v }, '*'), PREVIEW_TRY, [
				{ property: 'height', value: '44px', targets: [selected as string] },
			] as never);
			await settled();
			expect(await heights()).toEqual([44, 30]);
			// The second selected: the same two elements, their class changed; the value tried moves with the variant.
			await frame.evaluate(() => (document.querySelectorAll('button.tab')[1] as HTMLButtonElement).click());
			await settled();
			expect(await heights()).toEqual([30, 44]);
		});
	}, 60_000);

	it('sets each on the instances it is for alone, over the library’s own, again when the stories draw anew, and takes them off', async () => {
		const { inChrome } = await import('./realChrome');
		await inChrome(async (browser) => {
			const tab = await browser.newPage();
			await tab.setContent(`<iframe src="${base}" style="width:800px;height:600px"></iframe>`);
			const frame = await tab.waitForFrame((f) => f.url() === base);
			const show = (file: string) =>
				frame.evaluate((name, f) => (window as unknown as Record<string, (x: string) => Promise<void>>)[name]?.(f), PREVIEW_SHOW, file);
			await frame.waitForFunction((name) => typeof (window as unknown as Record<string, unknown>)[name] === 'function', {}, PREVIEW_SHOW);
			await show('button.stories.tsx');
			const drawn = () =>
				frame.evaluate(
					(find, component) => {
						const of = (window as unknown as Record<string, { component: unknown } | null>)[component];
						const found = (0, eval)(find)(of?.component) as { instances: { key: string; props: Record<string, string>; el: Element }[] };
						return found.instances.map(({ key, props, el }) => {
							const s = getComputedStyle(el);
							return {
								key,
								size: props.size ?? '',
								variant: props.variant ?? '',
								height: Math.round(el.getBoundingClientRect().height),
								radius: s.borderTopLeftRadius,
								background: s.backgroundColor,
							};
						});
					},
					FIND_INSTANCES,
					PREVIEW_COMPONENT,
				);
			const before = await drawn();
			const small = before.find((i) => i.size === 'sm')?.key as string;
			const medium = before.find((i) => i.size === 'md')?.key as string;
			const tryValues = (values: unknown) =>
				tab.evaluate((key, v) => document.querySelector('iframe')?.contentWindow?.postMessage({ [key]: v }, '*'), PREVIEW_TRY, values as never);
			const settled = () => frame.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
			await tryValues([
				{ property: 'height', value: '40px', targets: [small] },
				{ property: 'radius', value: '14px 14px 14px 14px', targets: [medium] },
				// Not every part: not set at all, rather than on one corner.
				{ property: 'radius', value: '30px', targets: [small] },
				{ property: 'background', value: 'rgb(200, 30, 30)', targets: [medium] },
			]);
			await settled();
			const tried = await drawn();
			const of = (key: string) => tried.find((i) => i.key === key);
			expect([of(small)?.height, of(small)?.radius]).toEqual([40, '8px']);
			expect([of(medium)?.height, of(medium)?.radius, of(medium)?.background]).toEqual([36, '14px', 'rgb(200, 30, 30)']);
			expect(tried.find((i) => i.variant === 'ghost')).toMatchObject({ radius: '8px', background: 'rgba(0, 0, 0, 0)' });
			await show('box.stories.tsx');
			await show('button.stories.tsx');
			await settled();
			expect((await drawn()).find((i) => i.key === small)?.height).toBe(40);
			// Said by the page itself, not its parent: not heard.
			await frame.evaluate((key) => window.postMessage({ [key]: [] }, '*'), PREVIEW_TRY);
			await settled();
			expect((await drawn()).find((i) => i.key === small)?.height).toBe(40);
			await tryValues([]);
			await settled();
			expect((await drawn()).find((i) => i.key === small)?.height).toBe(28);
			// A height on an element sized by its content and padding (the box, 16px each side), not by its border: it takes up the
			// height tried, all the same.
			await tryValues([]);
			await show('box.stories.tsx');
			const outer = (await drawn())[0]?.key as string;
			await tryValues([{ property: 'height', value: '100px', targets: [outer] }]);
			await settled();
			expect((await drawn())[0]?.height).toBe(100);
			await show('button.stories.tsx');
			await tryValues([]);
			await settled();
			expect((await drawn()).map(({ key, height, radius, background }) => ({ key, height, radius, background }))).toEqual(
				before.map(({ key, height, radius, background }) => ({ key, height, radius, background })),
			);
		});
	}, 60_000);
});
