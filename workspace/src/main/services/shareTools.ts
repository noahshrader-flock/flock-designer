import { ChangeRequests } from '../../host/changeRequests';
import type { GitHubApi } from '../../host/designRepo';
import { HostError, hostErrorKind } from '../../host/hostError';
import { RepoFiles } from '../../host/repoFiles';
import { type RepoRef, parseRemote, repoRefOf } from '../../shared/repoRef';
import { ghApi } from './ghCli';
import { originUrl, pushBranch } from './git';
import type { ShareTools } from './share';

/**
 * The real tools behind sharing: the designer's own git for the push, and the GitHub CLI for
 * the pull request.
 *
 * **Why the GitHub CLI and not this app's own sign-in.** The app's GitHub App is installed on
 * the design repository only, and is deliberately limited to it; the pull request lives in the
 * product repository. Widening the app's token to every repository its user can reach would
 * undo the reason it is narrow. The designer's own `gh` is already signed in as them, with
 * whatever they are allowed to do, and the app never sees its token.
 */

const NOT_INSTALLED =
	'Pull requests are opened with the GitHub CLI (gh), which was not found on this machine. Install it from https://cli.github.com, run `gh auth login` in a terminal, then try again.';
const NOT_SIGNED_IN = 'The GitHub CLI is installed but not signed in. Run `gh auth login` in a terminal, then try again.';

const NOT_ON_GITHUB = "This repository's origin is not on GitHub, so a pull request cannot be opened for it from here.";

/** The person's own command line, its two failures said as what to do about them. */
const withAdvice = (gh: GitHubApi): GitHubApi => ({
	api: (path, init) =>
		gh.api(path, init).catch((err: unknown) => {
			if (hostErrorKind(err) === 'missingCli') throw new HostError(NOT_INSTALLED, undefined, 'missingCli');
			if (hostErrorKind(err) === 'reauth') throw new HostError(NOT_SIGNED_IN, undefined, 'reauth');
			throw err;
		}),
});

/**
 * The tools for a share from the product checkout at `root`: its pull requests through `host` (the person's `gh`), in
 * the repository its origin names, or `repo` when given.
 */
export const realShareTools = (root: string, host: GitHubApi = ghApi(), repo?: RepoRef): ShareTools => {
	const gh = withAdvice(host);
	const where = async (): Promise<RepoRef> => {
		if (repo) return repo;
		const origin = await originUrl(root);
		const path = origin === null ? null : parseRemote(origin);
		if (path === null) throw new Error(NOT_ON_GITHUB);
		return repoRefOf(path);
	};
	const requests = async () => new ChangeRequests(gh, await where());
	return {
		push: (branch) => pushBranch(root, branch),
		findPr: async (branch) => (await requests()).findOpen(branch),
		// Onto the repository's default branch, as `gh pr create` opens one.
		createDraftPr: async (branch, title, body) =>
			(await requests()).openDraft({ head: branch, base: await new RepoFiles(gh, await where()).defaultBranch(), title, body }),
		checks: async (pr) => (await requests()).checks(pr),
		sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
		now: () => Date.now(),
	};
};
