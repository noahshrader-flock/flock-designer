/**
 * `dsnr accessibility` (A2 of the accessibility plan; decision 2): measures a project's work in a real browser, the same
 * way for any product, and writes what it found into the project's folder in the design repository as evidence. DSNR
 * calls the product, and the product does not call DSNR: a prototype's page is served here, and a product's own app is
 * started as its `.dsnr/workspace.json` says (`onDesignMode`), at the pages its manifest names. What it could not open,
 * it says; with nothing opened, nothing is written.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { checkedWith, countsOf, notAutomatedLine, summaryOf } from '../shared/accessibility';
import { accessibilityPath, projectPath } from '../shared/designPaths';
import { statesOf } from '../shared/prototypeStates';
import { accessibilityOf } from '../main/services/accessibilityCheck';
import { MANIFEST_FILE, PAGES_SECTION, type AppPage, appPages, declaredTarget, findingsLines } from '../main/services/accessibilityBrief';
import { FIRST_PAGE, type PagesChecked, checkPages, onDesignMode } from '../main/services/accessibilityRun';
import { chromeHeadless } from '../main/services/chromeHeadless';
import { readDescriptor } from '../main/services/descriptor';
import { assertUsableProjectId } from '../main/services/iterations';
import { writeAtomic } from '../main/services/jsonFile';
import { assertPrototypeName } from '../main/services/prototype';
import { PrototypeServer } from '../main/services/prototypeServer';
import type { prototypeWork } from '../main/services/prototypeWork';

export interface MeasureDeps {
	projectId: string;
	/** A prototype's name, to measure its page; null for the product's own app. */
	name: string | null;
	/** The product checkout, and the design repository beside it. */
	root: string;
	designRoot: string;
	work: ReturnType<typeof prototypeWork>;
	out: (text: string) => void;
	/** Where progress is said, so a long run is never silent. */
	err: (text: string) => void;
}

/** What was measured, in words, and what it found; `pages` and `note` for an app, which pages and how they were chosen. */
type Measured = PagesChecked & { what: string; pages?: AppPage[]; note?: string };

/** A prototype's page, served here with its shared files, in each of its states: the check the app makes, and keeps, the same. */
const prototypePage = async (
	{ projectId, name, work }: MeasureDeps & { name: string },
	check: ReturnType<typeof chromeHeadless>,
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
		const result = await accessibilityOf({ file: work.checkFile(projectId, name), html, url, states: statesOf(html), target, check: check.scan });
		return { what: `${projectId} ${name}'s page`, result, notOpened: [] };
	} finally {
		server.close();
	}
};

/** The product's own app in design mode, at the pages its manifest names, else as it opens; at the manifest's target. */
const productApp = async (
	{ projectId, root }: MeasureDeps,
	check: ReturnType<typeof chromeHeadless>,
	progress: (line: string) => void,
): Promise<Measured> => {
	const descriptor = readDescriptor(root);
	const file = join(root, descriptor.contextDir, MANIFEST_FILE);
	const manifest = existsSync(file) ? readFileSync(file, 'utf8') : null;
	const named = appPages(manifest);
	const pages = named ?? [FIRST_PAGE];
	const target = declaredTarget(manifest, descriptor.product);
	const checked = await onDesignMode({ root, descriptor, projectId, loads: check.loads, progress }, (origin, opens) =>
		checkPages({ origin, pages, target, check: check.scan, opens, progress }),
	);
	return {
		what: `${descriptor.product}'s app in design mode`,
		pages,
		...checked,
		...(named
			? {}
			: {
					note: `${descriptor.product}'s manifest names no pages to check (its "## ${PAGES_SECTION}" section), so only the app as it opens, at /, was checked.`,
				}),
	};
};

export const measureAccessibility = async (deps: MeasureDeps): Promise<number> => {
	const { projectId, name, designRoot } = deps;
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
	const { what, result, notOpened, pages, note } = measured;
	const unopened = notOpened.map((p) => `${p.name} (${p.path}) did not open, so it was not measured: ${p.why}`);
	if (result === null) {
		deps.out([`Nothing of ${what} opened, so nothing was measured or written.`, ...unopened].join('\n'));
		return 1;
	}
	const path = accessibilityPath(projectId, name);
	writeAtomic(join(designRoot, path), `${JSON.stringify({ of: what, ...(pages ? { pages } : {}), notOpened, result }, null, '\t')}\n`);
	deps.out(
		[
			`Measured ${what}: ${summaryOf(countsOf(result))}.`,
			checkedWith(result),
			...[notAutomatedLine(result), note].filter((l): l is string => Boolean(l)),
			...unopened,
			...findingsLines(result),
			'',
			`Written to ${path} in ${designRoot}, as the evidence of this measure.`,
		].join('\n'),
	);
	return 0;
};
