/**
 * Measuring accessibility (T7 of the design system plan, part B; decision 30): axe-core run on a page in a hidden window
 * held as every page of someone else's code is (`sandboxedPage.ts`), in each of the page's states, with the target's
 * tags only. What it found is kept with what it was made with (the page, axe-core's version, the tags, the target), and
 * a result made with anything else is never given as current: it is made again.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import axe from 'axe-core';
import { type AxeRun, isAxeRules, mergeRuns } from '../../shared/accessibility';
import type { AccessibilityResult } from '../../shared/contract';
import { withState } from '../../shared/prototypeStates';
import { type DeclaredTarget, notAutomated, targetLine } from '../../shared/wcag';
import { hiddenWindow, within } from './sandboxedPage';

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

/** What runs in the page: axe-core itself, then a run limited to the tags, kept to violations and what it could not decide. */
const runAxe = (tags: string[]): string => `(async () => {
	await document.fonts.ready;
	await new Promise((r) => setTimeout(r, ${SETTLE_MS}));
	${axe.source}
	const r = await window.axe.run(document, { runOnly: { type: 'tag', values: ${JSON.stringify(tags)} }, resultTypes: ['violations', 'incomplete'] });
	const trim = (x) => ({ id: x.id, help: x.help, impact: x.impact ?? null, tags: x.tags, helpUrl: x.helpUrl, nodes: x.nodes.length });
	return { violations: r.violations.map(trim), incomplete: r.incomplete.map(trim) };
})()`;

export const checkInWindow: CheckPage = async (url, states, tags) => {
	const win = hiddenWindow(SESSION, new URL(url).origin, WINDOW);
	try {
		const runs: AxeRun[] = [];
		for (const state of states.length ? states : [null]) {
			const wc = win.webContents;
			if (
				(await within(
					STATE_MS,
					wc.loadURL(withState(url, state)).then(() => true),
				)) === null
			)
				throw new Error(`The page did not load in its ${state} state, so it could not be checked.`);
			const found = (await within(STATE_MS, wc.executeJavaScript(runAxe(tags)))) as { violations: unknown; incomplete: unknown } | null;
			if (found === null || !isAxeRules(found.violations) || !isAxeRules(found.incomplete))
				throw new Error(`The accessibility check did not finish in the page's ${state} state.`);
			runs.push({ state: state ?? 'default', violations: found.violations, incomplete: found.incomplete });
		}
		return runs;
	} finally {
		win.destroy();
	}
};

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
	const runs = await check(url, states, target.tags);
	const result: AccessibilityResult = {
		ran: {
			axe: axe.version,
			tags: target.tags,
			target: targetLine(target),
			declared: target.declared,
			at: now().toISOString(),
			states: runs.map((r) => r.state),
		},
		...mergeRuns(runs),
		notAutomated: notAutomated(target.target),
	};
	mkdirSync(dirname(file), { recursive: true });
	writeFileSync(`${file}.new`, JSON.stringify({ key, result }));
	renameSync(`${file}.new`, file);
	return result;
};
