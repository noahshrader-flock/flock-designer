/**
 * Measuring a product's own app, the same way whatever it is built with (A2 of the accessibility plan; decision 2): DSNR
 * starts it as its `.dsnr/workspace.json` says (its design-mode command, on the port that command serves), opens each page
 * its manifest names in a real browser, and runs the one check every page gets (`CheckPage`) at its declared target.
 * Nothing here names a product or a framework: what it is told is all it knows, and what it could not open, it says.
 */
import type { AxeRun } from '../../shared/accessibility';
import type { AccessibilityResult } from '../../shared/contract';
import { errorText } from '../../shared/result';
import type { DeclaredTarget } from '../../shared/wcag';
import { DESIGN_MODE_COMMAND } from '../../shared/work';
import { type CheckPage, resultOf } from './accessibilityCheck';
import type { AppPage } from './accessibilityBrief';
import { NO_BROWSER } from './chromeHeadless';
import { DESCRIPTOR_PATH, type WorkspaceDescriptor } from './descriptor';
import { INSTALL_COMMAND } from './install';
import { RuntimeManager, type RuntimeDeps, defaultDeps } from './runtime';
import { buildError, outputLines, packagesHint } from './serverOutput';

/** What is checked when a manifest names no pages: the app as it opens, at its root. */
export const FIRST_PAGE: AppPage = { name: 'default', path: '/' };

/** A page that would not open, and why, in the browser's words or the check's. */
export interface PageNotOpened extends AppPage {
	why: string;
}

/** What a run of an app's pages found: one result across the pages that opened (null when none did), and those that did not. */
export interface PagesChecked {
	result: AccessibilityResult | null;
	notOpened: PageNotOpened[];
}

/** Whether a page of the app really opened: null when it did, else why not (its build, its own error, or nothing drawn). */
export type Opens = (url: string) => Promise<string | null>;

/**
 * Checks each page of the app at `origin`, one at a time: first that it really opens (`opens`), then as it opens, each a
 * state of one result, by its name. A page that will not open or check is said, with why, and the rest go on; with no
 * browser, nothing can be, and that is said.
 */
export const checkPages = async ({
	origin,
	pages,
	target,
	check,
	opens,
	progress,
	now = () => new Date(),
}: {
	origin: string;
	pages: AppPage[];
	target: DeclaredTarget;
	check: CheckPage;
	opens: Opens;
	progress: (line: string) => void;
	now?: () => Date;
}): Promise<PagesChecked> => {
	const runs: AxeRun[] = [];
	const notOpened: PageNotOpened[] = [];
	for (const page of pages) {
		progress(`Checking ${page.name} (${page.path})`);
		const url = new URL(page.path, origin).href;
		try {
			const why = await opens(url);
			if (why !== null) {
				notOpened.push({ ...page, why });
				continue;
			}
			for (const run of await check(url, [], target.tags)) runs.push({ ...run, state: page.name });
		} catch (err) {
			if (err instanceof Error && err.message === NO_BROWSER) throw err;
			notOpened.push({ ...page, why: errorText(err, { firstLine: true }) });
		}
	}
	return { result: runs.length > 0 ? resultOf(runs, target, now()) : null, notOpened };
};

/** How much of a command's output is said when it would not start: its last lines, where a dev server says why. */
const LOG_TAIL = 15;

/**
 * Runs `work` on the product's app on mock data, at its address: its design-mode command, started in `root` as its
 * workspace file says and stopped after, whatever happens. `work` is given how to tell that a page really opened, as Run
 * locally tells it: no build error in the server's output, before or after the page is loaded (`loads`, which says the
 * page's own error, or that it drew nothing), with a word when the product's packages look older than its code. A product
 * that declares no such command, whose port something else already answers on (it may not be this checkout's app), or
 * whose app will not start, is said, with its last output, and nothing is run.
 */
export const onDesignMode = async <T>(
	{
		root,
		descriptor,
		projectId,
		loads,
		progress,
		deps = defaultDeps,
	}: {
		root: string;
		descriptor: WorkspaceDescriptor;
		projectId: string;
		loads: Opens;
		progress: (line: string) => void;
		deps?: RuntimeDeps;
	},
	work: (origin: string, opens: Opens) => Promise<T>,
): Promise<T> => {
	const command = descriptor.commands.find((c) => c.id === DESIGN_MODE_COMMAND);
	const port = command?.servesPreviewOn;
	if (command === undefined || port === undefined) {
		throw new Error(
			`${descriptor.product}'s ${DESCRIPTOR_PATH} declares no "${DESIGN_MODE_COMMAND}" command that serves its app on a port, so DSNR cannot open it, and nothing was measured.`,
		);
	}
	if (await deps.probe(port)) {
		throw new Error(
			`Something else is already answering on port ${port}, where ${descriptor.product}'s app is served, so it may not be this checkout's, and nothing was measured. Stop it, then try again.`,
		);
	}
	const install = descriptor.commands.find((c) => c.id === INSTALL_COMMAND)?.argv.join(' ') ?? null;
	const withHint = (why: string) => `${why}${packagesHint(why, install)}`;
	/** Its output, and why it failed when it says, for when it does not start. */
	const said: { log: string[]; failed: string | null } = { log: [], failed: null };
	const runtime = new RuntimeManager(
		{
			onLog: (line) => said.log.push(...outputLines(line.text)),
			onStatus: (s) => {
				if (s.state === 'failed') said.failed = s.detail;
			},
		},
		deps,
	);
	progress(`Starting ${descriptor.product}'s app (${command.argv.join(' ')}), and waiting for it on port ${port}`);
	try {
		const status = await runtime.start(root, descriptor, DESIGN_MODE_COMMAND, projectId);
		if (status.state !== 'running') {
			const tail = said.log.slice(-LOG_TAIL).join('\n');
			const why = withHint(buildError(said.log) ?? said.failed ?? 'it stopped');
			throw new Error(`${descriptor.product}'s app did not start (${why}), so nothing was measured.${tail ? ` Its last output:\n${tail}` : ''}`);
		}
		// The output is read before and after the page is: a server can answer before it prints its build error.
		const opens: Opens = async (url) => {
			const why = buildError(said.log) ?? (await loads(url)) ?? buildError(said.log);
			return why === null ? null : withHint(why);
		};
		return await work(status.url, opens);
	} finally {
		await runtime.stop(DESIGN_MODE_COMMAND);
	}
};
