/**
 * `dsnr accessibility` (A2 and A3 of the accessibility plan; decision 2): measures a project's work in a real browser, the
 * same way for any product, and writes what it found into the project's folder in the design repository as evidence.
 * DSNR calls the product, and the product does not call DSNR: a prototype's page is served here, and a product's own app
 * is started as its `.dsnr/workspace.json` says (`onDesignMode`), at the pages its manifest names. Each view that opens
 * is checked by axe, then probed (`services/probe`), at full depth unless asked for the light subset; the work's own
 * source is read for what a page cannot show. What it could not open, it says; with nothing opened, nothing is written.
 */
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { basename, join } from 'node:path';
import { checkedWith, countsOf, notAutomatedLine, summaryOf } from '../shared/accessibility';
import type { AccessibilityResult } from '../shared/contract';
import {
	accessibilityEvidenceDir,
	accessibilityLedgerPath,
	accessibilityPath,
	accessibilityViewDir,
	projectPath,
	prototypeSourcePath,
} from '../shared/designPaths';
import { statesOf, withState } from '../shared/prototypeStates';
import type { DeclaredTarget } from '../shared/wcag';
import { atTarget } from '../shared/wcagCriteria';
import { accessibilityOf } from '../main/services/accessibilityCheck';
import {
	MANIFEST_FILE,
	PAGES_SECTION,
	type AppPage,
	appPages,
	assistiveTechnology,
	declaredTarget,
	findingsLines,
} from '../main/services/accessibilityBrief';
import { FIRST_PAGE, type PageNotOpened, checkPages, onDesignMode } from '../main/services/accessibilityRun';
import { chromeHeadless } from '../main/services/chromeHeadless';
import { findCommand, readDescriptor } from '../main/services/descriptor';
import { DESIGN_MODE_COMMAND } from '../shared/work';
import { git } from '../main/services/git';
import { assertUsableProjectId } from '../main/services/iterations';
import { writeAtomic } from '../main/services/jsonFile';
import { assertPrototypeName } from '../main/services/prototype';
import { PrototypeServer } from '../main/services/prototypeServer';
import type { prototypeWork } from '../main/services/prototypeWork';
import { CELLS, type CellResult, type ProbeDepth, cellLines, cellsAt } from '../main/services/probe/cells';
import type { Evidence } from '../main/services/probe/probe';
import { type SourceFile, scanSources } from '../main/services/probe/sourceScan';
import { type Ledger, type LedgerRun, ledgerChanges, ledgerFaults } from '../main/services/ledger';
import { manualListFault, withManualSection } from '../main/services/manualList';
import { recordFiles } from '../main/services/accessibilityRecord';

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

/** One view probed: its name (a state, or a page), how long it took, what each cell found, and its evidence. */
interface ViewProbed {
	state: string;
	ms: number;
	results: CellResult[];
	evidence: Evidence[];
}

/** What was measured, in words, what axe found, and what the probe did; `pages` and `note` for an app, which pages and how they were chosen. */
interface Measured {
	what: string;
	target: DeclaredTarget;
	result: AccessibilityResult | null;
	notOpened: PageNotOpened[];
	views: ViewProbed[];
	source: CellResult[];
	pages?: AppPage[];
	note?: string;
	/** How a product's own app was run, for the manual list. */
	run?: LedgerRun;
}

/** Probes each view in turn, saying which as it goes. */
const probeViews = async (
	browser: Browser,
	views: { state: string; url: string }[],
	depth: ProbeDepth,
	progress: (line: string) => void,
): Promise<ViewProbed[]> => {
	const probed: ViewProbed[] = [];
	for (const { state, url } of views) {
		const { results, evidence, ms } = await browser.probe(url, { depth, progress: (step) => progress(`Probing ${state}: ${step}`) });
		probed.push({ state, ms, results, evidence });
	}
	return probed;
};

/** Files the probe does not read for source: words, data and pictures. */
const NOT_SOURCE = /\.(md|mdx|txt|json|lock|ya?ml|toml|svg|png|jpe?g|gif|webp|ico|woff2?|ttf|map|snap)$/i;

/**
 * The work's own files, for the source cells: what this checkout's branch changed from its remote's default branch,
 * committed or not. Null, with why, when the remote names no default branch to tell them from the rest.
 */
