/**
 * DSNR calls the product, never the reverse: a prototype's page is served here; a product's own app is started as its
 * `.dsnr/workspace.json` says.
 */
import { existsSync, rmSync } from 'node:fs';
import { basename, join } from 'node:path';
import { checkedWith, countsOf, summaryOf } from '../shared/accessibility';
import type { AccessibilityResult } from '../shared/contract';
import {
	accessibilityEvidenceDir,
	accessibilityGuardsPath,
	accessibilityLedgerPath,
	accessibilityPath,
	accessibilityReturnedPath,
	accessibilityReturnedRecordPath,
	accessibilityViewDirs,
	prototypePath,
	prototypeSourcePath,
} from '../shared/designPaths';
import { plural } from '../shared/plural';
import { errorText } from '../shared/result';
import type { DeclaredTarget } from '../shared/wcag';
import { atTarget } from '../shared/wcagCriteria';
import { DESIGN_MODE_COMMAND } from '../shared/work';
import {
	PAGES_SECTION,
	type AppPage,
	appPages,
	assistiveTechnology,
	declaredTarget,
	findingsLines,
	readManifest,
} from '../core/services/accessibility/accessibilityBrief';
import { prototypeMeasureName, recordFiles } from '../core/services/accessibility/accessibilityRecord';
import { FIRST_PAGE, type PageNotOpened, checkPages, onDesignMode } from '../core/services/accessibility/accessibilityRun';
import { chromeHeadless } from '../core/services/browser/chromeHeadless';
import { findCommand, readDescriptor } from '../core/services/products/descriptor';
import { HANDOFF_FILE } from '../core/services/codebase/engineeringHandoff';
import { git } from '../core/services/platform/git';
import { guardLines, guardsFor, stacksOf } from '../core/services/accessibility/guards';
import { assertUsablePrototypeId } from '../core/services/prototypes/workRecords';
import { jsonFile, readText, writeAtomic } from '../core/services/platform/jsonFile';
import { LEDGER_VERSION, type Ledger, type LedgerRun, ledgerChanges, ledgerFaults } from '../core/services/accessibility/ledger';
import { manualListFault, withManualSection } from '../core/services/accessibility/manualList';
import { CELLS, type CellResult, type ProbeDepth, cellLines, cellsAt } from '../core/services/accessibility/probe/cells';
import type { ViewProbed } from '../core/services/accessibility/probe/probe';
import { type SourceFile, scanSources } from '../core/services/accessibility/probe/sourceScan';
import { assertVersionName } from '../core/services/prototypes/prototype';
import { measurePrototype } from '../core/services/accessibility/prototypeMeasure';
import type { versionWork } from '../core/services/prototypes/versionWork';
import { type ReturnedKind, agentGapsFile, parseReturned, returnedTemplate, sortReturned, withGaps } from '../core/services/accessibility/returned';

export interface MeasureDeps {
	prototypeId: string;
	/** Null for the product's own app. */
	name: string | null;
	/** All of it at Handoff, the light subset at a build. */
	depth: ProbeDepth;
	root: string;
	designRoot: string;
	work: ReturnType<typeof versionWork>;
	out: (text: string) => void;
	/** Progress, so a long run is never silent. */
	err: (text: string) => void;
}

type Browser = ReturnType<typeof chromeHeadless>;

/** `state` is a state, or an app's page. */
type MeasuredView = ViewProbed & { state: string };

/** `pages`, `note` and `run` are for a product's own app. */
interface Measured {
	what: string;
	target: DeclaredTarget;
	result: AccessibilityResult | null;
	notOpened: PageNotOpened[];
	views: MeasuredView[];
	source: CellResult[];
	pages?: AppPage[];
	note?: string;
	run?: LedgerRun;
}

const NOT_SOURCE = /\.(md|mdx|txt|json|lock|ya?ml|toml|svg|png|jpe?g|gif|webp|ico|woff2?|ttf|map|snap)$/i;

