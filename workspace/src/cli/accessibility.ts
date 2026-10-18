/**
 * `dsnr accessibility` (A2, A3, A5, A8 and A9 of the accessibility plan; decision 2): measures a project's work in a real
 * browser, the same way for any product, and writes what it found into the project's folder in the design repository as
 * evidence. DSNR calls the product, and the product does not call DSNR: a prototype's page is served here, and a product's
 * own app is started as its `.dsnr/workspace.json` says (`onDesignMode`), at the pages its manifest names. Each view that
 * opens is checked by axe, then probed (`services/probe`), at full depth unless asked for the light subset; the work's own
 * source is read for what a page cannot show. What it could not open, it says; with nothing opened, nothing is written.
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
	projectPath,
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
} from '../main/services/accessibilityBrief';
import { prototypeMeasureName, recordFiles } from '../main/services/accessibilityRecord';
import { FIRST_PAGE, type PageNotOpened, checkPages, onDesignMode } from '../main/services/accessibilityRun';
import { chromeHeadless } from '../main/services/chromeHeadless';
import { findCommand, readDescriptor } from '../main/services/descriptor';
import { HANDOFF_FILE } from '../main/services/engineeringHandoff';
import { git } from '../main/services/git';
import { guardLines, guardsFor, stacksOf } from '../main/services/guards';
import { assertUsableProjectId } from '../main/services/iterations';
import { jsonFile, readText, writeAtomic } from '../main/services/jsonFile';
import { LEDGER_VERSION, type Ledger, type LedgerRun, ledgerChanges, ledgerFaults } from '../main/services/ledger';
import { manualListFault, withManualSection } from '../main/services/manualList';
import { CELLS, type CellResult, type ProbeDepth, cellLines, cellsAt } from '../main/services/probe/cells';
import type { ViewProbed } from '../main/services/probe/probe';
import { type SourceFile, scanSources } from '../main/services/probe/sourceScan';
import { assertPrototypeName } from '../main/services/prototype';
import { measurePrototype } from '../main/services/prototypeMeasure';
import type { prototypeWork } from '../main/services/prototypeWork';
import { type ReturnedKind, agentGapsFile, parseReturned, returnedTemplate, sortReturned, withGaps } from '../main/services/returned';

export interface MeasureDeps {
	projectId: string;
	/** A prototype's name, to measure its page; null for the product's own app. */
	name: string | null;
	/** How deep the probe goes: all of it at Handoff, the light subset at a build. */
	depth: ProbeDepth;
	/** The product checkout, and the design repository beside it. */
	root: string;
	designRoot: string;
	work: ReturnType<typeof prototypeWork>;
	out: (text: string) => void;
	/** Where progress is said, so a long run is never silent. */
	err: (text: string) => void;
}

type Browser = ReturnType<typeof chromeHeadless>;

/** One view measured: its name (a state, or a page), and what the probe made of it. */
type MeasuredView = ViewProbed & { state: string };

/** What was measured, in words, what axe found, and what the probe did; `pages` and `note` for an app, which pages and how they were chosen. */
interface Measured {
	what: string;
	target: DeclaredTarget;
	result: AccessibilityResult | null;
	notOpened: PageNotOpened[];
	views: MeasuredView[];
	source: CellResult[];
	pages?: AppPage[];
	note?: string;
	/** How a product's own app was run, for the manual list. */
	run?: LedgerRun;
}

/** Files the probe does not read for source: words, data and pictures. */
const NOT_SOURCE = /\.(md|mdx|txt|json|lock|ya?ml|toml|svg|png|jpe?g|gif|webp|ico|woff2?|ttf|map|snap)$/i;

/**
 * The work's own files, for the source cells: what this checkout's branch changed from its remote's default branch,
 * committed or not. Null, with why, when they cannot be told from the rest.
 */
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

/** A prototype's page, measured as its build's check measures it (`measurePrototype`), and its source read. */
const prototypePage = async (
	{ projectId, name, work, depth }: MeasureDeps & { name: string },
	browser: Browser,
	progress: (line: string) => void,
): Promise<Measured> => {
	assertPrototypeName(name);
	const html = await work.page(projectId, name, false);
	if (html === null) throw new Error(`${projectId} ${name} has no page yet. Save it first (save-prototype), then measure it.`);
	const what = prototypeMeasureName(projectId, name);
	progress(`Checking ${what}`);
	const target = await work.target(projectId, name);
	const { result, views } = await measurePrototype({
		key: `${projectId}/${name}`,
		html,
		target,
		depth,
		sharedText: work.sharedText,
		cache: work.checkFile(projectId, name),
		browser,
		progress,
	});
	const text = await work.sourceText(projectId, name);
	const source = scanSources(
		sourceCells(depth),
		text === null ? null : [{ path: prototypeSourcePath(projectId, name), text }],
		'the prototype has no source saved',
	);
	return { what, target, result, notOpened: [], views, source };
};