const changedSources = async (root: string): Promise<{ files: SourceFile[] | null; why: string }> => {
	const base = (await git(root, ['rev-parse', '--abbrev-ref', 'origin/HEAD']).catch(() => '')).trim();
	if (!base || base === 'origin/HEAD')
		return { files: null, why: "this checkout's remote names no default branch, so the work's own files could not be told from the rest" };
	const from = (await git(root, ['merge-base', 'HEAD', base])).trim();
	const names = (await git(root, ['diff', '--name-only', '--diff-filter=AMR', from])).split('\n').filter((n) => n.trim() && !NOT_SOURCE.test(n));
	const files = names.flatMap((path) => (existsSync(join(root, path)) ? [{ path, text: readFileSync(join(root, path), 'utf8') }] : []));
	return { files, why: '' };
};

const sourceCells = (depth: ProbeDepth) =>
	cellsAt(depth)
		.filter((c) => c.kind === 'source')
		.map((c) => c.id);

/** A prototype's page, served here with its shared files, in each of its states: the check the app makes, and keeps, the same; then probed. */
const prototypePage = async (
	{ projectId, name, work, depth }: MeasureDeps & { name: string },
	browser: Browser,
	progress: (line: string) => void,
): Promise<Measured> => {
	assertPrototypeName(name);
	const html = await work.page(projectId, name, false);
	if (html === null) throw new Error(`${projectId} ${name} has no page yet. Save it first (save-prototype), then measure it.`);
	const server = new PrototypeServer();
	try {
		const url = await server.servePage(`${projectId}/${name}`, html, work.sharedText);
		progress(`Checking ${projectId} ${name}'s page`);
		const target = await work.target(projectId, name);
		const states = statesOf(html);
		const result = await accessibilityOf({ file: work.checkFile(projectId, name), html, url, states, target, check: browser.scan });
		// Each state as the check opens it: the page as it opens, when it has none.
		const opened = (states.length ? states : [null]).map((s) => ({ state: s ?? 'default', url: withState(url, s) }));
		const views = await probeViews(browser, opened, depth, progress);
		const text = await work.sourceText(projectId, name);
		const source = scanSources(
			sourceCells(depth),
			text === null ? null : [{ path: prototypeSourcePath(projectId, name), text }],
			'the prototype has no source saved',
		);
		return { what: `${projectId} ${name}'s page`, target, result, notOpened: [], views, source };
	} finally {
		server.close();
	}
};

/** The product's own app in design mode, at the pages its manifest names, else as it opens; at the manifest's target; each page that opened probed. */
const productApp = async ({ projectId, root, depth }: MeasureDeps, browser: Browser, progress: (line: string) => void): Promise<Measured> => {
	const descriptor = readDescriptor(root);
	const file = join(root, descriptor.contextDir, MANIFEST_FILE);
	const manifest = existsSync(file) ? readFileSync(file, 'utf8') : null;
	const named = appPages(manifest);
	const pages = named ?? [FIRST_PAGE];
	const target = declaredTarget(manifest, descriptor.product);
	const {
		result,
		notOpened,
		views,
		origin: served,
	} = await onDesignMode({ root, descriptor, projectId, loads: browser.loads, progress }, async (origin, opens) => {
		const checked = await checkPages({ origin, pages, target, check: browser.scan, opens, progress });
		const opened = pages.filter((p) => !checked.notOpened.some((n) => n.path === p.path));
		return {
			...checked,
			origin,
			views: await probeViews(
				browser,
				opened.map((p) => ({ state: p.name, url: new URL(p.path, origin).href })),
				depth,
				progress,
			),
		};
	});
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
	const cells = cellsAt(depth).length;
	return [
		'',
		`Probed at ${depth} depth (${cells} of the ${CELLS.length} cells), in ${views.map((v) => `${v.state} (${(v.ms / 1000).toFixed(1)} s)`).join(', ') || 'no view'}.`,
		...(at.length ? ['', 'Found by the probe, at the target:', ...at.flatMap(({ r, where }) => cellLines(r, where))] : []),
		...(above.length
			? ['', 'Found by the probe, above the target (readiness, not counted as it):', ...above.flatMap(({ r, where }) => cellLines(r, where))]
			: []),
		...(notRun.length ? ['', 'Not run:', ...notRun.flatMap(({ r, where }) => cellLines(r, where))] : []),
		'',
		'Every other cell found none of what it measures, or does not apply here (each is in the evidence): neither is a pass.',
	];
};