/** What this checkout's branch changed from its remote's default branch, committed or not. */
const changedSources = async (root: string): Promise<{ files: SourceFile[] | null; why: string }> => {
	const base = (await git(root, ['rev-parse', '--abbrev-ref', 'origin/HEAD']).catch(() => '')).trim();
	if (!base || base === 'origin/HEAD')
		return { files: null, why: "this checkout's remote names no default branch, so the work's own files could not be told from the rest" };
	try {
		const from = (await git(root, ['merge-base', 'HEAD', base])).trim();
		const names = (await git(root, ['diff', '--name-only', '--diff-filter=AMR', from])).split('\n').filter((n) => n.trim() && !NOT_SOURCE.test(n));
		const files = names.flatMap((path) => {
			const text = readText(join(root, path));
			return text === null ? [] : [{ path, text }];
		});
		return { files, why: '' };
	} catch (err) {
		// A shallow clone, say, has no shared history to tell the work's files by: said, and the rest is still written.
		return { files: null, why: `the work's own files could not be told from the rest (${errorText(err, { firstLine: true })})` };
	}
};

const sourceCells = (depth: ProbeDepth) =>
	cellsAt(depth)
		.filter((c) => c.kind === 'source')
		.map((c) => c.id);

/** Measured as its build's check measures it (`measurePrototype`). */
const prototypePage = async (
	{ prototypeId, name, work, depth }: MeasureDeps & { name: string },
	browser: Browser,
	progress: (line: string) => void,
): Promise<Measured> => {
	assertVersionName(name);
	const html = await work.page(prototypeId, name);
	if (html === null) throw new Error(`${prototypeId} ${name} has no page yet. Save it first (save-prototype), then measure it.`);
	const what = prototypeMeasureName(prototypeId, name);
	progress(`Checking ${what}`);
	const target = await work.target(prototypeId, name);
	const { result, views } = await measurePrototype({
		key: `${prototypeId}/${name}`,
		html,
		target,
		depth,
		sharedText: work.sharedText,
		cache: work.checkFile(prototypeId, name),
		browser,
		progress,
	});
	const text = await work.sourceText(prototypeId, name);
	const source = scanSources(
		sourceCells(depth),
		text === null ? null : [{ path: prototypeSourcePath(prototypeId, name), text }],
		'the prototype has no source saved',
	);
	return { what, target, result, notOpened: [], views, source };
};

const productApp = async ({ prototypeId, root, depth }: MeasureDeps, browser: Browser, progress: (line: string) => void): Promise<Measured> => {
	const descriptor = readDescriptor(root);
	const manifest = readManifest(join(root, descriptor.contextDir));
	const named = appPages(manifest);
	const pages = named ?? [FIRST_PAGE];
	const target = declaredTarget(manifest, descriptor.product);
	const { result, notOpened, views, served } = await onDesignMode(
		{ root, descriptor, prototypeId, loads: browser.loads, progress },
		async (origin, opens) => {
			const checked = await checkPages({ origin, pages, target, check: browser.scan, opens, progress });
			const probed: MeasuredView[] = [];
			for (const p of pages.filter((page) => !checked.notOpened.some((n) => n.path === page.path)))
				probed.push({
					state: p.name,
					...(await browser.probe(new URL(p.path, origin).href, { depth, progress: (step) => progress(`Probing ${p.name}: ${step}`) })),
				});
			return { ...checked, views: probed, served: origin };
		},
	);
	const { files, why } = await changedSources(root);
	return {
		what: `${descriptor.product}'s app in design mode`,
		target,
		result,
		notOpened,
		views,
		source: scanSources(sourceCells(depth), files, why),
		pages,
		// How a tester runs it as it was measured: the manual list's first part.
		run: {
			command: findCommand(descriptor, DESIGN_MODE_COMMAND).argv.join(' '),
			address: served,
			pages,
			data: 'its own mock data, as its design mode runs',
			assistiveTechnology: assistiveTechnology(manifest),
		},
		...(named
			? {}
			: {
					note: `${descriptor.product}'s manifest names no pages to check (its "## ${PAGES_SECTION}" section), so only the app as it opens, at /, was checked.`,
				}),
	};
};

