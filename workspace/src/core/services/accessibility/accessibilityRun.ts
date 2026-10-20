// Nothing here names a product or a framework: what it is told is all it knows, and what it could not open, it says.
import type { AxeRun } from '../../../shared/accessibility';
import type { AccessibilityResult } from '../../../shared/contract';
import { errorText } from '../../../shared/result';
import type { DeclaredTarget } from '../../../shared/wcag';
import { DESIGN_MODE_COMMAND } from '../../../shared/work';
import { resultOf } from './accessibilityCheck';
import type { CheckPage } from '../../ports';
import type { AppPage } from './accessibilityBrief';
import { NO_BROWSER } from '../browser/chromeHeadless';
import { DESCRIPTOR_PATH, type WorkspaceDescriptor } from '../projects/descriptor';
import { installLine } from '../codebase/install';
import { RuntimeManager, type RuntimeDeps, defaultDeps } from '../codebase/runtime';
import { buildError, outputLines, packagesHint } from '../codebase/serverOutput';

/** Checked when a manifest names no pages. */
export const FIRST_PAGE: AppPage = { name: 'default', path: '/' };

export interface PageNotOpened extends AppPage {
	why: string;
}

interface PagesChecked {
	/** Null when no page opened. */
	result: AccessibilityResult | null;
	notOpened: PageNotOpened[];
}

/** Null when the page really opened, else why not. */
export type Opens = (url: string) => Promise<string | null>;

/** A page that will not open or check is said, with why, and the rest go on; with no browser, the whole throws. */
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

/** Lines of output said when it would not start: the last, where a dev server says why. */
const LOG_TAIL = 15;

/** The design-mode command is stopped after `work`, whatever happens; a port already taken refuses, as it may be another checkout's. */
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
	const install = installLine(descriptor);
	const withHint = (why: string) => `${why}${packagesHint(why, install)}`;
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
		// Only a page that did not open is given the server's build error: a page that drew well has outlived one (a first
		// compile that failed and was fixed).
		const opens: Opens = async (url) => {
			const refused = await loads(url);
			return refused === null ? null : withHint(buildError(said.log) ?? refused);
		};
		return await work(status.url, opens);
	} finally {
		await runtime.stop(DESIGN_MODE_COMMAND);
	}
};
