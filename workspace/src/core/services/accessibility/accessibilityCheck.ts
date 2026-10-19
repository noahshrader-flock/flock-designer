import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import axe from 'axe-core';
import AXE from '../../../page/axe?page';
import { type AxeFound, type AxeRun, findingsAt, isAxeRules } from '../../../shared/accessibility';
import type { AccessibilityResult } from '../../../shared/contract';
import { type DeclaredTarget, notAutomated, targetLine } from '../../../shared/wcag';
import { writeAtomic } from '../platform/jsonFile';
import type { CheckPage } from '../../ports';

export const CHECK_WINDOW = { width: 1280, height: 900 } as const;
/**
 * Light whatever the machine is set to, so a page's dark styles never make one run differ from another. Set with every
 * other media feature a check sets, since setting them replaces the ones set before.
 */
export const CHECKED_IN = { name: 'prefers-color-scheme', value: 'light' } as const;
const SETTLE_MS = 300;

export const axeInPage = (tags: string[]): string =>
	`(async () => {\n${axe.source}\n${AXE}\nreturn await __fdPage.checkPage(${JSON.stringify(tags)}, ${SETTLE_MS});\n})()`;

export const axeFound = (v: unknown): v is AxeFound =>
	typeof v === 'object' &&
	v !== null &&
	isAxeRules((v as { violations?: unknown }).violations) &&
	isAxeRules((v as { incomplete?: unknown }).incomplete);

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

/** Raise whenever what a result holds changes, so a result an older DSNR kept is made again. */
const FORMAT = 2;

const keyOf = (html: string, target: DeclaredTarget): string =>
	createHash('sha256')
		.update(`${FORMAT}\0${html}\0${axe.version}\0${target.tags.join(',')}\0${targetLine(target)}`)
		.digest('hex');

/** The one kept in `file` when made with the same page, axe-core, tags and target; else made now and kept. */
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