const probeLines = ({ views, source, target }: Measured, depth: ProbeDepth): string[] => {
	const all = [
		...views.flatMap((v) => v.results.map((r) => ({ r, where: views.length > 1 ? `, in ${v.state}` : '' }))),
		...source.map((r) => ({ r, where: '' })),
	];
	const found = all.filter(({ r }) => r.status === 'found');
	const at = found.filter(({ r }) => atTarget(r.sc, target.target));
	const above = found.filter(({ r }) => !atTarget(r.sc, target.target));
	const notRun = all.filter(({ r }) => r.status === 'notRun');
	return [
		'',
		`Probed at ${depth} depth (${cellsAt(depth).length} of the ${CELLS.length} cells), in ${views.map((v) => `${v.state} (${(v.ms / 1000).toFixed(1)} s)`).join(', ') || 'no view'}.`,
		...(at.length ? ['', 'Found by the probe, at the target:', ...at.flatMap(({ r, where }) => cellLines(r, where))] : []),
		...(above.length
			? ['', 'Found by the probe, above the target (readiness, not counted as it):', ...above.flatMap(({ r, where }) => cellLines(r, where))]
			: []),
		...(notRun.length ? ['', 'Not run:', ...notRun.flatMap(({ r, where }) => cellLines(r, where))] : []),
		'',
		'Every other cell found none of what it measures, or does not apply here (each is in the evidence): neither is a pass.',
	];
};

const writeEvidence = (prototypeId: string, name: string | null, designRoot: string, views: MeasuredView[]): void => {
	rmSync(join(designRoot, accessibilityEvidenceDir(prototypeId, name)), { recursive: true, force: true });
	const dirs = accessibilityViewDirs(
		prototypeId,
		name,
		views.map((v) => v.state),
	);
	for (const view of views) for (const e of view.evidence) writeAtomic(join(designRoot, dirs.get(view.state) as string, e.name), e.data);
};

const dayOf = (iso: string): string => iso.slice(0, 10);

export const measureAccessibility = async (deps: MeasureDeps): Promise<number> => {
	const { prototypeId, name, designRoot, depth, work } = deps;
	assertUsablePrototypeId(prototypeId);
	// A version started here and not saved yet counts: its first build is measured before it is saved.
	if (!(await work.hasPrototype(prototypeId))) throw new Error(`There is no prototype ${prototypeId} in the design repository at ${designRoot}.`);
	const progress = (line: string) => deps.err(`${line}…`);
	const browser = chromeHeadless();
	let measured: Measured;
	try {
		measured = name === null ? await productApp(deps, browser, progress) : await prototypePage({ ...deps, name }, browser, progress);
	} finally {
		await browser.close();
	}
	const { what, result, notOpened, pages, note, views, source } = measured;
	const unopened = notOpened.map((p) => `${p.name} (${p.path}) did not open, so it was not measured: ${p.why}`);
	if (result === null) {
		deps.out([`Nothing of ${what} opened, so nothing was measured or written.`, ...unopened].join('\n'));
		return 1;
	}
	writeEvidence(prototypeId, name, designRoot, views);
	const ledgerFile = accessibilityLedgerPath(prototypeId, name);
	const last = readLedger(join(designRoot, ledgerFile));
	const { files, ledger } = recordFiles(
		{
			prototypeId,
			name,
			of: what,
			result,
			target: measured.target,
			depth,
			views: views.map((v) => ({ state: v.state, ms: v.ms, results: v.results, files: v.evidence.map((e) => e.name) })),
			source,
			pages,
			notOpened,
			run: measured.run,
		},
		readText(join(designRoot, prototypePath(prototypeId, 'review.md'))),
	);
	for (const f of files) writeAtomic(join(designRoot, f.path), f.text);
	const handoff = join(deps.root, HANDOFF_FILE);
	if (name === null) writeAtomic(handoff, withManualSection(readText(handoff), ...manualArgs(ledger, ledgerFile, prototypeId, designRoot)));
	const since = last ? ledgerChanges(last, ledger) : null;
	const kept =
		name === null
			? [
					...readReturned({ designRoot, root: deps.root, prototypeId, ledger: last ?? ledger, date: dayOf(ledger.at) }),
					...keepFixed({ designRoot, root: deps.root, prototypeId, last, fixed: since?.noLongerFound ?? [], date: dayOf(ledger.at) }),
				]
			: [];
	deps.out(
		[
			`Measured ${what}: ${summaryOf(countsOf(result))}.`,
			checkedWith(result),
			// Not axe's own line: here the probe and the source measure some of what axe has no rules for.
			...(result.notAutomated.length
				? [
						`Left to check by hand: ${result.notAutomated.join(', ')}. What the probe and the source did not measure of it is listed, criterion by criterion, in the ledger.`,
					]
				: []),
			...(note ? [note] : []),
			...unopened,
			...findingsLines(result),
			...probeLines(measured, depth),
			'',
			since && last
				? `Since the last run (${dayOf(last.at)}): ${since.newlyFound.length ? `newly found ${since.newlyFound.join(', ')}` : 'nothing newly found'}; ${since.noLongerFound.length ? `fixed ${since.noLongerFound.join(', ')}` : 'nothing fixed'}; ${since.changed.length === 1 ? '1 criterion' : `${since.changed.length} criteria`} changed in all.`
				: 'This is the first run of this measure: there is no ledger to compare with.',
			...kept,
			`Written to ${accessibilityPath(prototypeId, name)} in ${designRoot}, with the evidence in ${accessibilityEvidenceDir(prototypeId, name)}/, the ledger in ${ledgerFile}, and the accessibility section of ${prototypePath(prototypeId, 'review.md')} written from it.`,
		].join('\n'),
	);
	return 0;
};

