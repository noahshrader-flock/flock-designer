/**
 * The probe (A3 of the accessibility plan): a real browser driven over one view of a page, measuring what axe does not
 * (the accessibility tree, a Tab walk, hover, using each control, changing each field, sending each form, the page at 320
 * pixels, at 200%, with WCAG's text spacing, in forced colors and in grey), and code deciding each cell from what it
 * measured (`cells.ts`). Everything it measured is kept as evidence: the files a person, or the AI review, reads after.
 * The page's own measures are `page/probe.ts`, added before the page's code runs; nothing here names a framework.
 */
import axe from 'axe-core';
import PROBE from '../../../page/probe?page';
import type { Box, FaintPart, Field, FormErrors, Spot, Stop, Watched } from '../../../shared/probeData';
import { contrastOf } from '../../../shared/contrast';
import { errorText } from '../../../shared/result';
import { CHECK_WINDOW } from '../accessibilityCheck';
import { decodePng } from '../png';
import { within } from '../within';
import { type CellId, type CellResult, type ProbeDepth, type ProbeFinding, cellsAt, notApplicable, notRun, resultFrom } from './cells';

/** A node of the browser's accessibility tree, as puppeteer gives it. */
export interface AxNode {
	role: string;
	name?: string;
	children?: AxNode[];
}

/** The slice of puppeteer's page the probe drives, so it is said what it needs. */
export interface ProbePage {
	setViewport(v: { width: number; height: number; deviceScaleFactor: number }): Promise<void>;
	emulateMediaFeatures(features: { name: string; value: string }[]): Promise<void>;
	emulateVisionDeficiency(type: 'achromatopsia' | 'none'): Promise<void>;
	evaluateOnNewDocument(code: string): Promise<unknown>;
	goto(url: string, o: { waitUntil: 'load'; timeout: number }): Promise<unknown>;
	evaluate(code: string): Promise<unknown>;
	screenshot(o: {
		type: 'png' | 'jpeg';
		quality?: number;
		captureBeyondViewport?: boolean;
		clip: { x: number; y: number; width: number; height: number; scale?: number };
	}): Promise<Uint8Array>;
	keyboard: {
		press(key: string): Promise<void>;
		down(key: string): Promise<void>;
		up(key: string): Promise<void>;
		type(text: string): Promise<void>;
	};
	mouse: { move(x: number, y: number): Promise<void>; click(x: number, y: number): Promise<void> };
	accessibility: { snapshot(o?: { interestingOnly?: boolean }): Promise<AxNode | null> };
	url(): string;
}

/** A file of evidence: its name in the view's folder, and what is in it. */
export interface Evidence {
	name: string;
	data: string | Buffer;
}

export interface ProbeOptions {
	depth: ProbeDepth;
	/** Only these cells (a test's), else every cell of the depth. */
	only?: CellId[];
	/** Said as it goes: a long run is never silent. */
	progress?: (line: string) => void;
	/** The most a view may take: what is left when it is reached is not run, and says so. */
	budgetMs?: number;
}

export interface ViewProbed {
	results: CellResult[];
	evidence: Evidence[];
	ms: number;
}

/** How long a view may take, at each depth: a build's light run is quick, Handoff's full run is let take longer. */
export const BUDGET_MS: Record<ProbeDepth, number> = { light: 20_000, full: 120_000 };
/** The most of each the probe goes through on a page, so a big page is still measured in time. */
const MOST = { stops: 60, hovers: 25, controls: 10, buttons: 10, fields: 10, forms: 5 };
/** How long a page is given to load, and to answer what it is asked. */
const LOAD_MS = 20_000;
const ASK_MS = 10_000;
/** The longest a status message is taken to be: longer text that appears is new content, not a message. */
const MOST_MESSAGE = 120;
/** How long after an action the page is given to answer it. */
const SETTLE_MS = 300;

/** The probe's page code, put in the page before its own code runs: it watches from the start. */
const INSTALL = `(() => { ${PROBE}; window.__dsnrProbe = __fdPage; __fdPage.watch(); })()`;

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
const quote = (v: unknown) => JSON.stringify(v);

/**
 * A picture of the page, as a person sees it, down to a few screens long: at half size when it is wider than a phone, so
 * the evidence a run keeps in the design repository stays small.
 */
