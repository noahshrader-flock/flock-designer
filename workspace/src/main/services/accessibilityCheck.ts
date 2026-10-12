/**
 * Measuring accessibility (T7 of the design system plan, part B; decision 30): axe-core run on a page in a hidden window
 * held as every page of someone else's code is (`sandboxedPage.ts`), in each of the page's states, with the target's
 * tags only. What it found is kept with what it was made with (the page, axe-core's version, the tags, the target), and
 * a result made with anything else is never given as current: it is made again.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import axe from 'axe-core';
import { type AxeFound, type AxeRun, isAxeRules, mergeRuns } from '../../shared/accessibility';
import type { AccessibilityResult } from '../../shared/contract';
import { withState } from '../../shared/prototypeStates';
import { type DeclaredTarget, notAutomated, targetLine } from '../../shared/wcag';
import { hiddenWindow, within } from './sandboxedPage';
import { writeAtomic } from './jsonFile';

/** The windows' session, their own and in memory; their size, a desktop's; how long a state may take. */
const SESSION = 'dsnr-accessibility';
const WINDOW = { width: 1280, height: 900 };
const STATE_MS = 20_000;
/** How long the page is given to settle after it has loaded, before axe reads it. */
const SETTLE_MS = 300;

/**
 * Runs axe on a page in each of its `states`, with `tags`: one run per state, or one of the page as it opens when it has
 * none, said as `default`. A state that will not load or check fails the whole, said in words.
 */
export type CheckPage = (url: string, states: string[], tags: string[]) => Promise<AxeRun[]>;

/**
 * A run of axe already in the page (`axe.source`), as an expression: on `context` (axe's own, as source: `document`, or
 * what to include and exclude), with the `tags` only, kept to violations and what it could not decide, each trimmed to
 * what is kept. The one way the app runs axe: on a prototype's page, and on a design system's stories (D).
 */
export const axeRun = (context: string, tags: string[]): string => `(async () => {
	const r = await window.axe.run(${context}, { runOnly: { type: 'tag', values: ${JSON.stringify(tags)} }, resultTypes: ['violations', 'incomplete'] });
	const trim = (x) => ({ id: x.id, help: x.help, impact: x.impact ?? null, tags: x.tags, helpUrl: x.helpUrl, nodes: x.nodes.length });
	return { violations: r.violations.map(trim), incomplete: r.incomplete.map(trim) };
})()`;

/** Whether what a page gave back for `axeRun` is its results: a page's word, checked before it is used. */
export const axeFound = (v: unknown): v is AxeFound =>
	typeof v === 'object' &&
	v !== null &&
	isAxeRules((v as { violations?: unknown }).violations) &&
	isAxeRules((v as { incomplete?: unknown }).incomplete);

/** What runs in a prototype's page: once it has settled, axe-core itself, then a run over the whole page. */
const runAxe = (tags: string[]): string => `(async () => {
	await document.fonts.ready;
	await new Promise((r) => setTimeout(r, ${SETTLE_MS}));
	${axe.source}
	return await ${axeRun('document', tags)};
})()`;

export const checkInWindow: CheckPage = async (url, states, tags) => {
	const win = hiddenWindow(SESSION, new URL(url).origin, WINDOW);
	try {
		const runs: AxeRun[] = [];
		const wc = win.webContents;
		for (const state of states.length ? states : [null]) {
			const said = state ?? 'default';
			const loaded = await within(
				STATE_MS,
				wc.loadURL(withState(url, state)).then(() => true),
			);
			if (loaded === null) throw new Error(`The page did not load in its ${said} state, so it could not be checked.`);
			const found: unknown = await within(STATE_MS, wc.executeJavaScript(runAxe(tags)));
			if (!axeFound(found)) throw new Error(`The accessibility check did not finish in the page's ${said} state.`);
			runs.push({ state: said, ...found });
		}
		return runs;
	} finally {
		win.destroy();
	}
};

/** A result from axe's runs, one per state, at `target`: what it found, and what it was made with. */
export const resultOf = (runs: AxeRun[], target: DeclaredTarget, at: Date): AccessibilityResult => ({
	ran: {
		axe: axe.version,
		tags: target.tags,
		target: targetLine(target),
		declared: target.declared,
		at: at.toISOString(),
		states: runs.map((r) => r.state),
	},
	...mergeRuns(runs),
	notAutomated: notAutomated(target.target),
});

/** What a result is made with: the page, axe-core's version, the tags and the target. Any change makes a new result. */
const keyOf = (html: string, target: DeclaredTarget): string =>
	createHash('sha256')
		.update(`${html}\0${axe.version}\0${target.tags.join(',')}\0${targetLine(target)}`)
		.digest('hex');

/**
 * A page's result: the one kept beside it when it was made with the same page, axe-core, tags and target, else made now
 * with `check` and kept, written whole. `file` is where it is kept, beside the page.
 */
export const accessibilityOf = async ({
	file,
	html,
	url,
	states,
	target,
	check,
	now = () => new Date(),
}: {
	file: string;
	html: string;
	url: string;
	states: string[];
	target: DeclaredTarget;
	check: CheckPage;
	now?: () => Date;
}): Promise<AccessibilityResult> => {
	const key = keyOf(html, target);
	if (existsSync(file)) {
		try {
			const kept = JSON.parse(readFileSync(file, 'utf8')) as { key?: unknown; result?: AccessibilityResult };
			if (kept.key === key && kept.result) return kept.result;
		} catch {
			// Unreadable is the same as none: made again.
		}
	}
	const result = resultOf(await check(url, states, target.tags), target, now());
	writeAtomic(file, JSON.stringify({ key, result }));
	return result;
};
