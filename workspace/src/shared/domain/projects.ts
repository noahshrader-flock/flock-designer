import type { ReviewComment } from './comments';

/** Projects and their work: what is kept of them, and how the window shows them. */

/** One named attempt at the question, tied to a branch and a commit. */
export interface Work {
	projectId: string;
	/** A prototype's version, `v2`, or `codebase`. */
	name: string;
	branch: string;
	/** Null until the work has a commit. */
	commit: string | null;
	createdAt: string;
	note: string;
	/** People who have committed on this branch. Refreshed whenever the work is opened or shared. */
	contributors?: Person[];
	/** Where a reviewer can open this work, once it has been shared. */
	previewUrl?: string;
	/** Codebase work's pull request, once it has been shared: what the project's page links to as built in code. */
	pullRequest?: string;
	/**
	 * Codebase work's last handoff, when it found the work ready for engineering: the commit it was ready at. Absent once a
	 * handoff found it not ready, or before one did. Kept on the record, so a restart or a teammate sees it too.
	 */
	readyAt?: string;
	/** Codebase work's repository on GitHub (`owner/repo`), from the checkout it was started in, so it can be linked to. */
	repository?: string;
	/**
	 * Where this work is in the running app, as a path within it (`/roles/compare`).
	 * Written by whoever built the work, so opening the work lands on what was changed rather
	 * than at the app's front door. Checked with `asRoute` wherever it is read back: it comes from a
	 * file an agent wrote, and it is joined onto the preview's own address.
	 */
	route?: string;
	/**
	 * For a prototype: the product code it was modeled on, so building it in the codebase later knows
	 * what it was looking at. Absent when it was made without a repository on the machine. `repository` is the clone's
	 * folder name, as this machine has it; `product` is the repository itself on its host (`owner/repo`, from the clone's
	 * remote), the same on every machine, and absent for a prototype recorded before 2026-10-14 or made in a clone with none.
	 */
	basedOn?: { repository: string; branch: string; commit: string | null; product?: string };
	/**
	 * For a prototype: which picture of it is kept, as the hash of the page it was drawn from. The picture is the file
	 * `covers/<name>-<cover>.jpg` in the project's folder (`coverPath`), so it is current exactly when this is the page's
	 * hash. Written after the picture is, by the machine the page was built on.
	 */
	cover?: string;
	/** For a prototype: the version it was started from, `v1`; absent when it was a new idea of its own. */
	from?: string;
}

/**
 * The two kinds of work. A **prototype** is one page built from the real components, saved in the design
 * repository, each version of it named by one number, `v2`. **Codebase** work is the real change, on the project's one
 * `feature/` branch.
 */
export type WorkKind = 'prototype' | 'codebase';

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
	/** Its work, from its records and this machine's branches, in `workOrder`. */
	work: ProjectWork[];
	/** Everyone who has committed to the project: code on its branch, or its design-repo folder. */
	people: Person[];
	/**
	 * The last time anything happened to the project that GitHub knows of: a change to its folder in the design
	 * repository, or a comment on one of its review threads. Null when it could not be read. Read with `lastUpdated`,
	 * which also counts when each piece of work was made.
	 */
	updatedAt?: string | null;
	/** True when the project exists only on this machine: built here, not yet shared. */
	localOnly?: boolean;
}

export interface ProjectWork {
	name: string;
	branch: string;
	/** The issue that carries this work's comments, once one exists. */
	issueNumber: number | null;
	/** How many comments are open on this work: 0 for work with no thread yet, or only on this machine. */
	openComments: number;
	/** Preview URL recorded when the work was shared, if any. */
	previewUrl: string | null;
	/** The commit the work was last recorded at, so a comment can say what it was made against. */
	commit: string | null;
	contributors: Person[];
	/**
	 * When the work was started, as an ISO date: its record's, or for work found only as a branch, its first
	 * commit. Null when neither is known. A project's date is its earliest record's, and orders the list.
	 */
	createdAt: string | null;
	/**
	 * Where the work is in the running app (`/roles/compare`), so opening the work lands on what
	 * was changed instead of the app's front door. Null when the record does not say.
	 */
	route: string | null;
	/**
	 * For a prototype: the product it was made on, as its repository on its host (`owner/repo`, the record's
	 * `basedOn.product`); null for one recorded before that was kept, or found only as a branch. Codebase work's product is
	 * its `repository`. Both are read by `productsOf`.
	 */
	product: string | null;
	/**
	 * For codebase work: the commit a handoff found it ready for engineering at, as the list gives it only while its
	 * branch is still at that commit in the checkout open here (`listProjects`); null otherwise, so a commit since makes it
	 * a handoff to run again.
	 */
	readyAt: string | null;
	/** True when this work exists only on this machine. */
	localOnly?: boolean;
	/** Codebase work: its repository on GitHub (`owner/repo`) and its pull request, when the record says. Read with `codeLink`. */
	repository: string | null;
	pullRequest: string | null;
	/** A prototype's picture, by the hash on its record (`Work.cover`); null when it has none yet. Read with `coverToShow`. */
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
 * Whether a version of a prototype is on the published site: `published` with its link,
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
	/** The version the change is in: the one commented on, or a new version from it. */
	version: string;
	made: Work | null;
	comment: ReviewComment;
}
