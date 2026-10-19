import type { PageStatus } from '../../../shared/contract';
import { prototypePagePath, sitePath } from '../../../shared/designPaths';
import type { GitHubApi } from '../../../codeHost/github';

import { hostErrorKind } from '../../../codeHost/hostError';
import { RepoFiles, repoApiPath } from '../../../codeHost/repoFiles';
import { type SyncResult, syncRecords } from './designSync';
import { git } from '../platform/git';
import { asArray, asRecord } from '../../../shared/json';
import { type RepoRef, formatRepo } from '../../../shared/repoRef';
import { HOST } from '../../../shared/vocabulary';

/**
 * Publishing a prototype to its page on the design repository's GitHub Pages site: the one way it is done, from the
 * command an agent runs and anything else that publishes. Nothing of the app is in it.
 *
 * **It says who can open the page.** The site is meant to be private, where viewing needs a GitHub sign-in. While the
 * repository is public, it is not, and publishing says so in its note rather than stopping. Afterwards it asks for the
 * page with no credentials, and says plainly if it opened.
 */

/** The workflow that builds the site from the repository and deploys it. It runs only when asked. */
export const PUBLISH_WORKFLOW = 'publish-prototypes.yml';

export interface SiteVisibility {
	repoPrivate: boolean;
	/** The branch the site is deployed from. */
	defaultBranch: string;
	/** The Pages site, or null when the repository has none. */
	site: { url: string; public: boolean } | null;
}

export const readVisibility = async (github: GitHubApi, ref: RepoRef): Promise<SiteVisibility> => {
	const base = repoApiPath(ref);
	const repo = asRecord(await github.api(base));
	let site: SiteVisibility['site'] = null;
	try {
		const pages = asRecord(await github.api(`${base}/pages`));
		// Unknown counts as public: a site is private only when GitHub says so.
		site = { url: String(pages.html_url ?? ''), public: pages.public !== false };
	} catch (err) {
		if (hostErrorKind(err) !== 'notFound') throw err;
	}
	// Unknown counts as public here too.
	return { repoPrivate: repo.private === true, defaultBranch: String(repo.default_branch ?? ''), site };
};

/** Why anyone could open the site, or null when GitHub says it is private. Unknown counts as public. */
export const whyPublic = (v: SiteVisibility): string | null =>
	!v.repoPrivate ? 'the repository is public' : v.site?.public ? 'its Pages site is public' : null;

interface Run {
	id: number;
	status: string;
	conclusion: string | null;
	html_url: string;
}

/**
 * Whether a version is on its page: the site's last finished deploy includes the last change to the page. Asked of
 * GitHub, so it is the same for someone with no clone. The link carries the deploy it is from, so a page opened after a
 * new one never shows an old copy. `none` when there is no site, or no page to be on it.
 */
/** The commit the newest finished deploy of the site was built from, or null when none has. One still running may yet fail. */
const deployedSha = async (github: GitHubApi, base: string): Promise<string | null> => {
	for (const d of ((await github.api(`${base}/deployments?environment=github-pages&per_page=5`)) as { id: number; sha: string }[] | null) ?? []) {
		const [latest] = ((await github.api(`${base}/deployments/${d.id}/statuses?per_page=1`)) as { state: string }[] | null) ?? [];
		if (latest?.state === 'success') return d.sha;
	}
	return null;
};

export const pageStatus = async (github: GitHubApi, ref: RepoRef, projectId: string, name: string): Promise<PageStatus> => {
	const path = sitePath(projectId, name);
	if (path === null) return { state: 'none' };
	const vis = await readVisibility(github, ref);
	if (!vis.site?.url) return { state: 'none' };
	const base = repoApiPath(ref);
	const deployed = await deployedSha(github, base);
	const [changed] = (await new RepoFiles(github, ref).commits(prototypePagePath(projectId, name), { at: vis.defaultBranch, limit: 1 })) as {
		sha: string;
	}[];
	if (deployed === null || !changed) return { state: 'unpublished' };
	if (changed.sha !== deployed) {
		const { status } = asRecord(await github.api(`${base}/compare/${changed.sha}...${deployed}`));
		// The deploy is the change itself or after it.
		if (status !== 'ahead' && status !== 'identical') return { state: 'unpublished' };
	}
	return { state: 'published', url: `${vis.site.url.replace(/\/?$/, '/')}${path}?v=${deployed.slice(0, 7)}` };
};

