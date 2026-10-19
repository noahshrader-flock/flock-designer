import { ChangeRequests } from '../../../codeHost/changeRequests';
import type { GitHubApi } from '../../../codeHost/github';
import { HostError, hostErrorKind } from '../../../codeHost/hostError';
import { RepoFiles } from '../../../codeHost/repoFiles';
import { type RepoRef, repoRefOf } from '../../../shared/repoRef';
import { ghApi } from '../platform/ghCli';
import { pushBranch, repositoryOf } from '../platform/git';
import type { ShareTools } from '../../ports';
import { CHANGE_REQUEST, HOST, needsCli } from '../../../shared/vocabulary';

/**
 * The real tools behind sharing: the designer's own git for the push, and their own GitHub CLI (`gh api`) for the pull
 * request. Not DSNR's sign-in: its GitHub App is deliberately limited to the design repository, and the pull request
 * lives in the product repository; the designer's `gh` is already signed in as them, and DSNR never sees its token.
 */

export const SHARE_NEEDS_CLI = needsCli(`Opening a ${CHANGE_REQUEST}`);
const NOT_ON_HOST = `This repository's origin is not on ${HOST}, so a ${CHANGE_REQUEST} cannot be opened for it from here.`;

const withAdvice = (gh: GitHubApi): GitHubApi => ({
	api: (path, init) =>
		gh.api(path, init).catch((err: unknown) => {
			const kind = hostErrorKind(err);
			if (kind === 'missingCli' || kind === 'reauth') throw new HostError(SHARE_NEEDS_CLI, undefined, kind);
			throw err;
		}),
});

/** `repo`, when given, is used instead of the repository the checkout's origin names. */
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
		createDraftPr: async (branch, title, body, base) =>
			(await requests()).openDraft({ head: branch, base: base ?? (await new RepoFiles(gh, await repository()).defaultBranch()), title, body }),
		isOpen: async (pr) => (await requests()).isOpen(pr),
		checks: async (pr) => (await requests()).checks(pr),
		sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
		now: () => Date.now(),
	};
};
