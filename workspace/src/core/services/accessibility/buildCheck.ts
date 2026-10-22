// A check that cannot run never stops a build.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { AccessibilityIssue, AccessibilityResult } from '../../../shared/contract';
import { type DeclaredTarget, targetLine } from '../../../shared/wcag';
import { atTarget } from '../../../shared/wcagCriteria';
import { WORDS } from '../../../shared/accessibility';
import { findingsLines } from './accessibilityBrief';
import type { MeasureRecord } from './accessibilityRecord';
import { jsonFile, writeAtomic } from '../platform/jsonFile';
import { type CellResult, cellLines } from './probe/cells';
import { type MeasureBrowser, measurePrototype, sharedIn } from './prototypeMeasure';
import { type Looked, lookText, looksDir } from '../prototypes/looks';

export const MOST_ROUNDS = 2;

export interface CheckConfig {
	prototypeId: string;
	name: string;
	of: string;
	page: string;
	source: string;
	sharedDir: string;
	target: DeclaredTarget;
	/** Beside the page, so the panel shows what the build found. */
	cache: string;
	record: string;
}

export interface CheckRecord {
	/** The page's hash. */
	page: string;
	rounds: number;
	left: boolean;
	target: DeclaredTarget;
	result: AccessibilityResult;
	views: { state: string; results: CellResult[] }[];
}

const hashOf = (html: string) => createHash('sha256').update(html).digest('hex').slice(0, 16);

/** Findings above the target, and words, are said, not sent back to the agent. */
const toFix = (result: AccessibilityResult, views: CheckRecord['views'], target: DeclaredTarget) => ({
	axe: result.violations.filter((i) => !WORDS.has(i.rule)),
	probe: views.flatMap((v) => v.results.filter((r) => r.status === 'found' && atTarget(r.sc, target.target)).map((r) => ({ r, state: v.state }))),
	words: result.violations.filter((i) => WORDS.has(i.rule)),
	readiness: views.flatMap((v) => v.results.filter((r) => r.status === 'found' && !atTarget(r.sc, target.target))).length,
	notRun: views.flatMap((v) => v.results.filter((r) => r.status === 'notRun').map((r) => ({ r, state: v.state }))),
});

const readRecord = (file: string): CheckRecord | null =>
	jsonFile<CheckRecord | null>(file, { parse: (raw) => raw as CheckRecord, fallback: null }).read();

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
	// None found is only of what was measured, so what did not run is said.
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

/** Said whatever the accessibility found, and never what stops a build; where no picture could be taken, why. */
const lookLines = (looks: Looked | null): string[] =>
	looks === null
		? []
		: 'files' in looks
			? [lookText(looks.files)]
			: [`Pictures of the page could not be taken (${looks.why}), so look at the page some other way before you finish.`];

/** Exits as a build does: 1 while there is something to fix and rounds are left, else 0. */
export const checkBuild = async (config: CheckConfig, browser: MeasureBrowser): Promise<{ text: string; code: number }> => {
	const html = readFileSync(config.page, 'utf8');
	const measured = await measurePrototype({
		key: `${config.prototypeId}/${config.name}`,
		html,
		target: config.target,
		depth: 'light',
		sharedText: sharedIn(config.sharedDir),
		cache: config.cache,
		browser,
		looks: looksDir(config.page),
	});
	const views = measured.views.map(({ state, results }) => ({ state, results }));
	const fix = toFix(measured.result, views, config.target);
	const needs = fix.axe.length + fix.probe.length > 0;
	const last = readRecord(config.record);
	const rounds = (last?.rounds ?? 0) + (needs ? 1 : 0);
	const left = needs && rounds > MOST_ROUNDS;
	const record: CheckRecord = { page: hashOf(html), rounds, left, target: config.target, result: measured.result, views };
	writeAtomic(config.record, JSON.stringify(record));
	return { text: [checkText(config, fix, rounds, left), ...lookLines(measured.looks)].join('\n\n'), code: needs && !left ? 1 : 0 };
};

export const LEFT = `the build's own check sent it back ${MOST_ROUNDS} times, and it was still there`;

/** Null when this exact page was not checked (it changed after, or was never checked), so nothing stale goes on the record. */
export const checkedAsSaved = (config: Pick<CheckConfig, 'prototypeId' | 'name' | 'of' | 'record'>, html: string): MeasureRecord | null => {
	const record = readRecord(config.record);
	if (!record || record.page !== hashOf(html)) return null;
	return {
		prototypeId: config.prototypeId,
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
