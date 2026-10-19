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
 * The site is meant to be private; when it is not, publishing says so rather than stopping, and it checks whether the
 * page opens with no credentials.
 */

/** It runs only when asked. */
export const PUBLISH_WORKFLOW = 'publish-prototypes.yml';

export interface SiteVisibility {
	repoPrivate: boolean;
	/** The branch the site is deployed from. */
	defaultBranch: string;
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
	return { repoPrivate: repo.private === true, defaultBranch: String(repo.default_branch ?? ''), site };
};

/** Null only when GitHub says it is private. */
export const whyPublic = (v: SiteVisibility): string | null =>
	!v.repoPrivate ? 'the repository is public' : v.site?.public ? 'its Pages site is public' : null;

interface Run {
	id: number;
	status: string;
	conclusion: string | null;
	html_url: string;
}

/** The newest finished one: one still running may yet fail. */
const deployedSha = async (github: GitHubApi, base: string): Promise<string | null> => {
	for (const d of ((await github.api(`${base}/deployments?environment=github-pages&per_page=5`)) as { id: number; sha: string }[] | null) ?? []) {
		const [latest] = ((await github.api(`${base}/deployments/${d.id}/statuses?per_page=1`)) as { state: string }[] | null) ?? [];
		if (latest?.state === 'success') return d.sha;
	}
	return null;
};

/** The link carries the deploy it is from, so a page opened after a new one never shows an old copy. */
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
 * What the site is built from besides the pages, so a change to any of it needs a deploy too. Whole folders, not only what
 * is imported: a needless deploy costs a minute. `siteSources.spec.ts` follows the viewer's imports, so a file it reaches
 * outside these fails there rather than leaving the site stale.
 */
const SITE_SOURCES = [
	/^workspace\/src\/(site|viewer|ui|shared|codeHost|page)\//,
	/^workspace\/src\/cli\/dsnr\.ts$/,
	/^workspace\/(bin\/|viewer\.vite\.config\.ts$|viewerBuild\.mjs$|pageCode\.vite\.ts$|package-lock\.json$)/,
	/^\.github\/workflows\/publish-prototypes\.yml$/,
];

export const isSiteSource = (file: string): boolean => SITE_SOURCES.some((s) => s.test(file));

export type SiteBehind = { kind: 'page'; projectId: string; name: string } | { kind: 'code' };

/**
 * One changed page is enough to name, as a deploy builds the whole site. Null when it is current, when a deploy is
 * already on its way (it will take what is there), or when there is nothing to compare with yet.
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

/** With no clone the records were written to GitHub directly, and nothing waits. */
export const recordsFrom = async (clone: string | null): Promise<Pick<PublishInput, 'recordsBranch' | 'pushRecords'>> => {
	if (clone === null) return { pushRecords: async () => ({ published: [], problems: [] }) };
	// '' when it is on no branch: refused by publish, after the gate has had its say.
	const recordsBranch = (await git(clone, ['symbolic-ref', '--short', 'HEAD']).catch(() => '')).trim();
	return { recordsBranch, pushRecords: () => syncRecords(clone) };
};

interface DeployInput {
	github: GitHubApi;
	ref: RepoRef;
	/** The site is deployed from the default branch, so records pushed to any other would never reach it: that is refused. */
	recordsBranch?: string;
	pushRecords: () => Promise<SyncResult>;
	sleep?: (ms: number) => Promise<void>;
	log?: (line: string) => void;
	timeoutMs?: number;
}

export interface PublishInput extends DeployInput {
	projectId: string;
	name: string;
	fetchAnonymously?: (url: string) => Promise<{ status: number }>;
}

/** Its record and its comments are kept. */
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
	/** The page opened with no credentials (not what GitHub says of the site). */
	public: boolean;
	/** False also when that could not be told. */
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

/** Where the site is, is checked before anything leaves this machine. `site` ends in a slash. */
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

	await change();
	const pushed = await pushRecords();
	if (pushed.problems.length > 0) {
		const held = done === 'published' ? nothing : 'Its files are removed here, and go with the next push of the records, but the site still has it';
		throw new Error(`${held}: ${pushed.problems.map((p) => p.why).join(' ')}`);
	}

	// Runs that were there before are not this one.
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
