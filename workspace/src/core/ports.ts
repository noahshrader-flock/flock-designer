import type { Check, PullRequest } from '../codeHost/changeRequests';
import type { AxeRun } from '../shared/accessibility';
import type { Drawn, Mode, Vary } from './services/designSystem/componentTokens';
import type { Agent } from './services/agent/agent';
import type { ChooseDeps, Choice } from './services/agent/choose';
import type { Handed } from '../shared/contract';

/** What each story file drew, in the order given; null for one that would not draw. */
export type Measure = (
	runs: {
		base: string;
		mode: Mode;
		files: string[];
		pictures?: boolean;
		accessibility?: string[];
		/** Instead of its stories, one of them drawn once with each value of each prop. */
		vary?: Vary;
	}[],
) => Promise<(Drawn | null)[][]>;

/** One run per state, or one called `default` when it has none; a state that will not load or check fails the whole. */
export type CheckPage = (url: string, states: string[], tags: string[]) => Promise<AxeRun[]>;

/** The JPEG, or null when it gave no good picture. */
export type DrawCover = (url: string) => Promise<Buffer | null>;

export interface ShareTools {
	push(branch: string): Promise<{ pushed: boolean }>;
	findPr(branch: string): Promise<PullRequest | null>;
	/** Always a draft: nothing here can open one ready for review. Onto `base` when given, else the repository's default. */
	createDraftPr(branch: string, title: string, body: string, base?: string): Promise<PullRequest>;
	isOpen(pr: number): Promise<boolean>;
	checks(pr: number): Promise<Check[]>;
	sleep(ms: number): Promise<void>;
	now(): number;
}

export interface Headless {
	measure: Measure;
	scan: CheckPage;
	draw: DrawCover;
}

/** Given to `registerCalls` whole, so a test that forgot one fails to compile rather than opening VS Code or pushing a branch. */
export interface Ports {
	/** Null when the person cancels. */
	chooseFolder(options: { title: string; defaultPath?: string; canCreate?: boolean }): Promise<string | null>;
	tell(message: { message: string; detail: string }): Promise<void>;
	openExternal(url: string): Promise<void>;
	openPath(path: string): Promise<void>;
	copy(text: string): Promise<void>;
	/** Follows redirects; throws when nothing answers within a few seconds. */
	httpStatus(url: string): Promise<number>;
	/**
	 * Opens the agent in `root` with `prompt`, saying how; null when this editor has nowhere for it. `signedIn`: whether the
	 * editor itself can tell, for an agent that cannot (null: it cannot either).
	 */
	agentWindow: { open(agent: Agent, root: string, prompt: string): Promise<Handed['opened']>; signedIn(agent: Agent): Promise<boolean | null> };
	/** The agent the person keeps, or `ask`. */
	agentChoice(): Choice;
	/** Which agent, asked of the person. */
	pickAgent: ChooseDeps['pick'];
	keepAgent: ChooseDeps['keep'];
	shareTools(root: string): ShareTools;
	headless: Headless;
}
