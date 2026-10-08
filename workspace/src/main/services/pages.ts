import type { PageStatus } from '../../shared/contract';
import { prototypePagePath, sitePath } from '../../shared/projects';
import type { DesignRepoRef, GitHubApi } from './designRepo';
import type { SyncResult } from './designSync';
import { asRecord } from '../../shared/json';

/**
 * Publishing a prototype to its page on the design repository's GitHub Pages site: the one way it is done, from the
 * command an agent runs and anything else that publishes. Nothing of the app is in it.
 *
 * **It never hands out a link to a page anyone can open.** Before anything is pushed it asks GitHub whether the
 * repository and its site are private, and stops if either is not. The one way past is a public test, asked for in so
 * many words each time (never a default, never remembered), and then every page says PUBLIC TEST on it. Afterwards it
 * asks for the page with no credentials, and says plainly if it opened.
 */

/** What has to be typed to publish to a site anyone can open. Long enough that nobody types it by accident. */
export const PUBLIC_TEST_PHRASE = 'publish where anyone can see it';

/** The workflow that builds the site from the repository and deploys it. It runs only when asked. */
export const PUBLISH_WORKFLOW = 'publish-prototypes.yml';

export interface SiteVisibility {
	repoPrivate: boolean;
	/** The branch the site is deployed from. */
	defaultBranch: string;
	/** The Pages site, or null when the repository has none. */
	site: { url: string; public: boolean } | null;
}

const notFound = (err: unknown): boolean => asRecord(err).status === 404 || /\b404\b|Not Found/.test(err instanceof Error ? err.message : String(err));

export const readVisibility = async (github: GitHubApi, ref: DesignRepoRef): Promise<SiteVisibility> => {
	const base = `/repos/${ref.owner}/${ref.repo}`;
	const repo = asRecord(await github.api(base));
	let site: SiteVisibility['site'] = null;
	try {
		const pages = asRecord(await github.api(`${base}/pages`));
		// Unknown counts as public: a site is private only when GitHub says so.
		site = { url: String(pages.html_url ?? ''), public: pages.public !== false };
	} catch (err) {
		if (!notFound(err)) throw err;
	}
	// Unknown counts as public here too.
	return { repoPrivate: repo.private === true, defaultBranch: String(repo.default_branch ?? ''), site };
};

export type Gate = { ok: true; url: string; publicTest: boolean } | { ok: false; why: string };

/** Whether publishing may go ahead. `publicTest` is the person's own word for this run, already checked. */
export const passGate = (v: SiteVisibility, publicTest: boolean): Gate => {
	if (!v.site?.url) return { ok: false, why: 'The design repository has no GitHub Pages site, so there is nowhere to publish. No link was made.' };
	const what = !v.repoPrivate ? 'the repository is public' : v.site.public ? 'its Pages site is public' : null;
	if (what === null) return { ok: true, url: v.site.url, publicTest: false };
	if (!publicTest) {
		return {
			ok: false,
			why: `Nothing was published: ${what}, so anyone could open the page. No link was made. Prototypes are published only where viewing needs a GitHub sign-in.`,
		};
	}
	return { ok: true, url: v.site.url, publicTest: true };
};

interface Run {
	id: number;
	status: string;
	conclusion: string | null;
	html_url: string;
}

/**
 * Whether an iteration is on its page: the site's last finished deploy includes the last change to the page. Asked of
 * GitHub, so it is the same for someone with no clone. The link carries the deploy it is from, so a page opened after a
 * new one never shows an old copy. `none` when there is no site, or no page to be on it.
 */
export const pageStatus = async (github: GitHubApi, ref: DesignRepoRef, projectId: string, name: string): Promise<PageStatus> => {
	const path = sitePath(projectId, name);
	if (path === null) return { state: 'none' };
	const vis = await readVisibility(github, ref);
	if (!vis.site?.url) return { state: 'none' };
	const base = `/repos/${ref.owner}/${ref.repo}`;
	// The newest deploy that finished: one still running may yet fail.
	let deployed: string | null = null;
	for (const d of ((await github.api(`${base}/deployments?environment=github-pages&per_page=5`)) as { id: number; sha: string }[] | null) ?? []) {
		const [latest] = ((await github.api(`${base}/deployments/${d.id}/statuses?per_page=1`)) as { state: string }[] | null) ?? [];
		if (latest?.state === 'success') {
			deployed = d.sha;
			break;
		}
	}
	const [changed] =
		((await github.api(`${base}/commits?path=${encodeURIComponent(prototypePagePath(projectId, name))}&sha=${encodeURIComponent(vis.defaultBranch)}&per_page=1`)) as
			| { sha: string }[]
			| null) ?? [];
	if (deployed === null || !changed) return { state: 'unpublished' };
	if (changed.sha !== deployed) {
		const { status } = asRecord(await github.api(`${base}/compare/${changed.sha}...${deployed}`));
		// The deploy is the change itself or after it.
		if (status !== 'ahead' && status !== 'identical') return { state: 'unpublished' };
	}
	return { state: 'published', url: `${vis.site.url.replace(/\/?$/, '/')}${path}?v=${deployed.slice(0, 7)}`, public: !vis.repoPrivate || vis.site.public };
};

