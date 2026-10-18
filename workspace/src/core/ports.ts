import type { GitHubApi } from '../github/github';
import type { CheckPage } from './services/accessibility/accessibilityCheck';
import type { Measure } from './services/designSystem/componentTokens';
import type { AgentSession } from './services/agent/editor';
import type { DrawCover } from './services/prototypes/projectCovers';
import type { ShareTools } from './services/codebase/share';

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