const picture = async (page: ProbePage, width: number): Promise<Buffer> => {
	const height = Math.min(2400, Math.max(1, Number(await page.evaluate('document.documentElement.scrollHeight'))));
	const scale = width > 400 ? 0.5 : 1;
	return Buffer.from(await page.screenshot({ type: 'jpeg', quality: 55, captureBeyondViewport: true, clip: { x: 0, y: 0, width, height, scale } }));
};

/** The region around a box on the page, a few pixels out so an outline round it is in it. */
const around = (b: Box) => {
	const x = Math.max(0, b.x - 6);
	const y = Math.max(0, b.y - 6);
	return { x, y, width: Math.max(1, b.x + b.width + 6 - x), height: Math.max(1, b.y + b.height + 6 - y) };
};

/**
 * What focus changed in the picture of an element: how many pixels, and the strongest contrast between a pixel as it was
 * and as it is focused. No change is no focus shown; a change under 3:1 is a faint one (1.4.11).
 */
export const focusChange = (plain: Buffer, focused: Buffer): { changed: number; strongest: number } => {
	const [a, b] = [decodePng(plain), decodePng(focused)];
	if (a.width !== b.width || a.height !== b.height) return { changed: a.width * a.height, strongest: 21 };
	let changed = 0;
	let strongest = 1;
	for (let i = 0; i < a.rgba.length; i += 4) {
		const before = [a.rgba[i], a.rgba[i + 1], a.rgba[i + 2]] as [number, number, number];
		const after = [b.rgba[i], b.rgba[i + 1], b.rgba[i + 2]] as [number, number, number];
		if (Math.max(...before.map((v, k) => Math.abs(v - (after[k] as number)))) <= 4) continue;
		changed++;
		strongest = Math.max(strongest, contrastOf(before, after));
	}
	return { changed, strongest: Math.round(strongest * 100) / 100 };
};

/** A row of the contrast table: an element's text and what is behind it, in one state, and what its size asks. */
export interface ContrastRow {
	target: string;
	state: string;
	fg: string | null;
	bg: string | null;
	ratio: number | null;
	expected: number | null;
	below: boolean;
}

/** axe's own contrast rule, on the element at `path` (or the page), its answers and failures kept as rows of the table. */
const contrastScript = (path: string | null, state: string) => `(async () => {
	const at = ${path === null ? 'document' : `document.querySelector(${quote(path)})`};
	if (!at) return [];
	const r = await window.axe.run(at, { runOnly: { type: 'rule', values: ['color-contrast'] }, resultTypes: ['violations', 'passes'] });
	const row = (below) => (n) => { const d = (n.any[0] && n.any[0].data) || {}; return { target: n.target.flat().join(' >>> '), state: ${quote(state)}, fg: d.fgColor || null, bg: d.bgColor || null, ratio: typeof d.contrastRatio === 'number' ? d.contrastRatio : null, expected: d.expectedContrastRatio ? Number(String(d.expectedContrastRatio).replace(':1', '')) : null, below }; };
	return [...r.violations.flatMap((v) => v.nodes.map(row(true))), ...r.passes.flatMap((v) => v.nodes.map(row(false)))];
})()`;

/** Whether two addresses are other pages: a change of the part after `#` is the same page. */
const otherPage = (a: string, b: string) => a.split('#')[0] !== b.split('#')[0];

/** A change of context, as 3.2.1 and 3.2.2 mean it, in words; null when there was none. */
const contextChange = (before: string, after: string, watched: Watched, another: { dialog: boolean; replaced: boolean }): string | null => {
	if (otherPage(before, after)) return `went to another address (${after})`;
	if (watched.opened.length) return `opened a window (${watched.opened[0] || 'a blank one'})`;
	if (another.dialog) return 'opened a dialog';
	if (another.replaced) return 'replaced most of the page';
	return null;
};

const INTERACTIVE_ROLES = new Set([
	'button',
	'link',
	'checkbox',
	'radio',
	'switch',
	'tab',
	'menuitem',
	'menuitemcheckbox',
	'menuitemradio',
	'option',
	'slider',
	'spinbutton',
	'combobox',
	'textbox',
	'searchbox',
]);
/**
 * 4.1.2 in the accessibility tree: each control with no name. (A control's missing state is axe's: the browser gives a
 * checkbox written with a role a state of its own, so the tree cannot show it missing.)
 */
