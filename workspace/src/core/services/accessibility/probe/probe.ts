// Nothing here names a framework.
import axe from 'axe-core';
import PROBE from '../../../../page/probe?page';
import {
	type Box,
	type Button,
	type FaintPart,
	type Field,
	type FormErrors,
	INTERACTIVE_ROLES,
	type Read,
	type Spot,
	type Stop,
	type Watched,
} from '../../../../shared/probeData';
import { contrastOf } from '../../../../shared/contrast';
import { errorText } from '../../../../shared/result';
import { CHECKED_IN, CHECK_WINDOW } from '../accessibilityCheck';
import { decodePng } from '../../prototypes/png';
import { settleScript, timerWatchScript } from '../../browser/settle';
import { within } from '../../platform/within';
import { type CellId, type CellResult, type ProbeDepth, type ProbeFinding, cellsAt, notApplicable, notRun, resultFrom } from './cells';

export interface AxNode {
	role: string;
	name?: string;
	children?: AxNode[];
}

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

export interface Evidence {
	name: string;
	data: string | Buffer;
}

export interface ProbeOptions {
	depth: ProbeDepth;
	only?: CellId[];
	progress?: (line: string) => void;
	/** What is left when it is reached is not run, and says so. */
	budgetMs?: number;
}

export interface ViewProbed {
	results: CellResult[];
	evidence: Evidence[];
	ms: number;
}

export const BUDGET_MS: Record<ProbeDepth, number> = { light: 20_000, full: 120_000 };
const MOST = { stops: 60, hovers: 25, controls: 10, buttons: 10, fields: 10, forms: 5 };
const LOAD_MS = 20_000;
const ASK_MS = 10_000;
/** The longest a status message is taken to be: longer text that appears is new content, not a message. */
const MOST_MESSAGE = 120;
/** WCAG 1.4.13's "persistent". */
const STAYS_MS = 1000;

const INSTALL = `(() => { ${PROBE}; window.__dsnrProbe = __fdPage; __fdPage.watch(); })()`;

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
const quote = (v: unknown) => JSON.stringify(v);

/** At half size when wider than a phone, so the evidence kept in the design repository stays small. */
const picture = async (page: ProbePage, width: number): Promise<Buffer> => {
	const height = Math.min(2400, Math.max(1, Number(await page.evaluate('document.documentElement.scrollHeight'))));
	const scale = width > 400 ? 0.5 : 1;
	return Buffer.from(await page.screenshot({ type: 'jpeg', quality: 55, captureBeyondViewport: true, clip: { x: 0, y: 0, width, height, scale } }));
};

/** A few pixels out, so an outline round the box is in it. */
const around = (b: Box) => {
	const x = Math.max(0, b.x - 6);
	const y = Math.max(0, b.y - 6);
	return { x, y, width: Math.max(1, b.x + b.width + 6 - x), height: Math.max(1, b.y + b.height + 6 - y) };
};

/** No change is no focus shown; a change under 3:1 is a faint one (1.4.11). */
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

export interface ContrastRow {
	target: string;
	state: string;
	fg: string | null;
	bg: string | null;
	ratio: number | null;
	expected: number | null;
	below: boolean;
}

const contrastScript = (path: string | null, state: string) => `(async () => {
	const at = ${path === null ? 'document' : `document.querySelector(${quote(path)})`};
	if (!at) return [];
	const r = await window.axe.run(at, { runOnly: { type: 'rule', values: ['color-contrast'] }, resultTypes: ['violations', 'passes'] });
	const row = (below) => (n) => { const d = (n.any[0] && n.any[0].data) || {}; return { target: n.target.flat().join(' >>> '), state: ${quote(state)}, fg: d.fgColor || null, bg: d.bgColor || null, ratio: typeof d.contrastRatio === 'number' ? d.contrastRatio : null, expected: d.expectedContrastRatio ? Number(String(d.expectedContrastRatio).replace(':1', '')) : null, below }; };
	return [...r.violations.flatMap((v) => v.nodes.map(row(true))), ...r.passes.flatMap((v) => v.nodes.map(row(false)))];
})()`;

const otherPage = (a: string, b: string) => a.split('#')[0] !== b.split('#')[0];