/** Kept so each finding is sorted once, against the measure it was tested against. */
type Sorted = { id: string; sc: string; where: string; kind: ReturnedKind; against: string };

/** A `returned.md` that is not there yet is started, with its table, so a tester only adds rows. */
const readReturned = ({
	designRoot,
	root,
	prototypeId,
	ledger,
	date,
}: {
	designRoot: string;
	root: string;
	prototypeId: string;
	ledger: Ledger;
	date: string;
}): string[] => {
	const file = join(designRoot, accessibilityReturnedPath(prototypeId));
	const returned = readText(file);
	if (returned === null) {
		writeAtomic(file, returnedTemplate(prototypeId));
		return ['', `Started ${accessibilityReturnedPath(prototypeId)}, for testers to return what they find by hand.`];
	}
	const { findings, unreadable } = parseReturned(returned);
	// Each finding is sorted once, when it is first read; never again later, when the work may have changed under it.
	const record = join(designRoot, accessibilityReturnedRecordPath(prototypeId));
	const before = jsonFile<Sorted[]>(record, { parse: (raw) => (raw as { findings: Sorted[] }).findings ?? [], fallback: [] }).read();
	const known = new Map(before.map((f) => [f.id, f]));
	const fresh = sortReturned(
		findings.filter((f) => !known.has(f.id)),
		ledger,
	);
	const sorted: Sorted[] = findings.flatMap((f) => {
		const now = fresh.find((x) => x.finding.id === f.id);
		const was = known.get(f.id);
		return was ? [was] : now ? [{ id: f.id, sc: f.sc, where: f.where, kind: now.kind, against: ledger.at }] : [];
	});
	const descriptor = readDescriptor(root);
	const gaps = join(root, agentGapsFile(descriptor.contextDir));
	const { text, added } = withGaps(
		readText(gaps),
		descriptor.product,
		fresh.filter((x) => x.kind === 'escape'),
		date,
	);
	if (added) writeAtomic(gaps, text);
	writeAtomic(record, `${JSON.stringify({ read: date, findings: sorted, unreadable }, null, '\t')}\n`);
	if (findings.length === 0 && unreadable.length === 0) return [];
	const count = (k: ReturnedKind) => sorted.filter((x) => x.kind === k).length;
	return [
		'',
		`Returned by testers: ${plural(findings.length, 'finding')}. ${count('escape')} a machine measured and missed (escapes, the goal's count, which should be none)${added ? `, ${added} newly logged in ${agentGapsFile(descriptor.contextDir)}` : ''}; ${count('confirmed')} a machine had found too; ${count('unmeasured')} not measured that time; ${count('person')} only a person could find.`,
		...unreadable.map((u) => `- Line ${u.line} of returned.md could not be read as a finding, because ${u.why}: it is left as it is.`),
	];
};