/** The probe's own evidence, written fresh: a folder per view (its cells are the record's), and nothing of an earlier run left. */
const writeEvidence = (projectId: string, name: string | null, designRoot: string, views: ViewProbed[]): void => {
	rmSync(join(designRoot, accessibilityEvidenceDir(projectId, name)), { recursive: true, force: true });
	for (const view of views)
		for (const e of view.evidence)
			if (e.name !== 'cells.json') writeAtomic(join(designRoot, accessibilityViewDir(projectId, name, view.state), e.name), e.data);
};

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
	const evidence = accessibilityEvidenceDir(projectId, name);
	const path = accessibilityPath(projectId, name);
	const reviewFile = join(designRoot, projectPath(projectId, 'review.md'));
	const ledgerFile = accessibilityLedgerPath(projectId, name);
	const last = readLedger(join(designRoot, ledgerFile));
	const { files, ledger } = recordFiles(
		{ projectId, name, of: what, result, target: measured.target, depth, views, source, pages, notOpened, run: measured.run },
		existsSync(reviewFile) ? readFileSync(reviewFile, 'utf8') : null,
	);
	for (const f of files) writeAtomic(join(designRoot, f.path), f.text);
	// A product's own app: the manual list, from the ledger, into the work's HANDOFF.md, for whoever tests it by hand (A8).
	const handoff = join(deps.root, 'HANDOFF.md');
	if (name === null)
		writeAtomic(
			handoff,
			withManualSection(existsSync(handoff) ? readFileSync(handoff, 'utf8') : null, ...manualArgs(ledger, ledgerFile, projectId, designRoot)),
		);
	const since = last ? ledgerChanges(last, ledger) : null;
	deps.out(
		[
			`Measured ${what}: ${summaryOf(countsOf(result))}.`,
			checkedWith(result),
			...[notAutomatedLine(result), note].filter((l): l is string => Boolean(l)),
			...unopened,
			...findingsLines(result),
			...probeLines(measured, depth),
			'',
			since
				? `Since the last run (${last?.at.slice(0, 10)}): ${since.newlyFound.length ? `newly found ${since.newlyFound.join(', ')}` : 'nothing newly found'}; ${since.noLongerFound.length ? `no longer found ${since.noLongerFound.join(', ')}` : 'nothing no longer found'}; ${since.changed.length} criteria changed in all.`
				: 'This is the first run of this measure: there is no ledger to compare with.',
			`Written to ${path} in ${designRoot}, with the evidence in ${evidence}/, the ledger in ${ledgerFile}, and the accessibility section of ${projectPath(projectId, 'review.md')} written from it.`,
		].join('\n'),
	);
	return 0;
};

/** What the manual list is made from: the ledger, and where its evidence and the testers' findings are, as the product's checkout sees them. */
const manualArgs = (ledger: Ledger, ledgerFile: string, projectId: string, designRoot: string): [Ledger, string, string, string] => {
	const design = basename(designRoot);
	return [
		ledger,
		`${design}/${ledgerFile}`,
		`${design}/${accessibilityEvidenceDir(projectId, null)}`,
		`${design}/${projectPath(projectId, 'accessibility/returned.md')}`,
	];
};

/** A ledger as it was written, or null when there is none, or it cannot be read as one. */
const readLedger = (file: string): Ledger | null => {
	try {
		const ledger = JSON.parse(readFileSync(file, 'utf8')) as Ledger;
		return ledger.version === 1 && Array.isArray(ledger.rows) ? ledger : null;
	} catch {
		return null;
	}
};

/**
 * `dsnr check-accessibility` (A5): what a gate asks of a measure's record. Its ledger is there; every status rests on an
 * evidence file that is there; every "not run" says why; and `review.md`'s section is the one the ledger writes. Says
 * each fault, and exits 1 when there is one, so a product's own gate can call it.
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
		out(`${ledgerFile} is not there, or is not a ledger: run dsnr accessibility --project ${projectId}${name ? ` --name ${name}` : ''} first.`);
		return 1;
	}
	const reviewFile = join(designRoot, projectPath(projectId, 'review.md'));
	const handoff = productRoot === null ? null : join(productRoot, 'HANDOFF.md');
	const listFault =
		name === null && handoff !== null
			? manualListFault(existsSync(handoff) ? readFileSync(handoff, 'utf8') : null, ...manualArgs(ledger, ledgerFile, projectId, designRoot))
			: null;
	const faults = [
		...ledgerFaults(ledger, ledgerFile, (p) => existsSync(join(designRoot, p)), existsSync(reviewFile) ? readFileSync(reviewFile, 'utf8') : null),
		...(listFault ? [listFault] : []),
	];
	out(
		faults.length
			? [`${ledgerFile}: ${faults.length} fault${faults.length === 1 ? '' : 's'}.`, ...faults.map((f) => `- ${f}`)].join('\n')
			: `${ledgerFile}: every status rests on its evidence, and review.md${name === null && handoff !== null ? ' and HANDOFF.md say' : ' says'} what the ledger says.`,
	);
	return faults.length ? 1 : 0;
};