const treeFaults = (node: AxNode | null, under: string[] = []): ProbeFinding[] => {
	if (!node) return [];
	const where = under.length ? ` in ${under.slice(-2).join(' › ')}` : '';
	const own: ProbeFinding[] = [];
	if (INTERACTIVE_ROLES.has(node.role) && !node.name?.trim()) own.push({ target: `${node.role}${where}`, detail: 'a control with no name' });
	const label = node.name?.trim() ? `${node.role} “${node.name.trim().slice(0, 40)}”` : node.role;
	return [...own, ...(node.children ?? []).flatMap((c) => treeFaults(c, [...under, label]))];
};

/**
 * Probes one view of a page (`url`, as it opens) at `depth`: each cell measured, decided, and its evidence kept. A measure
 * that fails is not run, with why; one reached after the view's time is up is not run, and says so.
 */
export const probeView = async (page: ProbePage, url: string, options: ProbeOptions): Promise<ViewProbed> => {
	const started = Date.now();
	const budget = options.budgetMs ?? BUDGET_MS[options.depth];
	const wanted = new Set<CellId>(
		options.only ??
			cellsAt(options.depth)
				.filter((c) => c.kind === 'page')
				.map((c) => c.id as CellId),
	);
	const say = options.progress ?? (() => undefined);
	const results: CellResult[] = [];
	const evidence: Evidence[] = [];

	const ask = async <T>(code: string): Promise<T> => {
		const answer = await within(ASK_MS, page.evaluate(`window.__dsnrProbe.${code}`));
		if (answer === null && !/^(focused|reveal)\(/.test(code)) throw new Error(`the page did not answer in time (${code.split('(')[0]})`);
		return answer as T;
	};
	const view = { width: CHECK_WINDOW.width, height: CHECK_WINDOW.height };
	const sized = (width: number, height: number, deviceScaleFactor = 1) => page.setViewport({ width, height, deviceScaleFactor });
	let withAxe = false;
	const load = async () => {
		await sized(view.width, view.height);
		if ((await within(LOAD_MS, page.goto(url, { waitUntil: 'load', timeout: LOAD_MS }))) === null) throw new Error('the page did not load in time');
		await page.evaluate('(async () => { await document.fonts.ready; await new Promise((r) => setTimeout(r, 300)); })()');
		await ask('watched()');
		withAxe = false;
	};
	const axeIn = async () => {
		if (!withAxe) await page.evaluate(`${axe.source};true`);
		withAxe = true;
	};
	const contrast = async (path: string | null, state: string): Promise<ContrastRow[]> => {
		await axeIn();
		return ((await within(ASK_MS, page.evaluate(contrastScript(path, state)))) as ContrastRow[] | null) ?? [];
	};

	/** Runs one measure for its cells, when any is wanted: not run when the time is up, or when it fails. */
	const step = async (cells: CellId[], what: string, measure: () => Promise<CellResult[]>) => {
		const want = cells.filter((c) => wanted.has(c));
		if (want.length === 0) return;
		if (Date.now() - started > budget) {
			results.push(...want.map((c) => notRun(c, `the run's time for this view (${budget / 1000} s) was used up first`)));
			return;
		}
		say(what);
		try {
			const made = await measure();
			results.push(...made.filter((r) => want.includes(r.cell)));
		} catch (err) {
			results.push(...want.map((c) => notRun(c, `its measure failed: ${errorText(err, { firstLine: true })}`)));
		}
	};

	await page.evaluateOnNewDocument(INSTALL);
	await load();
	const contrastRows: ContrastRow[] = [];

	// The accessibility tree, and the structure drawn against what the markup says.
	let tree: AxNode | null = null;
	await step(['structure', 'name-role-value'], 'the accessibility tree', async () => {
		tree = await page.accessibility.snapshot({ interestingOnly: true });
		evidence.push({ name: 'tree.json', data: JSON.stringify(tree, null, 1) });
		const [fake, tables] = [await ask<Spot[]>('fakeHeadings()'), await ask<Spot[]>('headerlessTables()')];
		return [
			resultFrom('structure', [
				...fake.map((s) => ({ target: s.path, detail: `“${s.text}” is drawn as a heading and is not one` })),
				...tables.map((s) => ({ target: s.path, detail: 'a table of data with no header cell' })),
			]),
		];
	});

	// The Tab walk: every stop, its picture focused and not, what covers it, and whether focus alone changed the page.
	const walkCells: CellId[] = [
		'keyboard-reach',
		'keyboard-trap',
		'focus-order',
		'focus-visible',
		'focus-obscured',
		'on-focus',
		'name-role-value',
		'non-text-contrast',
		'contrast-states',
	];
	const stops: (Stop & { picture: string; changed: number; strongest: number; context: string | null })[] = [];
	let left = false;
	let trapped: string[] | null = null;
	let expected: Spot[] = [];
	let looksClickable: Spot[] = [];
	await step(walkCells, 'the Tab walk', async () => {
		expected = await ask<Spot[]>('tabbables()');
		looksClickable = await ask<Spot[]>('pointerOnly()');
		await ask('blur()');
		await page.evaluate('window.scrollTo(0, 0)');
		await ask('mark()');
		const seen = new Set<string>();
		for (let i = 0; i < MOST.stops; i++) {
			const before = page.url();
			await page.keyboard.press('Tab');
			await pause(50);
			const stop = await ask<Stop | null>('focused()');
			if (stop === null) {
				left = true;
				break;
			}
			if (seen.has(stop.path)) {
				// Round again without leaving the page: a trap, unless Escape lets it out.
				const cycle = stops.slice(stops.findIndex((s) => s.path === stop.path)).map((s) => s.path);
				await page.keyboard.press('Escape');
				await page.keyboard.press('Tab');
				const after = await ask<Stop | null>('focused()');
				const inModal = stops.filter((s) => cycle.includes(s.path)).every((s) => s.modal);
				if (!inModal && expected.some((e) => !seen.has(e.path)) && (after === null || cycle.includes(after.path))) trapped = cycle;
				break;
			}
			seen.add(stop.path);
			const context = contextChange(
				before,
				page.url(),
				await ask<Watched>('watched()'),
				await ask<{ dialog: boolean; replaced: boolean }>('becameAnother()'),
			);
			const clip = around(stop.at);
			const focusedShot = Buffer.from(await page.screenshot({ type: 'png', clip }));
			await ask('blur()');
			const plainShot = Buffer.from(await page.screenshot({ type: 'png', clip }));
			await ask(`focus(${quote(stop.path)})`);
			const name = `stops/${String(stops.length + 1).padStart(2, '0')}.png`;
			evidence.push({ name, data: focusedShot });
			if (wanted.has('contrast-states') && options.depth === 'full') contrastRows.push(...(await contrast(stop.path, 'focus')));
			stops.push({ ...stop, picture: name, ...focusChange(plainShot, focusedShot), context });
			if (context && otherPage(before, page.url())) break;
		}
		evidence.push({ name: 'tab.json', data: JSON.stringify({ stops, left, trapped, expected: expected.length }, null, 1) });
		const reached = new Set(stops.map((s) => s.path));
		const backwards = stops.slice(1).flatMap((b, i) => {
			const a = stops[i] as Stop;
			const sameColumn = Math.min(a.at.x + a.at.width, b.at.x + b.at.width) - Math.max(a.at.x, b.at.x) > 0;
			return sameColumn && b.at.y + b.at.height <= a.at.y + 1 ? [{ target: b.path, detail: `Tab goes back up the page to it, from ${a.path}` }] : [];
		});
		return [
			resultFrom('keyboard-reach', [
				...looksClickable.map((s) => ({ target: s.path, detail: `“${s.text || s.html}” looks clickable and Tab does not reach it` })),
				...(left && !trapped
					? expected.filter((e) => !reached.has(e.path)).map((e) => ({ target: e.path, detail: 'can take focus, and the Tab walk never reached it' }))
					: []),
			]),
			resultFrom(
				'keyboard-trap',
				trapped
					? [
							{
								target: (trapped as string[])[0] as string,
								detail: `Tab goes round ${(trapped as string[]).length} stops and never leaves them, and Escape does not let it out`,
							},
						]
					: [],
			),
			resultFrom('focus-order', [
				...stops.filter((s) => s.tabindex > 0).map((s) => ({ target: s.path, detail: `tabindex="${s.tabindex}" moves it out of the page's order` })),
				...backwards,
			]),
			resultFrom(
				'focus-visible',
				stops.filter((s) => s.changed < 3).map((s) => ({ target: s.path, detail: `focused, it is drawn as it is when not (${s.picture})` })),
			),
			resultFrom(
				'focus-obscured',
				stops
					.filter((s) => s.covered.length > 0)
					.map((s) => ({ target: s.path, detail: `focused, it is wholly covered by ${s.covered.join(', ')}` })),
			),
			resultFrom(
				'on-focus',
				stops.filter((s) => s.context).map((s) => ({ target: s.path, detail: `focus alone ${s.context}` })),
			),
			resultFrom('name-role-value', [
				...treeFaults(tree),
				...stops.filter((s) => !s.native && !s.role).map((s) => ({ target: s.path, detail: 'Tab reaches it, and it has no role' })),
			]),
		];
	});

	if (options.depth === 'full') {
		await page.evaluate('window.scrollTo(0, 0)');
		await ask('blur()');
		await step(['reading-order'], 'the reading order', async () => [
			resultFrom(
				'reading-order',
				(await ask<[Spot, Spot][]>('readingOrder()')).map(([a, b]) => ({
					target: b.path,
					detail: `“${b.text}” is read after “${a.text}”, and drawn above it`,
				})),
			),
		]);
		await step(['target-size'], 'target sizes', async () => [
			resultFrom(
				'target-size',
				(await ask<(Spot & { near: string })[]>('smallTargets()')).map((s) => ({
					target: s.path,
					detail: `${s.box.width}×${s.box.height} pixels, with ${s.near} within its 24-pixel circle`,
				})),
			),
		]);
		await step(['non-text-contrast'], 'the contrast of what is not text', async () => [
			resultFrom('non-text-contrast', [
				...(await ask<FaintPart[]>('faintParts()')).map((p) => ({
					target: p.path,
					detail: `its ${p.part === 'edge' ? 'edge' : 'icon'} is ${p.colors[0]} on ${p.colors[1]}, ${p.ratio}:1`,
				})),
				...stops
					.filter((s) => s.changed >= 3 && s.strongest < 3)
					.map((s) => ({ target: s.path, detail: `its focus indicator changes it by ${s.strongest}:1 at most (${s.picture})` })),
			]),
		]);
		await step(['pause-stop-hide'], 'animations', async () => [
			resultFrom(
				'pause-stop-hide',
				(await ask<(Spot & { name: string; ms: number | null })[]>('longAnimations()')).map((a) => ({
					target: a.path,
					detail: `${a.name ? `“${a.name}” ` : ''}plays ${a.ms === null ? 'for ever' : `for ${Math.round(a.ms / 1000)} s`} by itself`,
				})),
			),
		]);
		await step(['contrast-states'], 'the contrast table', async () => {
			contrastRows.push(...(await contrast(null, 'default')));
			return [];
		});
		await step(['color-only'], 'forced colors and grey', async () => {
			const marks = await ask<string[]>('filledMarks()');
			await page.emulateMediaFeatures([{ name: 'forced-colors', value: 'active' }]);
			const gone = await ask<Spot[]>(`vanished(${quote(marks)})`);
			evidence.push({ name: 'forced-colors.jpg', data: await picture(page, view.width) });
			await page.emulateMediaFeatures([{ name: 'forced-colors', value: 'none' }]);
			await page.emulateVisionDeficiency('achromatopsia');
			evidence.push({ name: 'grayscale.jpg', data: await picture(page, view.width) });
			await page.emulateVisionDeficiency('none');
			return [
				resultFrom(
					'color-only',
					gone.map((s) => ({ target: s.path, detail: 'a mark drawn only by its color: forced colors paints it over' })),
				),
			];
		});
		const baseline = new Set((await ask<Spot[]>('clipped()')).map((s) => s.path));
		const newlyClipped = async () =>
			(await ask<Spot[]>('clipped()')).filter((s) => !baseline.has(s.path)).map((s) => ({ target: s.path, detail: `“${s.text}” is cut off` }));
		await step(['reflow'], 'the page 320 pixels wide', async () => {
			await sized(320, 256);
			const o = await ask<{ width: number; window: number; past: Spot[] }>('overflow()');
			const cut = await newlyClipped();
			evidence.push({ name: 'reflow-320.jpg', data: await picture(page, 320) });
			await sized(view.width, view.height);
			const sideways =
				o.width > o.window + 1
					? o.past.map((s) => ({ target: s.path, detail: `runs past the window's edge: the page is ${o.width} pixels wide in 320` }))
					: [];
			return [resultFrom('reflow', [...sideways, ...cut])];
		});
		await step(['resize-text'], 'the page at 200%', async () => {
			await sized(view.width / 2, view.height / 2, 2);
			const cut = await newlyClipped();
			evidence.push({ name: 'zoom-200.jpg', data: await picture(page, view.width / 2) });
			await sized(view.width, view.height);
			return [resultFrom('resize-text', cut)];
		});
		await step(['text-spacing'], 'WCAG’s text spacing', async () => {
			await ask('textSpacing(true)');
			const cut = await newlyClipped();
			await ask('textSpacing(false)');
			return [resultFrom('text-spacing', cut)];
		});
		await step(['orientation'], 'both orientations', async () => {
			await sized(768, 1024);
			const portrait = await ask<number>('shownText()');
			await sized(1024, 768);
			const landscape = await ask<number>('shownText()');
			await sized(view.width, view.height);
			const [few, most] = [Math.min(portrait, landscape), Math.max(portrait, landscape)];
			const lost = most > 0 && few < most / 2;
			return [
				resultFrom(
					'orientation',
					lost ? [{ target: 'the page', detail: `shows ${portrait} characters of text upright and ${landscape} on its side` }] : [],
				),
			];
		});

		// Hover: what appears, and whether it can be dismissed, hovered and kept; and text contrast as hovered.
		await step(['hover-content', 'contrast-states'], 'hover', async () => {
			const found: ProbeFinding[] = [];
			let shown = 0;
			await ask('blur()');
			for (const target of (await ask<Spot[]>('tabbables()')).slice(0, MOST.hovers)) {
				const at = await ask<Spot | null>(`reveal(${quote(target.path)})`);
				if (!at) continue;
				await ask('mark()');
				await page.mouse.move(at.box.x + at.box.width / 2, at.box.y + at.box.height / 2);
				await pause(SETTLE_MS);
				contrastRows.push(...(await contrast(target.path, 'hover')));
				const content = (await ask<Spot[]>('appeared()')).find((c) => !c.path.startsWith(target.path));
				if (content) {
					shown++;
					await page.mouse.move(content.box.x + content.box.width / 2, content.box.y + content.box.height / 2);
					await pause(SETTLE_MS);
					const hoverable = await ask<boolean>(`stillShown(${quote(content.path)})`);
					await pause(1000);
					const stays = await ask<boolean>(`stillShown(${quote(content.path)})`);
					await page.keyboard.press('Escape');
					await pause(SETTLE_MS);
					const dismissed = !(await ask<boolean>(`stillShown(${quote(content.path)})`));
					const faults = [
						hoverable ? null : 'goes when the pointer moves onto it',
						hoverable && !stays ? 'does not stay' : null,
						dismissed ? null : 'Escape does not dismiss it',
					].filter(Boolean);
					if (faults.length)
						found.push({ target: target.path, detail: `“${content.text}” (${content.path}) appears on hover, and ${faults.join(', and ')}` });
				}
				await page.mouse.move(0, 0);
				if (content) await load();
			}
			return [shown === 0 && found.length === 0 ? notApplicable('hover-content', 'nothing appeared on hover') : resultFrom('hover-content', found)];
		});
		if (wanted.has('contrast-states') && !results.some((r) => r.cell === 'contrast-states')) {
			evidence.push({ name: 'contrast.json', data: JSON.stringify(contrastRows, null, 1) });
			// Only what a state makes worse: text already too faint as the page opens is the default row's (and axe's).
			const faintAlready = new Set(contrastRows.filter((r) => r.below && r.state === 'default').map((r) => r.target));
			const states = contrastRows.filter((r) => r.below && r.state !== 'default' && !faintAlready.has(r.target));
			results.push(
				resultFrom(
					'contrast-states',
					states.map((r) => ({ target: r.target, detail: `on ${r.state}, ${r.fg} on ${r.bg} is ${r.ratio}:1, under ${r.expected}:1` })),
				),
			);
		}

		// Using each control: a key against a click, and what each says as it is used.
		await step(['keyboard-operate'], 'operating each control by key', async () => {
			await load();
			const controls = (await ask<Spot[]>('customControls()')).slice(0, MOST.controls);
			if (controls.length === 0) return [notApplicable('keyboard-operate', 'no control here is written with a role')];
			const found: ProbeFinding[] = [];
			for (const control of controls) {
				await load();
				if (!(await ask<boolean>(`focus(${quote(control.path)})`))) continue;
				await ask('watched()');
				const before = page.url();
				await page.keyboard.press('Enter');
				await page.keyboard.press(' ');
				await pause(SETTLE_MS);
				const byKey = (await ask<Watched>('watched()')).changes + (otherPage(before, page.url()) ? 1 : 0);
				await load();
				const at = await ask<Spot | null>(`reveal(${quote(control.path)})`);
				if (!at) continue;
				await ask('watched()');
				await page.mouse.click(at.box.x + at.box.width / 2, at.box.y + at.box.height / 2);
				await pause(SETTLE_MS);
				const byClick = (await ask<Watched>('watched()')).changes + (otherPage(before, page.url()) ? 1 : 0);
				if (byClick > 0 && byKey === 0)
					found.push({ target: control.path, detail: `“${control.text}” does something on a click, and nothing on Enter or Space` });
			}
			return [resultFrom('keyboard-operate', found)];
		});
		const liveLog: { used: string; added: Watched['added'] }[] = [];
		await step(['status-messages'], 'what each button says as it is used', async () => {
			await load();
			const buttons = (await ask<Spot[]>('buttons()')).slice(0, MOST.buttons);
			if (buttons.length === 0) return [notApplicable('status-messages', 'no button here to use')];
			const found: ProbeFinding[] = [];
			for (const button of buttons) {
				await load();
				const at = await ask<Spot | null>(`reveal(${quote(button.path)})`);
				if (!at) continue;
				await ask('watched()');
				await page.mouse.click(at.box.x + at.box.width / 2, at.box.y + at.box.height / 2);
				await pause(SETTLE_MS * 2);
				const added = (await ask<Watched>('watched()')).added;
				liveLog.push({ used: button.path, added });
				const message = added.find((a) => !a.live && !a.dialog && !a.interactive && a.length <= MOST_MESSAGE);
				if (message) found.push({ target: button.path, detail: `“${message.text}” appeared after it was used, outside any live region` });
			}
			evidence.push({ name: 'live-regions.json', data: JSON.stringify(liveLog, null, 1) });
			return [resultFrom('status-messages', found)];
		});

		// Changing each field, and sending each form.
		await step(['on-input'], 'changing each field', async () => {
			await load();
			const fields = (await ask<Field[]>('inputs()')).slice(0, MOST.fields);
			if (fields.length === 0) return [notApplicable('on-input', 'no field here to change')];
			const found: ProbeFinding[] = [];
			for (const { spot, kind } of fields) {
				await load();
				await ask(`focus(${quote(spot.path)})`);
				await ask('mark()');
				await ask('watched()');
				const before = page.url();
				if (kind === 'select') await ask(`chooseNext(${quote(spot.path)})`);
				else if (kind === 'toggle') await page.keyboard.press(' ');
				else await page.keyboard.type('a');
				await pause(SETTLE_MS * 2);
				const change = contextChange(
					before,
					page.url(),
					await ask<Watched>('watched()'),
					await ask<{ dialog: boolean; replaced: boolean }>('becameAnother()'),
				);
				if (change) found.push({ target: spot.path, detail: `changing it ${change}` });
			}
			return [resultFrom('on-input', found)];
		});
		await step(['error-identification'], 'sending each form', async () => {
			await load();
			const forms = (await ask<{ path: string; submit: string | null }[]>('forms()')).slice(0, MOST.forms);
			if (forms.length === 0) return [notApplicable('error-identification', 'no form here to send')];
			const found: ProbeFinding[] = [];
			for (const form of forms) {
				if (!form.submit) continue;
				await load();
				const at = await ask<Spot | null>(`reveal(${quote(form.submit)})`);
				if (!at) continue;
				await ask('mark()');
				const before = page.url();
				await page.mouse.click(at.box.x + at.box.width / 2, at.box.y + at.box.height / 2);
				await pause(SETTLE_MS * 2);
				if (otherPage(before, page.url())) continue;
				const e = await ask<FormErrors>(`errors(${quote(form.path)})`);
				if (e.native) continue;
				found.push(
					...e.messages
						.filter((m) => !m.tied)
						.map((m) => ({ target: m.path, detail: `“${m.text}” appeared on sending ${form.path}, and no field names it` })),
					...e.unnamed.map((f) => ({ target: f.path, detail: 'marked invalid, and names no message' })),
				);
			}
			return [resultFrom('error-identification', found)];
		});
	}

	evidence.push({ name: 'cells.json', data: JSON.stringify(results, null, 1) });
	return { results, evidence, ms: Date.now() - started };
};