/**
 * What the site is built from, besides the pages: the viewer on every page (and DSNR's kit it is drawn with, `src/ui`), the
 * generator, the workflow that runs it, and the packages it installs. The page code (`src/page`) is in the viewer too,
 * bundled into the scripts it runs in a page (`pageCode.vite.ts`). A change to any of these changes how the pages
 * look and work, so the site needs a deploy as much as it does for a new page. The viewer's folder is all of it, not
 * only what its entry imports: one deploy too many after an edit to a screen the site does not carry costs a minute
 * of the workflow. What the viewer reaches GitHub with is `src/codeHost`, kept out of the core for this. A test
 * follows the viewer's imports (`siteSources.spec.ts`), so a file it reaches outside these folders fails there, rather
 * than leaving the site stale without a word.
 */
const SITE_SOURCES = [
	/^workspace\/src\/(site|viewer|ui|shared|codeHost|page)\//,
	/^workspace\/src\/cli\/dsnr\.ts$/,
	/^workspace\/(bin\/|viewer\.vite\.config\.ts$|viewerBuild\.mjs$|pageCode\.vite\.ts$|package-lock\.json$)/,
	/^\.github\/workflows\/publish-prototypes\.yml$/,
];

/** Whether a change to `file` (a path in the design repository) changes how the site is built. */
export const isSiteSource = (file: string): boolean => SITE_SOURCES.some((s) => s.test(file));

/** What GitHub has that the site does not: a prototype page, or a change to how the site is built (`code`). */
export type SiteBehind = { kind: 'page'; projectId: string; name: string } | { kind: 'code' };

/**
 * Whether the site is behind GitHub, found without anyone asking: what changed since the last deploy is read in one
 * call. A prototype page in it is named (one deploy builds the whole site, so one is enough); otherwise a change to what
 * the site is built from is `code`. Null when the site has what GitHub has, when a deploy is already on its way (it will
 * take what is there), or when there is nothing to compare with yet.
 */
export const siteBehind = async (github: GitHubApi, ref: RepoRef): Promise<SiteBehind | null> => {
	const vis = await readVisibility(github, ref);
	if (!vis.site?.url) return null;
	const base = repoApiPath(ref);
	const { workflow_runs: runs } = asRecord(await github.api(`${base}/actions/workflows/${PUBLISH_WORKFLOW}/runs?per_page=5`));
	if (asArray(runs).some((r) => asRecord(r).status !== 'completed')) return null;
	const deployed = await deployedSha(github, base);
	if (deployed === null) return null;
	let code = false;
	for (const f of asArray(asRecord(await github.api(`${base}/compare/${deployed}...${vis.defaultBranch}`)).files)) {
		const file = String(asRecord(f).filename);
		const m = /^projects\/([^/]+)\/prototypes\/([^/]+)\.html$/.exec(file);
		if (m?.[1] && m[2]) return { kind: 'page', projectId: m[1], name: m[2] };
		code ||= isSiteSource(file);
	}
	return code ? { kind: 'code' } : null;
};

/** No credentials, and GitHub's sign-in redirect not followed: a 200 means the page opens for anyone. */
export const fetchAnonymously = async (url: string): Promise<{ status: number }> => ({
	status: (await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(15_000) })).status,
});

/**
 * How the records reach GitHub from where publishing runs: from a clone, by its records sync (only `projects/`), on the
 * branch it is on; with no clone they were written to GitHub directly, and nothing waits.
 */
export const recordsFrom = async (clone: string | null): Promise<Pick<PublishInput, 'recordsBranch' | 'pushRecords'>> => {
	if (clone === null) return { pushRecords: async () => ({ published: [], problems: [] }) };
	// '' when it is on no branch: refused by publish, after the gate has had its say.
	const recordsBranch = (await git(clone, ['symbolic-ref', '--short', 'HEAD']).catch(() => '')).trim();
	return { recordsBranch, pushRecords: () => syncRecords(clone) };
};