const keepFixed = ({
	designRoot,
	root,
	prototypeId,
	last,
	fixed,
	date,
}: {
	designRoot: string;
	root: string;
	prototypeId: string;
	last: Ledger | null;
	fixed: string[];
	date: string;
}): string[] => {
	if (!last || fixed.length === 0) return [];
	const lines = guardLines(
		guardsFor(
			fixed.map((sc) => ({ sc, by: last.rows.find((r) => r.sc === sc)?.by ?? [] })),
			stacksOf(root),
		),
	);
	if (lines.length === 0) return [];
	const file = join(designRoot, accessibilityGuardsPath(prototypeId));
	const was =
		readText(file) ??
		'# Guards proposed to keep what was fixed fixed\n\nProposed by `dsnr accessibility` when a fault it found is no longer found: each for the product to take, never applied for it.\n';
	writeAtomic(file, `${was.trimEnd()}\n\n## ${date}\n\n${lines.join('\n')}\n`);
	return ['', `Fixed since the last run, and kept fixed by (proposed, in ${accessibilityGuardsPath(prototypeId)}):`, ...lines];
};

/** Paths as the product's checkout sees them. */
const manualArgs = (ledger: Ledger, ledgerFile: string, prototypeId: string, designRoot: string): [Ledger, string, string, string] => {
	const design = basename(designRoot);
	return [
		ledger,
		`${design}/${ledgerFile}`,
		`${design}/${accessibilityEvidenceDir(prototypeId, null)}`,
		`${design}/${accessibilityReturnedPath(prototypeId)}`,
	];
};

/** Null also for an older DSNR's ledger: then it is measured again. */
const readLedger = (file: string): Ledger | null =>
	jsonFile<Ledger | null>(file, {
		parse: (raw) => {
			const ledger = raw as Ledger;
			return ledger.version === LEDGER_VERSION && Array.isArray(ledger.rows) ? ledger : null;
		},
		fallback: null,
	}).read();

/** Returns 1 on any fault, so a product's own gate can call it. */
export const checkAccessibility = ({
	designRoot,
	productRoot,
	prototypeId,
	name,
	out,
}: {
	designRoot: string;
	/** Null when this is not run in one: HANDOFF.md is then not checked. */
	productRoot: string | null;
	prototypeId: string;
	name: string | null;
	out: (text: string) => void;
}): number => {
	assertUsablePrototypeId(prototypeId);
	if (name !== null) assertVersionName(name);
	const ledgerFile = accessibilityLedgerPath(prototypeId, name);
	const ledger = readLedger(join(designRoot, ledgerFile));
	if (ledger === null) {
		out(
			`${ledgerFile} is not there, or is not a ledger this DSNR writes: run dsnr accessibility --prototype ${prototypeId}${name ? ` --name ${name}` : ''} first.`,
		);
		return 1;
	}
	const checksList = name === null && productRoot !== null;
	const listFault = checksList
		? manualListFault(readText(join(productRoot, HANDOFF_FILE)), ...manualArgs(ledger, ledgerFile, prototypeId, designRoot))
		: null;
	const faults = [
		...ledgerFaults(ledger, ledgerFile, (p) => existsSync(join(designRoot, p)), readText(join(designRoot, prototypePath(prototypeId, 'review.md')))),
		...(listFault ? [listFault] : []),
	];
	out(
		faults.length
			? [`${ledgerFile}: ${plural(faults.length, 'fault')}.`, ...faults.map((f) => `- ${f}`)].join('\n')
			: `${ledgerFile}: every status rests on its evidence, and review.md${checksList ? ' and HANDOFF.md say' : ' says'} what the ledger says.`,
	);
	return faults.length ? 1 : 0;
};

export const readReturnedNow = ({
	designRoot,
	root,
	prototypeId,
	out,
}: {
	designRoot: string;
	root: string;
	prototypeId: string;
	out: (text: string) => void;
}): number => {
	assertUsablePrototypeId(prototypeId);
	const ledger = readLedger(join(designRoot, accessibilityLedgerPath(prototypeId, null)));
	if (ledger === null) {
		out(`There is no measure of ${prototypeId}'s app to read findings against: run dsnr accessibility --prototype ${prototypeId} first.`);
		return 1;
	}
	const lines = readReturned({ designRoot, root, prototypeId, ledger, date: dayOf(new Date().toISOString()) });
	out(lines.join('\n').trim() || 'Nothing has been returned yet.');
	return 0;
};
