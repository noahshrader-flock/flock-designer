import type { ReviewComment } from './comments';

/** Projects and their iterations: what is kept of them, and how the window shows them. */

/** One named attempt at the question, tied to a branch and a commit. */
export interface Iteration {
	projectId: string;
	/** `v2-i3` (`i1` when written before versions), or `codebase`. */
	name: string;
	branch: string;
	/** Null until the iteration has a commit. */
	commit: string | null;
	createdAt: string;
	note: string;
	/** People who have committed on this branch. Refreshed whenever the iteration is opened or shared. */
	contributors?: Person[];
	/** Where a reviewer can open this iteration, once it has been shared. */
	previewUrl?: string;
	/** Codebase work's pull request, once it has been shared: what the project's page links to as built in code. */
	pullRequest?: string;
	/** Codebase work's repository on GitHub (`owner/repo`), from the checkout it was started in, so it can be linked to. */
	repository?: string;
	/**
	 * Where this iteration's work is in the running app, as a path within it (`/roles/compare`).
	 * Written by whoever built the work, so opening the iteration lands on what was changed rather
	 * than at the app's front door. Checked with `asRoute` wherever it is read back: it comes from a
	 * file an agent wrote, and it is joined onto the preview's own address.
	 */
	route?: string;
	/**
	 * For a prototype: the product code it was modeled on, so building it in the codebase later knows
	 * what it was looking at. Absent when it was made without a repository on the machine.
	 */
	basedOn?: { repository: string; branch: string; commit: string | null };
	/**
	 * For a prototype: which picture of it is kept, as the hash of the page it was drawn from. The picture is the file
	 * `covers/<name>-<cover>.jpg` in the project's folder (`coverPath`), so it is current exactly when this is the page's
	 * hash. Written after the picture is, by the machine the page was built on.
	 */
	cover?: string;
}

/**
 * The two kinds of work. A **prototype** is one page built from the real components, saved in the design
 * repository and named by version and iteration, `v2-i3` (the older ones made as code on `fd/` branches count as prototypes too).
 * **Codebase** work is the real change, on the project's one `feature/` branch.
 */
export type IterationKind = 'prototype' | 'codebase';

/** Where Build in the codebase handed the building: VS Code's Claude Code panel, or a command to start it in a terminal. */
export interface BuildInCodebase {
	editor: boolean;
	command: string | null;
}

/** A prototype served to the review screen: where it is, and the states it has (`shared/prototypeStates`). */
export interface OpenedPrototype {
	url: string;
	states: string[];
}

/** What building a prototype in the codebase would do here, so the person is told before it does it. */
export interface BuildInCodebasePlan {
	/** The project's one codebase branch, as this repository names it. */
	branch: string;
	/** That branch already exists in this checkout: the work continues on it rather than starting a new one. */
	exists: boolean;
	/** The project already has codebase work recorded. */
	recorded: boolean;
	/** The work was started before (its branch is here, or it is recorded): Build continues it rather than starting a second. */
	started: boolean;
	repository: string;
	/** What the prototype was modeled on, if it says. */
	basedOn: { repository: string; branch: string } | null;
	/** The checkout's current branch, and whether it is free of uncommitted changes (which blocks creating a branch). */
	current: string | null;
	clean: boolean;
	/**
	 * The work's branch has the product's DSNR setup (or is not made yet, and is made from one that does). Without it the
	 * work cannot be picked up there: DSNR could not read what it may run in the branch it moved to.
	 */
	setup: boolean;
}

/** Whether a prototype can be built from a repository here: its design system installed, and the bundler present. */
export type PrototypeReadiness =
	| { ready: true; designSystem: string; version: string | null }
	| {
			ready: false;
			why: 'not-installed' | 'no-bundler';
			designSystem: string;
			repository: string;
			/** The repository declares how it installs (`install`), so the app can run it when asked. */
			canInstall: boolean;
	  };

/**
 * A project, read from the design repository through the API.
 *
 * Reviewers never clone anything: this is assembled from the repo's contents,
 * not from a checkout. Authors still work from a real checkout -- that is the
 * difference between the two modes.
 */
export interface Project {
	/** Directory name under `projects/`, which is also the project id. */
	id: string;
	/** First heading of `brief.md`, or the id if it has none. */
	title: string;
	/** The folder it is in, from its brief's front matter (`briefFolder`), or null for none. */
	folder: string | null;
	/** Files present in the project folder, for showing what a project has. */
	records: string[];
	/** Its iterations, from its records and this machine's branches, in `iterationOrder`. */
	iterations: ProjectIteration[];
	/** Everyone who has committed to the project: code on any iteration, or its design-repo folder. */
	people: Person[];
	/**
	 * The last time anything happened to the project that GitHub knows of: a change to its folder in the design
	 * repository, or a comment on one of its review threads. Null when it could not be read. Read with `lastUpdated`,
	 * which also counts when each iteration was made.
	 */
	updatedAt?: string | null;
	/** True when the project exists only on this machine: built here, not yet shared. */
	localOnly?: boolean;
}

export interface ProjectIteration {
	name: string;
	branch: string;
	/** The issue that carries this iteration's comments, once one exists. */
	issueNumber: number | null;
	/** How many comments are open on this iteration: 0 for work with no thread yet, or only on this machine. */
	openComments: number;
	/** Preview URL recorded when the iteration was shared, if any. */
	previewUrl: string | null;
	/** The commit the iteration was last recorded at, so a comment can say what it was made against. */
	commit: string | null;
	contributors: Person[];
	/**
	 * When the work was started, as an ISO date: its record's, or for work found only as a branch, its first
	 * commit. Null when neither is known. A project's date is its earliest iteration's, and orders the list.
	 */
	createdAt: string | null;
	/**
	 * Where the work is in the running app (`/roles/compare`), so opening the iteration lands on what
	 * was changed instead of the app's front door. Null when the record does not say.
	 */
	route: string | null;
	/** True when this iteration exists only on this machine. */
	localOnly?: boolean;
	/** Codebase work: its repository on GitHub (`owner/repo`) and its pull request, when the record says. Read with `codeLink`. */
	repository: string | null;
	pullRequest: string | null;
	/** A prototype's picture, by the hash on its record (`Iteration.cover`); null when it has none yet. Read with `coverToShow`. */
	cover: string | null;
}

/** A picture of a prototype just made and named on its record: what the list takes in without being read again. */
export interface MadeCover {
	projectId: string;
	name: string;
	cover: string;
}

/** Someone who has committed to a project. The login is known only when we could resolve one. */
export interface Person {
	name: string;
	login: string | null;
}

/**
 * Whether a prototype iteration is on the published site: `published` with its link,
 * `publishing` while it is being put there, `unpublished` when it is saved but not deployed (with why, when a publish
 * was tried and stopped), `unavailable` when GitHub would not say, and `none` when there is no site to be on.
 */
export type PageStatus =
	| { state: 'none' }
	| { state: 'publishing' }
	| { state: 'unpublished'; why?: string }
	| { state: 'unavailable'; why: string }
	| { state: 'published'; url: string };

/** How an Address run on a prototype ended: see `finishPrototypeAddress`. */
export interface PrototypeAddressed {
	changed: boolean;
	iteration: string;
	made: Iteration | null;
	comment: ReviewComment;
}