interface DeployInput {
	github: GitHubApi;
	ref: RepoRef;
	/**
	 * The branch the records are pushed to, when they are pushed from a clone. The site is deployed from the repository's
	 * default branch, so records anywhere else would never reach it: that is refused.
	 */
	recordsBranch?: string;
	/** Commits and pushes the records (only `projects/`), as the app's publisher does. */
	pushRecords: () => Promise<SyncResult>;
	sleep?: (ms: number) => Promise<void>;
	log?: (line: string) => void;
	/** How long the deploy may take, all told. */
	timeoutMs?: number;
}

export interface PublishInput extends DeployInput {
	projectId: string;
	name: string;
	/** Asks for a page with no credentials at all. Given for tests; otherwise `fetchAnonymously`. */
	fetchAnonymously?: (url: string) => Promise<{ status: number }>;
}

/**
 * Takes a version off the site: `removePage` removes its saved files, which the records push carries to GitHub, and
 * the site is deployed again without it. Its record and its comments are kept. If it must be gone at once and for
 * everyone, a GitHub admin can switch Pages off for the repository; this is the ordinary way.
 */
export const unpublish = async (input: PublishInput & { removePage: () => Promise<void> }): Promise<{ url: string; gone: boolean }> => {
	const { projectId, name, fetchAnonymously: anonymous = fetchAnonymously, log = () => undefined } = input;
	const path = sitePath(projectId, name);
	if (path === null) throw new Error(`"${name}" is not a prototype, so it has no page to take down.`);
	const { site } = await deploy(input, 'unpublished', input.removePage);
	const url = `${site}${path}`;
	// A public page is checked to be gone. A private one cannot be asked without signing in, and the deploy is the word.
	const gone = (await anonymous(url)).status !== 200;
	log(
		gone
			? `Taken off the site: ${url} no longer has this version. Its record and comments are kept.`
			: `The site was deployed without it, but ${url} still opens. ${HOST} can take a few minutes to stop serving it. If it still opens after that, ask a ${HOST} admin to switch Pages off for the repository.`,
	);
	return { url, gone };
};

export interface Published {
	url: string;
	/** The page opened with no credentials. */
	public: boolean;
	/** This page was not on the site before: its first time. False when it was, and when that could not be told. */
	first: boolean;
}

/**
 * Whether the last deploy of the site already had this page, asked of that deploy's commit. Only a clear "no" counts:
 * when GitHub cannot say, it is not the first time, so nothing is made of a guess (a browser tab opened by mistake).
 */
const isFirstTime = async (github: GitHubApi, ref: RepoRef, projectId: string, name: string): Promise<boolean> => {
	const base = repoApiPath(ref);
	try {
		const deployed = await deployedSha(github, base);
		if (deployed === null) return true;
		return (await new RepoFiles(github, ref).commits(prototypePagePath(projectId, name), { at: deployed, limit: 1 })).length === 0;
	} catch {
		return false;
	}
};

/**
 * What a publish and an unpublish share: where the site is, checked before anything leaves this machine; then `change`
 * (an unpublish's removal), the records pushed, and the site's deploy waited on until it is done. `done` is what
 * happened, for the messages: "published", "unpublished". Returns where the site is, ending in a slash.
 */
