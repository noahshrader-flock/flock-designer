import { ChangeRequests } from '../../../github/changeRequests';
import type { GitHubApi } from '../../../github/github';
import { HostError, hostErrorKind } from '../../../github/hostError';
import { RepoFiles } from '../../../github/repoFiles';
import { type RepoRef, repoRefOf } from '../../../shared/repoRef';
import { ghApi } from '../platform/ghCli';
import { pushBranch, repositoryOf } from '../platform/git';
import type { ShareTools } from '../../ports';
import { CHANGE_REQUEST, HOST, needsCli } from '../../../shared/vocabulary';

/**
 * The real tools behind sharing: the designer's own git for the push, and their own GitHub CLI (`gh api`) for the pull
 * request (`ChangeRequests`).
 *
 * **Why the GitHub CLI and not this app's own sign-in.** The app's GitHub App is installed on
 * the design repository only, and is deliberately limited to it; the pull request lives in the
 * product repository. Widening the app's token to every repository its user can reach would
 * undo the reason it is narrow. The designer's own `gh` is already signed in as them, with
 * whatever they are allowed to do, and the app never sees its token.
 */

/** What is said when the person's own command line cannot be used, missing or signed out: sharing goes through it. */
export const SHARE_NEEDS_CLI = needsCli(`Opening a ${CHANGE_REQUEST}`);
const NOT_ON_HOST = `This repository's origin is not on ${HOST}, so a ${CHANGE_REQUEST} cannot be opened for it from here.`;

/** The person's own command line, its two failures said as what to do about them. */
const withAdvice = (gh: GitHubApi): GitHubApi => ({
	api: (path, init) =>
		gh.api(path, init).catch((err: unknown) => {
			const kind = hostErrorKind(err);
			if (kind === 'missingCli' || kind === 'reauth') throw new HostError(SHARE_NEEDS_CLI, undefined, kind);
			throw err;
		}),
});

/**
 * The tools for a share from the product checkout at `root`: its pull requests through `host` (the person's `gh`), in
 * the repository its origin names, or `repo` when given.
 */
export const realShareTools = (root: string, host: GitHubApi = ghApi(), repo?: RepoRef): ShareTools => {
	const gh = withAdvice(host);
	// Where the pull requests are, worked out once for this checkout: it is asked again on every look at the checks.
	let where: Promise<RepoRef> | null = null;
	const repository = (): Promise<RepoRef> =>
		(where ??= (async () => {
			if (repo) return repo;
			const path = await repositoryOf(root);
			if (path === null) throw new Error(NOT_ON_HOST);
			return repoRefOf(path);
		})());
	const requests = async () => new ChangeRequests(gh, await repository());
	return {
		push: (branch) => pushBranch(root, branch),
		findPr: async (branch) => (await requests()).findOpen(branch),
		// Onto the branch it was made from when named, else the repository's default, as a pull request is opened when none is.
		createDraftPr: async (branch, title, body, base) =>
			(await requests()).openDraft({ head: branch, base: base ?? (await new RepoFiles(gh, await repository()).defaultBranch()), title, body }),
		checks: async (pr) => (await requests()).checks(pr),
		sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
		now: () => Date.now(),
	};
};
