/**
 * A prototype build's own accessibility check (A6 of the accessibility plan; decision 30): run by the agent after it
 * builds, as it runs the build, it measures the page in a real browser in each of its states (axe at the product's
 * target, and the probe's light subset: the tree and the Tab walk), and says what to fix as a build says an error. What a
 * machine can verify, of the kinds the plan says AI can fix, the agent fixes in its own source, and builds and checks
 * again, for at most two rounds; then what is left is said, the agent finishes, and it is kept with the page, so saving
 * puts it on the record with why. Words a person must write (an image's text) are never for the agent: they are said,
 * for a person. A check that cannot run never stops a build.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AccessibilityIssue, AccessibilityResult } from '../../shared/contract';
import { statesOf, withState } from '../../shared/prototypeStates';
import { type DeclaredTarget, targetLine } from '../../shared/wcag';
import { atTarget } from '../../shared/wcagCriteria';
import { WORDS } from '../../shared/accessibility';
import { findingsLines } from './accessibilityBrief';
import { type CheckPage, resultOf } from './accessibilityCheck';
import type { MeasureRecord } from './accessibilityRecord';
import { writeAtomic } from './jsonFile';
import { type CellResult, cellLines } from './probe/cells';
import type { ProbeOptions, ViewProbed } from './probe/probe';
import { PrototypeServer } from './prototypeServer';

/** How many rounds a build's check sends back to the agent before what is left is left (decision 30). */
export const MOST_ROUNDS = 2;

/** What a build's check is given, by the task that asks for it: where the page and its shared files are, the target, and where its record goes. */
export interface CheckConfig {
	projectId: string;
	name: string;
	/** What it is, in words, for the record. */
	of: string;
	page: string;
	source: string;
	sharedDir: string;
	target: DeclaredTarget;
	/** Where the check keeps its rounds and what it found, beside the page. */
	record: string;
}

/** What a build's check found, kept beside the page: of which page (its hash), in how many rounds, and whether what is left was left. */
export interface CheckRecord {
	page: string;
	rounds: number;
	left: boolean;
	at: string;
	target: DeclaredTarget;
	result: AccessibilityResult;
	views: { state: string; results: CellResult[] }[];
}

/** The browser, as much of it as the check uses. */
export interface CheckBrowser {
	scan: CheckPage;
	probe(url: string, options: ProbeOptions): Promise<ViewProbed>;
}

const hashOf = (html: string) => createHash('sha256').update(html).digest('hex').slice(0, 16);

/** What of a check the agent fixes: axe's findings but words, and the probe's at the target. What is above it, and words, are said, not sent back. */
export const toFix = (result: AccessibilityResult, views: CheckRecord['views'], target: DeclaredTarget) => ({
	axe: result.violations.filter((i) => !WORDS.has(i.rule)),
	probe: views.flatMap((v) => v.results.filter((r) => r.status === 'found' && atTarget(r.sc, target.target)).map((r) => ({ r, state: v.state }))),
	words: result.violations.filter((i) => WORDS.has(i.rule)),
	readiness: views.flatMap((v) => v.results.filter((r) => r.status === 'found' && !atTarget(r.sc, target.target))).length,
	notRun: views.flatMap((v) => v.results.filter((r) => r.status === 'notRun').map((r) => ({ r, state: v.state }))),
});

const readRecord = (file: string): CheckRecord | null => {
	try {
		return JSON.parse(readFileSync(file, 'utf8')) as CheckRecord;
	} catch {
		return null;
	}
};