export interface PublishInput {
	github: GitHubApi;
	ref: DesignRepoRef;
	/**
	 * The branch the records are pushed to, when they are pushed from a clone. The site is deployed from the repository's
	 * default branch, so records anywhere else would never reach it: that is refused.
	 */
	recordsBranch?: string;
	projectId: string;
	name: string;
	/** The person typed the phrase for this run. */
	publicTest: boolean;
	/** Commits and pushes the records (only `projects/`), as the app's publisher does. */
	pushRecords: () => Promise<SyncResult>;
	/** Asks for a page with no credentials at all. */
	fetchAnonymously: (url: string) => Promise<{ status: number }>;
	sleep?: (ms: number) => Promise<void>;
	log?: (line: string) => void;
	/** How long the deploy may take, all told. */
	timeoutMs?: number;
}

export interface Published {
	url: string;
	/** The page opened with no credentials. */
	public: boolean;
	/** Published as a public test, with the banner on it. */
	publicTest: boolean;
}

export const publish = async ({
	github,
	ref,
	recordsBranch,
	projectId,
	name,
	publicTest,
	pushRecords,
	fetchAnonymously,
	sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
	log = () => undefined,
	timeoutMs = 10 * 60_000,
}: PublishInput): Promise<Published> => {
	const path = sitePath(projectId, name);
	if (path === null) throw new Error(`"${name}" is not a prototype, so it has no page to publish.`);
	const base = `/repos/${ref.owner}/${ref.repo}`;

	// 1. The gate, before anything leaves this machine.
	const visibility = await readVisibility(github, ref);
	const gate = passGate(visibility, publicTest);
	if (!gate.ok) throw new Error(gate.why);
	const branch = visibility.defaultBranch;
	if (recordsBranch !== undefined && recordsBranch !== branch) {
		throw new Error(`Nothing was published: the site is built from ${branch}, and the design repository here is on ${recordsBranch}. Switch it to ${branch}, then publish again.`);
	}

	// 2. The records, and only the records.
	const pushed = await pushRecords();
	if (pushed.problems.length > 0) throw new Error(`Nothing was published: ${pushed.problems.map((p) => p.why).join(' ')}`);

	// 3. The deploy: the site is built from what GitHub now has. Runs that were there before are not this one.
	const runs = async (): Promise<Run[]> =>
		(asRecord(await github.api(`${base}/actions/workflows/${PUBLISH_WORKFLOW}/runs?event=workflow_dispatch&branch=${encodeURIComponent(branch)}&per_page=20`))
			.workflow_runs as Run[] | undefined) ?? [];
	const before = new Set((await runs()).map((r) => r.id));
	try {
		await github.api(`${base}/actions/workflows/${PUBLISH_WORKFLOW}/dispatches`, {
			method: 'POST',
			body: { ref: branch, inputs: { public_test: String(gate.publicTest) } },
		});
	} catch (err) {
		if (notFound(err)) throw new Error(`The workflow that publishes the site (.github/workflows/${PUBLISH_WORKFLOW}) is not on GitHub yet, on the repository's default branch. Push it, then publish again.`);
		throw err;
	}
	log('Publishing: the site is being built and deployed. This takes a minute or two.');
	const started = Date.now();
	let mine: Run | undefined;
	for (;;) {
		await sleep(5000);
		mine = (await runs()).find((r) => !before.has(r.id));
		if (mine?.status === 'completed') break;
		if (Date.now() - started > timeoutMs) throw new Error(`The deploy has not finished after ${Math.round(timeoutMs / 60_000)} minutes. ${mine ? `See ${mine.html_url}.` : 'It never started.'}`);
	}
	if (mine.conclusion !== 'success') throw new Error(`The deploy did not finish (${mine.conclusion}). What went wrong is at ${mine.html_url}. No link was made.`);

	// 4. The link, and whether it opens for someone who is not signed in.
	const url = `${gate.url.replace(/\/?$/, '/')}${path}`;
	const opened = (await fetchAnonymously(url)).status === 200;
	if (gate.publicTest) {
		log(`PUBLIC TEST: this page is on a public site, and anyone with the link can open it. It says PUBLIC TEST on it. ${url}`);
	} else if (opened) {
		log(`This page opens for anyone, signed in or not, although GitHub said the site was private. Do not share it; check the repository's Pages settings. ${url}`);
	} else {
		log(`Published. It opens for people signed in to GitHub with access to ${ref.owner}/${ref.repo}: ${url}`);
	}
	return { url, public: opened, publicTest: gate.publicTest };
};
