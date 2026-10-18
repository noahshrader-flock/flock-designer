/**
 * Measuring accessibility (T7 of the design system plan, part B; decision 30): axe-core run on a page in each of its
 * states, with the target's tags only, by whatever the shell gives to run it (`CheckPage`: headless Chrome,
 * `chromeHeadless.ts`). What it found is kept with what it was made with (the page, axe-core's version, the tags,
 * the target), and a result made with anything else is never given as current: it is made again.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import axe from 'axe-core';
import AXE from '../../../page/axe?page';
import { type AxeFound, type AxeRun, findingsAt, isAxeRules } from '../../../shared/accessibility';
import type { AccessibilityResult } from '../../../shared/contract';
import { type DeclaredTarget, notAutomated, targetLine } from '../../../shared/wcag';
import { writeAtomic } from '../platform/jsonFile';
import type { CheckPage } from '../../ports';

/** The size a page is checked at, a desktop's; how long it is given to settle after it has loaded, before axe reads it. */
export const CHECK_WINDOW = { width: 1280, height: 900 } as const;
/**
 * The color scheme a page is checked in: light, as it opens, whatever the machine measuring it is set to, so a page's
 * dark styles never make one run differ from another (a Mac that turns dark at night did). Set with every other media
 * feature a check sets, since setting them replaces the ones set before.
 */
export const CHECKED_IN = { name: 'prefers-color-scheme', value: 'light' } as const;
const SETTLE_MS = 300;

/**
 * What runs in a prototype's page to check it, whichever browser it is in (headless Chrome, or a
 * product's own, measured from the command line): once it has settled, axe-core itself, then a run over the whole page with `tags`.
 */
export const axeInPage = (tags: string[]): string =>
	`(async () => {\n${axe.source}\n${AXE}\nreturn await __fdPage.checkPage(${JSON.stringify(tags)}, ${SETTLE_MS});\n})()`;

/** Whether what a page gave back for `runAxe` is its results: a page's word, checked before it is used. */
export const axeFound = (v: unknown): v is AxeFound =>
	typeof v === 'object' &&
	v !== null &&
	isAxeRules((v as { violations?: unknown }).violations) &&
	isAxeRules((v as { incomplete?: unknown }).incomplete);

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
	...findingsAt(runs, target.tags),
	notAutomated: notAutomated(target.target),
});

/**
 * How a result is written: what it holds, as this app keeps it. Raised whenever that changes (2: each issue's elements, and
 * the best-practice rules apart, A1), so one an older app kept is made again.
 */
const FORMAT = 2;

/** What a result is made with: the page, axe-core's version, the tags and the target, and how it is written. Any change makes a new result. */
const keyOf = (html: string, target: DeclaredTarget): string =>
	createHash('sha256')
		.update(`${FORMAT}\0${html}\0${axe.version}\0${target.tags.join(',')}\0${targetLine(target)}`)
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