/** What the agent is told: what to fix, round by round, then what is left; and what is for a person. */
const checkText = (config: CheckConfig, fix: ReturnType<typeof toFix>, rounds: number, left: boolean): string => {
	const count = fix.axe.length + fix.probe.length;
	const where = (state: string, views: number) => (views > 1 ? `, in ${state}` : '');
	const listed = [
		...findingsLines({ violations: fix.axe as AccessibilityIssue[], incomplete: [] }),
		...(fix.probe.length
			? ['', 'Found by the probe:', ...fix.probe.flatMap(({ r, state }) => cellLines(r, where(state, new Set(fix.probe.map((p) => p.state)).size)))]
			: []),
	];
	const words = fix.words.length
		? [
				'',
				`For a person, not you: ${fix.words.map((i) => `${i.rule} (${i.nodes})`).join(', ')}. These need words a person writes: write none yourself.`,
			]
		: [];
	const readiness = fix.readiness
		? [`(${fix.readiness} probe finding${fix.readiness === 1 ? '' : 's'} above the target were left out: readiness, not this build's.)`]
		: [];
	const at = `at ${targetLine(config.target)}`;
	// What did not run is said with why: none found is only of what was measured.
	const unmeasured = fix.notRun.length
		? ['', 'Not run, so not measured:', ...fix.notRun.flatMap(({ r, state }) => cellLines(r, where(state, 2)))]
		: [];
	if (count === 0)
		return [
			`Accessibility: none found of what this check measures, ${at}. Not a pass: Handoff measures more.`,
			...unmeasured,
			...words,
			...readiness,
		].join('\n');
	if (left)
		return [
			`Accessibility: ${count} left after ${MOST_ROUNDS} rounds of this check, ${at}. Finish now: what is left is kept with the page, and put on its record when it is saved.`,
			...listed,
			...words,
		].join('\n');
	return [
		`Accessibility: ${count} to fix (round ${rounds} of ${MOST_ROUNDS}), ${at}. Fixing these is part of building the page, whatever else you were asked and whoever wrote them: fix each in ${config.source}, the way the standard says (the real element, the name of its action, the design system's component), changing nothing a fix does not need. Then build, and run this check again.`,
		...listed,
		...words,
		...readiness,
	].join('\n');
};

/**
 * Checks a built page as its task asks (`config`), counts the round, keeps what it found beside the page, and says what
 * to fix. Exits as a build does: 1 while there is something to fix and rounds are left, else 0.
 */
export const checkBuild = async (config: CheckConfig, browser: CheckBrowser, now = () => new Date()): Promise<{ text: string; code: number }> => {
	const html = readFileSync(config.page, 'utf8');
	const server = new PrototypeServer();
	try {
		const shared = async (n: string) => {
			const file = join(config.sharedDir, `${n}.datauri`);
			return existsSync(file) ? readFileSync(file, 'utf8') : null;
		};
		const url = await server.servePage(`${config.projectId}/${config.name}`, html, shared);
		const states = statesOf(html);
		const result = resultOf(await browser.scan(url, states, config.target.tags), config.target, now());
		const views: CheckRecord['views'] = [];
		for (const s of states.length ? states : [null])
			views.push({ state: s ?? 'default', results: (await browser.probe(withState(url, s), { depth: 'light' })).results });
		const fix = toFix(result, views, config.target);
		const needs = fix.axe.length + fix.probe.length > 0;
		const last = readRecord(config.record);
		const rounds = (last?.rounds ?? 0) + (needs ? 1 : 0);
		const left = needs && rounds > MOST_ROUNDS;
		const record: CheckRecord = { page: hashOf(html), rounds, left, at: now().toISOString(), target: config.target, result, views };
		writeAtomic(config.record, JSON.stringify(record));
		return { text: checkText(config, fix, rounds, left), code: needs && !left ? 1 : 0 };
	} finally {
		server.close();
	}
};

/** Why what a build's check found was left, as the record says it. */
export const LEFT = `the build's own check sent it back ${MOST_ROUNDS} times, and it was still there`;

/**
 * What a saved page's build check puts on its record (`recordFiles`): the check of exactly this page, or null when it was
 * not checked as it is saved (it changed after, or was never checked), so nothing stale goes on the record.
 */
export const checkedAsSaved = (config: Pick<CheckConfig, 'projectId' | 'name' | 'of' | 'record'>, html: string): MeasureRecord | null => {
	const record = readRecord(config.record);
	if (!record || record.page !== hashOf(html)) return null;
	return {
		projectId: config.projectId,
		name: config.name,
		of: config.of,
		result: record.result,
		target: record.target,
		depth: 'light, at build',
		views: record.views,
		source: [],
		...(record.left ? { left: LEFT } : {}),
	};
};
