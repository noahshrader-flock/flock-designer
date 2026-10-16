/**
 * `dsnr accessibility` (A2 and A3 of the accessibility plan; decision 2): measures a project's work in a real browser, the
 * same way for any product, and writes what it found into the project's folder in the design repository as evidence.
 * DSNR calls the product, and the product does not call DSNR: a prototype's page is served here, and a product's own app
 * is started as its `.dsnr/workspace.json` says (`onDesignMode`), at the pages its manifest names. Each view that opens
 * is checked by axe, then probed (`services/probe`), at full depth unless asked for the light subset; the work's own
 * source is read for what a page cannot show. What it could not open, it says; with nothing opened, nothing is written.
 */
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { checkedWith, countsOf, notAutomatedLine, summaryOf } from '../shared/accessibility';
import type { AccessibilityResult } from '../shared/contract';
import { accessibilityEvidenceDir, accessibilityPath, projectPath, prototypeSourcePath } from '../shared/designPaths';
import { statesOf, withState } from '../shared/prototypeStates';
import type { DeclaredTarget } from '../shared/wcag';
import { atTarget, wcagCriterion } from '../shared/wcagCriteria';
import { accessibilityOf } from '../main/services/accessibilityCheck';
import { MANIFEST_FILE, PAGES_SECTION, type AppPage, appPages, declaredTarget, findingsLines } from '../main/services/accessibilityBrief';
import { FIRST_PAGE, type PageNotOpened, checkPages, onDesignMode } from '../main/services/accessibilityRun';
import { chromeHeadless } from '../main/services/chromeHeadless';
import { readDescriptor } from '../main/services/descriptor';
import { git } from '../main/services/git';
import { assertUsableProjectId } from '../main/services/iterations';
import { writeAtomic } from '../main/services/jsonFile';
import { assertPrototypeName } from '../main/services/prototype';
import { PrototypeServer } from '../main/services/prototypeServer';
import type { prototypeWork } from '../main/services/prototypeWork';
import { CELLS, type CellResult, type ProbeDepth, cellsAt } from '../main/services/probe/cells';
import type { Evidence } from '../main/services/probe/probe';
import { type SourceFile, scanSources } from '../main/services/probe/sourceScan';

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
	const { result, notOpened, views } = await onDesignMode({ root, descriptor, projectId, loads: browser.loads, progress }, async (origin, opens) => {
		const checked = await checkPages({ origin, pages, target, check: browser.scan, opens, progress });
		const opened = pages.filter((p) => !checked.notOpened.some((n) => n.path === p.path));
		return {
			...checked,
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
		...(named
			? {}
			: {
					note: `${descriptor.product}'s manifest names no pages to check (its "## ${PAGES_SECTION}" section), so only the app as it opens, at /, was checked.`,
				}),
	};
};

/** How many findings of a cell are printed: all of them are in the evidence. */
const MOST_PRINTED = 5;

/** A cell's result as a line the agent reads: what it is, by WCAG, and where. */
const cellLine = (r: CellResult, where: string): string[] => {
	const c = wcagCriterion(r.sc);
	const head = `- **${r.cell}** (WCAG ${c.sc} ${c.name})${where}`;
	if (r.status !== 'found') return [`${head}: ${r.why ?? ''}`];
	return [
		`${head}:`,
		...r.findings.slice(0, MOST_PRINTED).map((f) => `  - \`${f.target}\`: ${f.detail}`),
		...(r.findings.length > MOST_PRINTED ? [`  - and ${r.findings.length - MOST_PRINTED} more, in the evidence`] : []),
	];
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
		...(at.length ? ['', 'Found by the probe, at the target:', ...at.flatMap(({ r, where }) => cellLine(r, where))] : []),
		...(above.length
			? ['', 'Found by the probe, above the target (readiness, not counted as it):', ...above.flatMap(({ r, where }) => cellLine(r, where))]
			: []),
		...(notRun.length ? ['', 'Not run:', ...notRun.flatMap(({ r, where }) => cellLine(r, where))] : []),
		'',
		'Every other cell found none of what it measures, or does not apply here (each is in the evidence): neither is a pass.',
	];
};

/** A view's folder name in the evidence: its name, as letters, digits and dashes. */
const folderOf = (state: string): string =>
	state
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '') || 'view';

/** The evidence, written fresh: a folder per view, and the source cells beside them. Nothing of an earlier run is left. */
const writeEvidence = (dir: string, { views, source }: Measured): void => {
	rmSync(dir, { recursive: true, force: true });
	for (const view of views) for (const e of view.evidence) writeAtomic(join(dir, folderOf(view.state), e.name), e.data);
	writeAtomic(join(dir, 'source.json'), JSON.stringify(source, null, 1));
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
	const path = accessibilityPath(projectId, name);
	const evidence = accessibilityEvidenceDir(projectId, name);
	writeEvidence(join(designRoot, evidence), measured);
	const probe = { depth, views: views.map(({ state, ms, results }) => ({ state, ms, results, evidence: `${evidence}/${folderOf(state)}` })), source };
	writeAtomic(join(designRoot, path), `${JSON.stringify({ of: what, ...(pages ? { pages } : {}), notOpened, result, probe }, null, '\t')}\n`);
	deps.out(
		[
			`Measured ${what}: ${summaryOf(countsOf(result))}.`,
			checkedWith(result),
			...[notAutomatedLine(result), note].filter((l): l is string => Boolean(l)),
			...unopened,
			...findingsLines(result),
			...probeLines(measured, depth),
			'',
			`Written to ${path} in ${designRoot}, with the evidence in ${evidence}/.`,
		].join('\n'),
	);
	return 0;
};