const deploy = async (
	{
		github,
		ref,
		recordsBranch,
		pushRecords,
		sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
		log = () => undefined,
		timeoutMs = 10 * 60_000,
	}: DeployInput,
	done: 'published' | 'unpublished',
	change: () => Promise<void> = async () => undefined,
): Promise<{ visibility: SiteVisibility; site: string }> => {
	const base = repoApiPath(ref);
	const nothing = `Nothing was ${done}`;
	const noLink = done === 'published' ? ' No link was made.' : '';

	// 1. Where it is going, before anything leaves this machine.
	const visibility = await readVisibility(github, ref);
	const site = visibility.site?.url;
	if (!site) throw new Error(`${nothing}: the design repository has no ${HOST} Pages site.${noLink}`);
	const branch = visibility.defaultBranch;
	if (recordsBranch === '') throw new Error(`${nothing}: the design repository here is not on a branch.`);
	if (recordsBranch !== undefined && recordsBranch !== branch) {
		throw new Error(
			`${nothing}: the site is built from ${branch}, and the design repository here is on ${recordsBranch}. Switch it to ${branch}, then try again.`,
		);
	}

	// 2. The records, and only the records.
	await change();
	const pushed = await pushRecords();
	if (pushed.problems.length > 0) {
		const held = done === 'published' ? nothing : 'Its files are removed here, and go with the next push of the records, but the site still has it';
		throw new Error(`${held}: ${pushed.problems.map((p) => p.why).join(' ')}`);
	}

	// 3. The deploy: the site is built from what GitHub now has. Runs that were there before are not this one.
	const runs = async (): Promise<Run[]> =>
		(asRecord(
			await github.api(`${base}/actions/workflows/${PUBLISH_WORKFLOW}/runs?event=workflow_dispatch&branch=${encodeURIComponent(branch)}&per_page=20`),
		).workflow_runs as Run[] | undefined) ?? [];
	const before = new Set((await runs()).map((r) => r.id));
	try {
		await github.api(`${base}/actions/workflows/${PUBLISH_WORKFLOW}/dispatches`, {
			method: 'POST',
			body: { ref: branch },
		});
	} catch (err) {
		if (hostErrorKind(err) === 'forbidden')
			throw new Error(
				`DSNR's ${HOST} App is not allowed to start the deploy. Its permissions need Actions: read and write (and Pages and Deployments: read), approved on the installation. Publishing from the command line still works.`,
			);
		if (hostErrorKind(err) === 'notFound')
			throw new Error(
				`The workflow that publishes the site (.github/workflows/${PUBLISH_WORKFLOW}) is not on ${HOST} yet, on the repository's default branch. Push it, then try again.`,
			);
		throw err;
	}
	log('The site is being built and deployed. This takes a minute or two.');
	const started = Date.now();
	let mine: Run | undefined;
	for (;;) {
		await sleep(5000);
		mine = (await runs()).find((r) => !before.has(r.id));
		if (mine?.status === 'completed') break;
		if (Date.now() - started > timeoutMs)
			throw new Error(
				`The deploy has not finished after ${Math.round(timeoutMs / 60_000)} minutes. ${mine ? `See ${mine.html_url}.` : 'It never started.'}`,
			);
	}
	if (mine.conclusion !== 'success')
		throw new Error(`The deploy did not finish (${mine.conclusion}). What went wrong is at ${mine.html_url}.${noLink}`);
	return { visibility, site: site.replace(/\/?$/, '/') };
};

/** Deploys the site as GitHub has it, with no page to name or link to: the records pushed, the deploy waited on. */
export const redeploySite = async (input: DeployInput): Promise<void> => {
	await deploy(input, 'published');
};

export const publish = async (input: PublishInput): Promise<Published> => {
	const { ref, projectId, name, fetchAnonymously: anonymous = fetchAnonymously, log = () => undefined } = input;
	const path = sitePath(projectId, name);
	if (path === null) throw new Error(`"${name}" is not a prototype, so it has no page to publish.`);
	// Asked before the deploy: after it, every page that was published is on the site.
	const first = await isFirstTime(input.github, ref, projectId, name);
	const { visibility, site } = await deploy(input, 'published');

	// 4. The link, and whether it opens for someone who is not signed in.
	const url = `${site}${path}`;
	const opened = (await anonymous(url)).status === 200;
	const why = whyPublic(visibility);
	if (why !== null) {
		log(`Published. Note that ${why}, so anyone with the link can open this page, signed in or not. ${url}`);
	} else if (opened) {
		log(
			`This page opens for anyone, signed in or not, although ${HOST} said the site was private. Do not share it; check the repository's Pages settings. ${url}`,
		);
	} else {
		log(`Published. It opens for people signed in to ${HOST} with access to ${formatRepo(ref)}: ${url}`);
	}
	return { url, public: opened, first };
};
