import type { Check, PullRequest } from '../codeHost/changeRequests';
import type { AxeRun } from '../shared/accessibility';
import type { Drawn, Mode, Vary } from './services/designSystem/componentTokens';
import type { GitHubApi } from '../codeHost/github';
import type { AgentSession } from './services/agent/editor';

/**
 * Draws story files from a build of the previews (its `base`), in a mode, and says what each drew, in the order given;
 * null for one that would not draw. Several runs at once.
 */
export type Measure = (
	runs: {
		base: string;
		mode: Mode;
		files: string[];
		pictures?: boolean;
		accessibility?: string[];
		/** Instead of its stories, one of them drawn once with each value of each prop (Phase 5). */
		vary?: Vary;
	}[],
) => Promise<(Drawn | null)[][]>;

/**
 * Runs axe on a page in each of its `states`, with `tags`: one run per state, or one of the page as it opens when it has
 * none, said as `default`. A state that will not load or check fails the whole, said in words.
 */
export type CheckPage = (url: string, states: string[], tags: string[]) => Promise<AxeRun[]>;

/** A page drawn as its picture, by its address on the local server: the JPEG, or null when it gave no good picture. */
export type DrawCover = (url: string) => Promise<Buffer | null>;

/** The person's own git and GitHub command line, as sharing a branch uses it: pushing, and a draft pull request. */
export interface ShareTools {
	push(branch: string): Promise<{ pushed: boolean }>;
	/** The open pull request for a branch, if there is one. */
	findPr(branch: string): Promise<PullRequest | null>;
	/**
	 * Always a draft. Nothing here can open one that is ready for review. Onto `base` when given (the branch it was made from),
	 * else the repository's default.
	 */
	createDraftPr(branch: string, title: string, body: string, base?: string): Promise<PullRequest>;
	checks(pr: number): Promise<Check[]>;
	sleep(ms: number): Promise<void>;
	now(): number;
}

/**
 * What only a shell can do for the core without being seen: draw a page out of sight, in a headless browser
 * (`chromeHeadless.ts`).
 */
export interface Headless {
	/** How stories are drawn to read what they draw (T6). */
	measure: Measure;
	/** How a page is checked for accessibility (T7): axe-core in each of its states. */
	scan: CheckPage;
	/** How a prototype's page is drawn as its picture on its project's card. */
	draw: DrawCover;
}

/**
 * Everything the handlers reach outside the core, which only the shell can give: the system's dialogs, other applications,
 * the clipboard, the network, the person's own command-line tools, drawing out of sight. VS Code's are `extension/src/vscodePorts.ts`. Given to `registerCalls` whole, so a test hands it fakes and nothing real is
 * reachable by default: a test that forgot one fails to compile, rather than opening VS Code or pushing a branch.
 */
export interface Ports {
	/** The system's folder picker, over the window; null when the person cancels. */
	chooseFolder(options: { title: string; defaultPath?: string; canCreate?: boolean }): Promise<string | null>;
	/** A message the person reads and dismisses. */
	tell(message: { message: string; detail: string }): Promise<void>;
	/** A link opened in the person's browser. */
	openExternal(url: string): Promise<void>;
	/** A folder opened in Finder (or the system's file manager). */
	openPath(path: string): Promise<void>;
	copy(text: string): Promise<void>;
	/** What an address answers with, following redirects, within a few seconds; it throws when nothing answers. */
	httpStatus(url: string): Promise<number>;
	/** VS Code with Claude Code, when it is here, and how work is handed to it. */
	editor: {
		find(): string | null;
		openFolder(editor: string, folder: string): Promise<void>;
		openPrompt(editor: string, root: string, prompt: string): Promise<void>;
		openSession(editor: string, session: AgentSession, then: () => void): Promise<void>;
	};
	/** Where Claude Code is, for a command the person runs themselves. */
	claude(): string;
	/** GitHub's API as the person, through their own command line (`gh`); null when it is not here. */
	personGitHub: GitHubApi | null;
	/** The person's own git and GitHub command line, for a pull request from `root`. */
	shareTools(root: string): ShareTools;
	/** Drawing out of sight. */
	headless: Headless;
}