const contextChange = (watched: Watched, another: { dialog: boolean; replaced: boolean }): string | null => {
	if (watched.opened.length) return `opened a window (${watched.opened[0] || 'a blank one'})`;
	if (another.dialog) return 'opened a dialog';
	if (another.replaced) return 'replaced most of the page';
	return null;
};

const CONTROLS = new Set(INTERACTIVE_ROLES);
/**
 * Names only: a control's missing state is axe's, since the browser gives a checkbox written with a role a state of its
 * own, so the tree cannot show it missing.
 */
const treeFaults = (node: AxNode | null, under: string[] = []): ProbeFinding[] => {
	if (!node) return [];
	const where = under.length ? ` in ${under.slice(-2).join(' › ')}` : '';
	const own: ProbeFinding[] = [];
	if (CONTROLS.has(node.role) && !node.name?.trim()) own.push({ target: `${node.role}${where}`, detail: 'a control with no name' });
	const label = node.name?.trim() ? `${node.role} “${node.name.trim().slice(0, 40)}”` : node.role;
	return [...own, ...(node.children ?? []).flatMap((c) => treeFaults(c, [...under, label]))];
};

/** A measure that fails, or is reached after the view's time is up, is not run, with why. */
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
		await page.emulateMediaFeatures([CHECKED_IN]);
		if ((await within(LOAD_MS, page.goto(url, { waitUntil: 'load', timeout: LOAD_MS }))) === null) throw new Error('the page did not load in time');
		// Measured when the view has what it waits for (a simulated request, a transition), not a moment after it opens.
		await within(LOAD_MS, page.evaluate(settleScript()));
		await ask('watched()');
		withAxe = false;
	};
	const axeIn = async () => {
		if (!withAxe) await page.evaluate(`${axe.source};true`);
		withAxe = true;
	};
	const contrast = async (path: string | null, state: string): Promise<ContrastRow[]> => {
		await axeIn();
		const rows = (await within(ASK_MS, page.evaluate(contrastScript(path, state)))) as ContrastRow[] | null;
		// Not answered is not measured: never an empty table that reads as none found.
		if (rows === null) throw new Error(`axe's contrast rule did not answer in time, on ${state}`);
		return rows;
	};

	const settle = async () => {
		try {
			await ask('quiet()');
		} catch {
			// The page went while it was asked (it navigated): what is next is asked of the one that came.
			await pause(500);
		}
	};
	const changeSince = async (before: string): Promise<string | null> =>
		otherPage(before, page.url())
			? `went to another address (${page.url()})`
			: contextChange(await ask<Watched>('watched()'), await ask<{ dialog: boolean; replaced: boolean }>('becameAnother()'));
	/** A cell that found none in only part of what it measures is not run, never "none found". */
	const onlyPart = (cells: CellId[], why: string) => {
		for (const [i, r] of results.entries()) if (cells.includes(r.cell) && r.status === 'none') results[i] = notRun(r.cell, why);
	};

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
	await page.evaluateOnNewDocument(timerWatchScript());
	try {
		await load();
	} catch (err) {
		// A page that does not open is measured not at all: each cell says so, and the rest of a run goes on.
		const why = `the page did not open to be measured: ${errorText(err, { firstLine: true })}`;
		return { results: [...wanted].map((c) => notRun(c, why)), evidence, ms: Date.now() - started };
	}
	const contrastRows: ContrastRow[] = [];

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
	let capped = false;
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
		let ended = false;
		for (let i = 0; i < MOST.stops; i++) {
			const before = page.url();
			await page.keyboard.press('Tab');
			await ask('quiet(100, 1000)');
			const stop = await ask<Stop | null>('focused()');
			if (stop === null) {
				left = true;
				ended = true;
				break;
			}
			// In a frame from another site, Tab moves among its stops unseen: staying on it is not going round.
			if (stop.opaque && stops.at(-1)?.path === stop.path) continue;
			if (seen.has(stop.path)) {
				ended = true;
				// Round again without leaving the page: a trap, unless Escape lets it out.
				const cycle = stops.slice(stops.findIndex((s) => s.path === stop.path)).map((s) => s.path);
				await page.keyboard.press('Escape');
				await page.keyboard.press('Tab');
				const after = await ask<Stop | null>('focused()');
				const inModal = stops.filter((s) => cycle.includes(s.path)).every((s) => s.modal);
				// Out of it after Escape (on another stop, or off the page): not a trap.
				if (!inModal && expected.some((e) => !seen.has(e.path)) && after !== null && cycle.includes(after.path)) trapped = cycle;
				break;
			}
			seen.add(stop.path);
			const context = await changeSince(before);
			const clip = around(stop.at);
			await ask('focusSettled()');
			const focusedShot = Buffer.from(await page.screenshot({ type: 'png', clip }));
			await ask('blur()');
			const plainShot = Buffer.from(await page.screenshot({ type: 'png', clip }));
			await ask(`focus(${quote(stop.path)})`);
			const name = `stops/${String(stops.length + 1).padStart(2, '0')}.png`;
			evidence.push({ name, data: focusedShot });
			if (wanted.has('contrast-states') && options.depth === 'full') contrastRows.push(...(await contrast(stop.path, 'focus')));
			stops.push({ ...stop, picture: name, ...focusChange(plainShot, focusedShot), context });
			if (context && otherPage(before, page.url())) {
				ended = true;
				break;
			}
		}
		capped = !ended;
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

	if (capped)
		onlyPart(walkCells, `the page has more than ${MOST.stops} Tab stops: the first ${MOST.stops} were measured, and none of these was found in them`);

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
			await page.emulateMediaFeatures([CHECKED_IN, { name: 'forced-colors', value: 'active' }]);
			const gone = await ask<Spot[]>(`vanished(${quote(marks)})`);
			evidence.push({ name: 'forced-colors.jpg', data: await picture(page, view.width) });
			await page.emulateMediaFeatures([CHECKED_IN]);
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
		// What is cut off already, at the window's own size: what each of the next three adds to it is theirs.
		let baseline: Set<string> | null = null;
		const cutAlready = async () => (baseline ??= new Set((await ask<Spot[]>('clipped()')).map((s) => s.path)));
		const newlyClipped = async (was: Set<string>) =>
			(await ask<Spot[]>('clipped()')).filter((s) => !was.has(s.path)).map((s) => ({ target: s.path, detail: `“${s.text}” is cut off` }));
		await step(['reflow'], 'the page 320 pixels wide', async () => {
			const was = await cutAlready();
			await sized(320, 256);
			const o = await ask<{ width: number; window: number; past: Spot[] }>('overflow()');
			const cut = await newlyClipped(was);
			evidence.push({ name: 'reflow-320.jpg', data: await picture(page, 320) });
			await sized(view.width, view.height);
			const sideways =
				o.width > o.window + 1
					? o.past.map((s) => ({ target: s.path, detail: `runs past the window's edge: the page is ${o.width} pixels wide in 320` }))
					: [];
			return [resultFrom('reflow', [...sideways, ...cut])];
		});
		await step(['resize-text'], 'the page at 200%', async () => {
			const was = await cutAlready();
			await sized(view.width / 2, view.height / 2, 2);
			const cut = await newlyClipped(was);
			evidence.push({ name: 'zoom-200.jpg', data: await picture(page, view.width / 2) });
			await sized(view.width, view.height);
			return [resultFrom('resize-text', cut)];
		});
		await step(['text-spacing'], 'WCAG’s text spacing', async () => {
			const was = await cutAlready();
			await ask('textSpacing(true)');
			const cut = await newlyClipped(was);
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

		await step(['hover-content', 'contrast-states'], 'hover', async () => {
			const found: ProbeFinding[] = [];
			let shown = 0;
			await ask('blur()');
			for (const target of (await ask<Spot[]>('tabbables()')).slice(0, MOST.hovers)) {
				const at = await ask<Spot | null>(`reveal(${quote(target.path)})`);
				if (!at) continue;
				await ask('mark()');
				await page.mouse.move(at.box.x + at.box.width / 2, at.box.y + at.box.height / 2);
				await settle();
				contrastRows.push(...(await contrast(target.path, 'hover')));
				const content = (await ask<Spot[]>(`appeared(${quote(target.path)})`))[0];
				if (content) {
					shown++;
					await page.mouse.move(content.box.x + content.box.width / 2, content.box.y + content.box.height / 2);
					await settle();
					const hoverable = await ask<boolean>(`stillShown(${quote(content.path)})`);
					await pause(STAYS_MS);
					const stays = await ask<boolean>(`stillShown(${quote(content.path)})`);
					await page.keyboard.press('Escape');
					await settle();
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

		await step(['keyboard-operate'], 'operating each control by key', async () => {
			await load();
			const controls = (await ask<Spot[]>('customControls()')).slice(0, MOST.controls);
			if (controls.length === 0) return [notApplicable('keyboard-operate', 'no control here is written with a role')];
			const found: ProbeFinding[] = [];
			let tried = 0;
			for (const control of controls) {
				await load();
				// One that cannot take focus cannot be tried with a key: that is keyboard-reach's to say.
				if (!(await ask<boolean>(`focus(${quote(control.path)})`))) continue;
				tried++;
				await ask('watched()');
				const before = page.url();
				await page.keyboard.press('Enter');
				await page.keyboard.press(' ');
				await settle();
				const byKey = (await ask<Watched>('watched()')).changes + (otherPage(before, page.url()) ? 1 : 0);
				await load();
				const at = await ask<Spot | null>(`reveal(${quote(control.path)})`);
				if (!at) continue;
				await ask('watched()');
				await page.mouse.click(at.box.x + at.box.width / 2, at.box.y + at.box.height / 2);
				await settle();
				const byClick = (await ask<Watched>('watched()')).changes + (otherPage(before, page.url()) ? 1 : 0);
				if (byClick > 0 && byKey === 0)
					found.push({ target: control.path, detail: `“${control.text}” does something on a click, and nothing on Enter or Space` });
			}
			if (tried === 0) return [notRun('keyboard-operate', 'none of its controls written with a role takes focus, so no key could be tried on one')];
			return [resultFrom('keyboard-operate', found)];
		});
		const liveLog: { used: string; added: Watched['added'] }[] = [];
		await step(['status-messages'], 'what each button says as it is used', async () => {
			await load();
			const all = await ask<Button[]>('buttons()');
			if (all.length === 0) return [notApplicable('status-messages', 'no button here to use')];
			// One that opens or closes what it names shows that, which is not a message.
			const buttons = all.filter((b) => !b.discloses).slice(0, MOST.buttons);
			if (buttons.length === 0) return [notApplicable('status-messages', 'every button here opens or closes something it names')];
			const found: ProbeFinding[] = [];
			for (const button of buttons) {
				await load();
				const at = await ask<Spot | null>(`reveal(${quote(button.path)})`);
				if (!at) continue;
				await ask('watched()');
				await page.mouse.click(at.box.x + at.box.width / 2, at.box.y + at.box.height / 2);
				await settle();
				const added = (await ask<Watched>('watched()')).added;
				liveLog.push({ used: button.path, added });
				const message = added.find((a) => !a.live && !a.dialog && !a.interactive && !a.inPlace && a.length <= MOST_MESSAGE);
				if (message) found.push({ target: button.path, detail: `“${message.text}” appeared after it was used, outside any live region` });
			}
			evidence.push({ name: 'live-regions.json', data: JSON.stringify(liveLog, null, 1) });
			return [resultFrom('status-messages', found)];
		});

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
				await settle();
				const change = await changeSince(before);
				if (change) found.push({ target: spot.path, detail: `changing it ${change}` });
			}
			return [resultFrom('on-input', found)];
		});
		await step(['error-identification'], 'sending each form', async () => {
			await load();
			const forms = (await ask<{ path: string; submit: string | null }[]>('forms()')).slice(0, MOST.forms);
			if (forms.length === 0)
				return (await ask<Field[]>('inputs()')).length
					? [notRun('error-identification', "the page's fields are in no form, so none could be sent to see its errors: send them by hand")]
					: [notApplicable('error-identification', 'no form here to send')];
			const found: ProbeFinding[] = [];
			let sent = 0;
			for (const form of forms) {
				if (!form.submit) continue;
				await load();
				const at = await ask<Spot | null>(`reveal(${quote(form.submit)})`);
				if (!at) continue;
				await ask('mark()');
				const before = page.url();
				await page.mouse.click(at.box.x + at.box.width / 2, at.box.y + at.box.height / 2);
				await settle();
				sent++;
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
			if (sent === 0) return [notRun('error-identification', 'no form here has a button that sends it, so none was sent')];
			return [resultFrom('error-identification', found)];
		});
	}

	const read = await ask<Read>('howMuch()').catch(() => null);
	if (read?.capped) onlyPart([...wanted], `the page has more elements than the probe reads (${read.elements}): what it read had none of these`);
	return { results, evidence, ms: Date.now() - started };
};
