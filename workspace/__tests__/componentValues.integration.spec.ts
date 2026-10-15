import { mkdtempSync } from 'node:fs';
import { type Server, createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from 'esbuild';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PREVIEW_COMPONENT, PREVIEW_SHOW } from '../src/shared/catalog';
import { chromeHeadless, findChrome } from '../src/main/services/chromeHeadless';
import { ComponentTokens } from '../src/main/services/componentTokens';
import { PrototypeServer } from '../src/main/services/prototypeServer';
import { StoryPreviews, hasPackages } from '../src/main/services/storyPreviews';
import type { ValueRow } from '../src/shared/contract';
import { REAL_LIBRARY, describeWith, libraryMissing } from './realCheckouts';

/**
 * Each instance of a component its stories draw (Phase 1 of adjusting a component), read in the real browser by the
 * script the Design System tab draws with: a preview page built here with React, minified as the previews are, so the
 * component is found by identity and not by name. Skipped where there is no Chrome, Edge or Chromium.
 */

const PAGE_SCRIPT = `
import { createElement as h, forwardRef } from 'react';
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

const files = {
	'button.stories.tsx': {
		meta: { component: Button, args: { size: 'md' }, argTypes: { variant: {} } },
		stories: {
			Sizes: () => h(Toolbar, null, h(Button, { size: 'sm', onClick: () => {} }, 'Small'), h(Button, { size: 'md' }, 'Medium')),
			Ghost: () => h(Button, { variant: 'ghost', disabled: true, 'data-testid': 'g' }, 'Ghost'),
		},
	},
	'loose.stories.tsx': { meta: {}, stories: { Plain: () => h(Button, null, 'Plain') } },
};

const root = createRoot(document.getElementById('root'));
window[${JSON.stringify(PREVIEW_SHOW)}] = async (file) => {
	const { meta, stories } = files[file];
	window[${JSON.stringify(PREVIEW_COMPONENT)}] = meta.component ? { component: meta.component, controls: Object.keys({ ...meta.args, ...meta.argTypes }) } : null;
	flushSync(() => root.render(Object.entries(stories).map(([name, Story]) => h('section', { key: name, 'data-story': name }, h(Story)))));
};
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

describe.skipIf(findChrome() === null)('a component’s instances, in the browser on this machine', () => {
	it('finds each by the component the stories name, with its top element’s values and the props that say its variant', async () => {
		const [[drawn, loose]] = (await headless.measure([{ base, mode: 'light', files: ['button.stories.tsx', 'loose.stories.tsx'] }])) as [
			[NonNullable<Awaited<ReturnType<typeof headless.measure>>[number][number]>, Awaited<ReturnType<typeof headless.measure>>[number][number]],
		];
		expect(drawn.component).toBe(true);
		expect(drawn.controls).toEqual(['size', 'variant']);
		// Three buttons, in the order drawn; the toolbar around two of them and the span inside each are not instances.
		expect(drawn.instances?.map((i) => [i.story, i.props])).toEqual([
			['Sizes', { size: 'sm' }],
			['Sizes', { size: 'md' }],
			['Ghost', { variant: 'ghost', disabled: 'true' }],
		]);
		expect(drawn.instances?.[0]?.values).toEqual({
			height: '28px',
			padding: '0px 10px',
			radius: '8px',
			gap: 'normal',
			fontSize: '13.3333px',
			background: 'rgb(16, 128, 98)',
			text: 'rgb(255, 255, 255)',
		});
		expect(drawn.instances?.[1]?.values.height).toBe('36px');
		expect(drawn.instances?.[2]?.values.background).toBe('rgba(0, 0, 0, 0)');
		// A story file that names no component has none to find.
		expect(loose?.component).toBe(false);
		expect(loose?.instances).toEqual([]);
	}, 60_000);
});

/**
 * The real library on this machine, through the whole pass the tab's analysis makes (T6): every story drawn as the library
 * has it and with every token tagged. What the spike measured by hand (DESIGN_SYSTEM_PLAN, Phase 0) is what the tab says.
 */
const realMissing = libraryMissing ?? (hasPackages(REAL_LIBRARY) ? null : `${REAL_LIBRARY} has no packages installed`);
describeWith(realMissing, 'against the real library on origin/develop', () => {
	it.skipIf(findChrome() === null)(
		'reads FSButton’s heights by size, its radius and colors as tokens, and FSIconButton’s radius as its own',
		async () => {
			const repository = 'flocksafety/flock-react-component-lib';
			const system = { id: repository, name: 'FUI', repository, root: REAL_LIBRARY, folder: '', branch: 'develop' };
			const pages = new PrototypeServer();
			const real = chromeHeadless();
			try {
				const previews = new StoryPreviews({ system: () => system, folder: mkdtempSync(join(tmpdir(), 'dsnr-values-')), server: pages });
				const tokens = new ComponentTokens({
					system: () => system,
					previews,
					measure: real.measure,
					pictures: { keep: () => {}, of: async () => ({}) },
				});
				await tokens.warm();
				const valuesOf = async (name: string) => {
					const answer = await tokens.of(`src/components/${name}/${name}.stories.tsx`);
					if (answer.state !== 'ready' || answer.values.state !== 'read')
						throw new Error(`${name}: ${answer.state === 'ready' ? JSON.stringify(answer.values) : JSON.stringify(answer)}`);
					return answer.values.rows;
				};
				const row = (rows: ValueRow[], property: ValueRow['property']) => rows.find((r) => r.property === property);
				const button = await valuesOf('FSButton');
				const height = row(button, 'height');
				expect(height?.by).toBe('size');
				// In the order the stories draw them, which is theirs to choose: compared by size.
				const bySize = Object.fromEntries((height?.cells ?? []).map((c) => [c.variant, [c.value, c.kind]]));
				// Drawn without a size, it draws its default, which is lg's.
				expect(bySize).toEqual({ sm: ['28px', 'own'], md: ['36px', 'own'], lg: ['48px', 'own'], xl: ['56px', 'own'], 'not set': ['48px', 'own'] });
				const radius = row(button, 'radius')?.cells ?? [];
				expect(radius.map((c) => [c.value, c.kind])).toEqual([['8px', 'token']]);
				// Its colors by variant: the primary's background is the primary token, the secondary draws none.
				const background = Object.fromEntries((row(button, 'background')?.cells ?? []).map((c) => [c.variant, [c.kind, c.tokens]]));
				expect(background.primary).toEqual(['token', ['palette.light.primary.main']]);
				expect(background.secondary).toEqual(['own', []]);
				// FSIconButton draws the same 8px, but its own: changing the shared radius would not move it.
				expect(row(await valuesOf('FSIconButton'), 'radius')?.cells.map((c) => [c.value, c.kind])).toEqual([['8px', 'own']]);
			} finally {
				await real.close();
				pages.close();
			}
		},
		600_000,
	);
});
