import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { locateGh } from './ghCli';
import { pushBranch } from './git';
import { type Check, type PullRequest, ShareProblem, type ShareTools } from './share';

const run = promisify(execFile);

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

/** A `gh` run that failed, keeping what it printed: some failures still carry the answer. */
class GhFailure extends ShareProblem {
	constructor(
		message: string,
		readonly stdout: string,
		readonly stderr: string,
	) {
		super(message);
	}
}

const gh = async (root: string, bin: string, args: string[]): Promise<string> => {
	try {
		const { stdout } = await run(bin, args, {
			cwd: root,
			timeout: 60_000,
			maxBuffer: 8 * 1024 * 1024,
			// No prompts: there is no terminal to answer one.
			env: { ...process.env, GH_PROMPT_DISABLED: '1', NO_COLOR: '1' },
		});
		return stdout.trim();
	} catch (err) {
		const e = err as NodeJS.ErrnoException & { stdout?: string; stderr?: string };
		if (e.code === 'ENOENT') throw new ShareProblem(NOT_INSTALLED);
		const detail = (e.stderr ?? '').trim() || e.message;
		if (/gh auth login|not logged in|HTTP 401/i.test(detail)) throw new ShareProblem(NOT_SIGNED_IN);
		// `gh` exits non-zero to say "checks are pending" or "a check failed" and still prints the answer.
		throw new GhFailure(`The GitHub CLI said: ${detail}`, e.stdout ?? '', e.stderr ?? '');
	}
};

const number = (url: string): number => {
	const n = Number(/\/pull\/(\d+)/.exec(url)?.[1]);
	if (!Number.isInteger(n) || n <= 0) throw new ShareProblem(`The GitHub CLI did not return a pull request address (it said: ${url}).`);
	return n;
};

const asChecks = (stdout: string): Check[] => {
	const parsed: unknown = JSON.parse(stdout);
	return (Array.isArray(parsed) ? parsed : []).map((c: Record<string, unknown>) => ({
		name: String(c.name ?? ''),
		workflow: String(c.workflow ?? ''),
		bucket: String(c.bucket ?? ''),
		link: String(c.link ?? ''),
		startedAt: String(c.startedAt ?? ''),
	}));
};

export const realShareTools = (root: string, bin: string = locateGh()): ShareTools => ({
	push: (branch) => pushBranch(root, branch),

	findPr: async (branch): Promise<PullRequest | null> => {
		const out = await gh(root, bin, ['pr', 'list', '--head', branch, '--state', 'open', '--json', 'number,url', '--limit', '1']);
		const first = (JSON.parse(out || '[]') as { number?: number; url?: string }[])[0];
		return first?.number && first.url ? { number: first.number, url: first.url } : null;
	},

	createDraftPr: async (branch, title, body): Promise<PullRequest> => {
		const url = (await gh(root, bin, ['pr', 'create', '--draft', '--head', branch, '--title', title, '--body', body]))
			.split('\n')
			.pop() as string;
		return { number: number(url), url };
	},

	checks: async (pr): Promise<Check[]> => {
		try {
			return asChecks(await gh(root, bin, ['pr', 'checks', String(pr), '--json', 'name,workflow,bucket,link,startedAt']));
		} catch (err) {
			if (err instanceof GhFailure) {
				if (err.stdout.trim().startsWith('[')) return asChecks(err.stdout);
				// Right after a push there can be nothing yet; that is "not started", not an error.
				if (/no checks reported/i.test(`${err.stderr} ${err.message}`)) return [];
			}
			throw err;
		}
	},

	sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
	now: () => Date.now(),
});