/** The product's own app in design mode, at the pages its manifest names, else as it opens; at the manifest's target; each page that opened probed. */
const productApp = async ({ projectId, root, depth }: MeasureDeps, browser: Browser, progress: (line: string) => void): Promise<Measured> => {
	const descriptor = readDescriptor(root);
	const manifest = readManifest(join(root, descriptor.contextDir));
	const named = appPages(manifest);
	const pages = named ?? [FIRST_PAGE];
	const target = declaredTarget(manifest, descriptor.product);
	const { result, notOpened, views, served } = await onDesignMode(
		{ root, descriptor, projectId, loads: browser.loads, progress },
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

/** What the probe found, as the agent reads it: at the target first, then above it (readiness), then what was not run. */
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

/** The probe's own evidence (pictures, the tree, the Tab walk), written fresh in each view's folder: nothing of an earlier run is left. */
const writeEvidence = (projectId: string, name: string | null, designRoot: string, views: MeasuredView[]): void => {
	rmSync(join(designRoot, accessibilityEvidenceDir(projectId, name)), { recursive: true, force: true });
	const dirs = accessibilityViewDirs(
		projectId,
		name,
		views.map((v) => v.state),
	);
	for (const view of views) for (const e of view.evidence) writeAtomic(join(designRoot, dirs.get(view.state) as string, e.name), e.data);
};

/** A day, as the record says when something happened. */
const dayOf = (iso: string): string => iso.slice(0, 10);

export const measureAccessibility = async (deps: MeasureDeps): Promise<number> => {
	const { projectId, name, designRoot, depth } = deps;
	assertUsableProjectId(projectId);
	if (!existsSync(join(designRoot, projectPath(projectId, 'iterations.json'))))
		throw new Error(`There is no project ${projectId} in the design repository at ${designRoot}.`);
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
	// The probe's pictures and the rest of its evidence; then the record, its ledger and review.md's section, made one way.
	writeEvidence(projectId, name, designRoot, views);
	const ledgerFile = accessibilityLedgerPath(projectId, name);
	const last = readLedger(join(designRoot, ledgerFile));
	const { files, ledger } = recordFiles(
		{
			projectId,
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
		readText(join(designRoot, projectPath(projectId, 'review.md'))),
	);
	for (const f of files) writeAtomic(join(designRoot, f.path), f.text);
	// A product's own app: the manual list, from the ledger, into the work's HANDOFF.md, for whoever tests it by hand (A8).
	const handoff = join(deps.root, HANDOFF_FILE);
	if (name === null) writeAtomic(handoff, withManualSection(readText(handoff), ...manualArgs(ledger, ledgerFile, projectId, designRoot)));
	const since = last ? ledgerChanges(last, ledger) : null;
	// A product's own app: what testers sent back since, sorted and its escapes logged; and a guard for what was fixed (A9).
	const kept =
		name === null
			? [
					...readReturned({ designRoot, root: deps.root, projectId, ledger: last ?? ledger, date: dayOf(ledger.at) }),
					...keepFixed({ designRoot, root: deps.root, projectId, last, fixed: since?.noLongerFound ?? [], date: dayOf(ledger.at) }),
				]
			: [];
	deps.out(
		[
			`Measured ${what}: ${summaryOf(countsOf(result))}.`,
			checkedWith(result),
			// Not the app's line: here the probe and the source measure some of what axe has no rules for.
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
			`Written to ${accessibilityPath(projectId, name)} in ${designRoot}, with the evidence in ${accessibilityEvidenceDir(projectId, name)}/, the ledger in ${ledgerFile}, and the accessibility section of ${projectPath(projectId, 'review.md')} written from it.`,
		].join('\n'),
	);
	return 0;
};

/** How each returned finding was sorted, kept so each is sorted once: against the measure it was tested against. */
type Sorted = { id: string; sc: string; where: string; kind: ReturnedKind; against: string };

/**
 * What testers sent back (A9): the project's `returned.md` read, each finding sorted against the ledger it was tested
 * against, each escape logged once in the product's agent gap log, and the sort kept as the record's. A file that is not
 * there yet is started, with its table, so a tester only adds rows. What it did, in lines.
 */
const readReturned = ({
	designRoot,
	root,
	projectId,
	ledger,
	date,
}: {
	designRoot: string;
	root: string;
	projectId: string;
	ledger: Ledger;
	date: string;
}): string[] => {
	const file = join(designRoot, accessibilityReturnedPath(projectId));
	const returned = readText(file);
	if (returned === null) {
		writeAtomic(file, returnedTemplate(projectId));
		return ['', `Started ${accessibilityReturnedPath(projectId)}, for testers to return what they find by hand.`];
	}
	const { findings, unreadable } = parseReturned(returned);
	// Each finding is sorted once, when it is first read; never again later, when the work may have changed under it.
	const record = join(designRoot, accessibilityReturnedRecordPath(projectId));
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

/**
 * A guard for what this run fixed (A9): each fault the last run found, by what found it, with the product's own lint rule
 * that keeps it fixed where its stack has one, proposed in the record and said. What it did, in lines.
 */
const keepFixed = ({
	designRoot,
	root,
	projectId,
	last,
	fixed,
	date,
}: {
	designRoot: string;
	root: string;
	projectId: string;
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
	const file = join(designRoot, accessibilityGuardsPath(projectId));
	const was =
		readText(file) ??
		'# Guards proposed to keep what was fixed fixed\n\nProposed by `dsnr accessibility` when a fault it found is no longer found: each for the product to take, never applied for it.\n';
	writeAtomic(file, `${was.trimEnd()}\n\n## ${date}\n\n${lines.join('\n')}\n`);
	return ['', `Fixed since the last run, and kept fixed by (proposed, in ${accessibilityGuardsPath(projectId)}):`, ...lines];
};

/** What the manual list is made from: the ledger, and where its evidence and the testers' findings are, as the product's checkout sees them. */
const manualArgs = (ledger: Ledger, ledgerFile: string, projectId: string, designRoot: string): [Ledger, string, string, string] => {
	const design = basename(designRoot);
	return [
		ledger,
		`${design}/${ledgerFile}`,
		`${design}/${accessibilityEvidenceDir(projectId, null)}`,
		`${design}/${accessibilityReturnedPath(projectId)}`,
	];
};

/** A ledger as this DSNR writes it, or null when there is none, or it is not one (or an older DSNR's): then it is measured again. */
const readLedger = (file: string): Ledger | null =>
	jsonFile<Ledger | null>(file, {
		parse: (raw) => {
			const ledger = raw as Ledger;
			return ledger.version === LEDGER_VERSION && Array.isArray(ledger.rows) ? ledger : null;
		},
		fallback: null,
	}).read();

/**
 * `dsnr check-accessibility` (A5, A8): what a gate asks of a measure's record. Its ledger is there; every status rests on
 * an evidence file that is there; every "not run" says why; `review.md`'s section is the one the ledger writes; and, run
 * from the product's checkout, its HANDOFF.md carries the manual list the ledger writes. Says each fault, and exits 1
 * when there is one, so a product's own gate can call it.
 */
export const checkAccessibility = ({
	designRoot,
	productRoot,
	projectId,
	name,
	out,
}: {
	designRoot: string;
	/** The product's checkout, whose HANDOFF.md carries the manual list of its own app's measure; null when this is not run in one. */
	productRoot: string | null;
	projectId: string;
	name: string | null;
	out: (text: string) => void;
}): number => {
	assertUsableProjectId(projectId);
	if (name !== null) assertPrototypeName(name);
	const ledgerFile = accessibilityLedgerPath(projectId, name);
	const ledger = readLedger(join(designRoot, ledgerFile));
	if (ledger === null) {
		out(
			`${ledgerFile} is not there, or is not a ledger this DSNR writes: run dsnr accessibility --project ${projectId}${name ? ` --name ${name}` : ''} first.`,
		);
		return 1;
	}
	const checksList = name === null && productRoot !== null;
	const listFault = checksList
		? manualListFault(readText(join(productRoot, HANDOFF_FILE)), ...manualArgs(ledger, ledgerFile, projectId, designRoot))
		: null;
	const faults = [
		...ledgerFaults(ledger, ledgerFile, (p) => existsSync(join(designRoot, p)), readText(join(designRoot, projectPath(projectId, 'review.md')))),
		...(listFault ? [listFault] : []),
	];
	out(
		faults.length
			? [`${ledgerFile}: ${plural(faults.length, 'fault')}.`, ...faults.map((f) => `- ${f}`)].join('\n')
			: `${ledgerFile}: every status rests on its evidence, and review.md${checksList ? ' and HANDOFF.md say' : ' says'} what the ledger says.`,
	);
	return faults.length ? 1 : 0;
};

/** `dsnr read-returned` (A9): what testers sent back read now, against the project's last measure of its app, rather than at its next. */
export const readReturnedNow = ({
	designRoot,
	root,
	projectId,
	out,
}: {
	designRoot: string;
	root: string;
	projectId: string;
	out: (text: string) => void;
}): number => {
	assertUsableProjectId(projectId);
	const ledger = readLedger(join(designRoot, accessibilityLedgerPath(projectId, null)));
	if (ledger === null) {
		out(`There is no measure of ${projectId}'s app to read findings against: run dsnr accessibility --project ${projectId} first.`);
		return 1;
	}
	const lines = readReturned({ designRoot, root, projectId, ledger, date: dayOf(new Date().toISOString()) });
	out(lines.join('\n').trim() || 'Nothing has been returned yet.');
	return 0;
};
