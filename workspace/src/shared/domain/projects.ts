export interface Work {
	projectId: string;
	/** `v2`, or `codebase`. */
	name: string;
	branch: string;
	/** Null until the work has a commit. */
	commit: string | null;
	createdAt: string;
	note: string;
	/** Refreshed whenever the work is opened or shared. */
	contributors?: Person[];
	previewUrl?: string;
	pullRequest?: string;
	/**
	 * The commit codebase work's last handoff found it ready at; absent once a handoff found it not ready, or before one
	 * did. Kept on the record, so a restart or a teammate sees it too.
	 */
	readyAt?: string;
	/** `owner/repo`, from the checkout it was started in. */
	repository?: string;
	/**
	 * Checked with `asRoute` wherever it is read back: it comes from a file an agent wrote, and it is joined onto the
	 * preview's own address.
	 */
	route?: string;
	/**
	 * `repository` is the clone's folder name; `product` is `owner/repo` from the clone's remote, the same on every machine.
	 * Absent when made without a repository here.
	 */
	basedOn?: { repository: string; branch: string; commit: string | null; product?: string };
	/**
	 * The hash of the page the picture was drawn from (`coverPath`), so it is current exactly when this is the page's hash.
	 * Written after the picture is, by the machine the page was built on.
	 */
	cover?: string;
	/** Absent when it was a new idea of its own. */
	from?: string;
}

export type WorkKind = 'prototype' | 'codebase';

/** `command` is for a terminal, when Claude Code is not in VS Code. */
/** What any hand-off to the agent did: opened in this window, or `command` for a terminal, on the clipboard. */
export interface Handed {
	/** The agent's name, as its adapter says it. */
	agent: string;
	editor: boolean;
	command: string | null;
}

/** `none`: no handoff was handed over here, or its result was given already. */
export type HandoffResult =
	| { state: 'none' }
	| { state: 'waiting' }
	| {
			state: 'done';
			/** What HANDOFF.md's first line says; null when it says neither. */
			verdict: 'ready' | 'not ready' | null;
			/** The branch's remote moved while it was handed over: a handoff never pushes. */
			pushed: boolean;
			/** Changed files a handoff leaves alone. */
			outside: string[];
	  };

export interface OpenedPrototype {
	url: string;
	states: string[];
}

export interface BuildInCodebasePlan {
	branch: string;
	/** In this checkout. */
	exists: boolean;
	recorded: boolean;
	/** Its branch is here, or it is recorded: Build continues it rather than starting a second. */
	started: boolean;
	repository: string;
	basedOn: { repository: string; branch: string } | null;
	/** `clean`: no uncommitted changes, which creating a branch needs. */
	current: string | null;
	clean: boolean;
	/**
	 * The work's branch has the product's DSNR setup, or will be made from one that does: without it DSNR could not read
	 * what it may run in the branch it moved to.
	 */
	setup: boolean;
}

export type PrototypeReadiness =
	| { ready: true; designSystem: string; version: string | null }
	| {
			ready: false;
			why: 'not-installed' | 'no-bundler';
			designSystem: string;
			repository: string;
			/** The repository declares how it installs (`install`). */
			canInstall: boolean;
	  };

/** Reviewers never clone anything, so a project is assembled from the design repository's contents, not a checkout. */
export interface Project {
	/** Its directory's name under `projects/`. */
	id: string;
	/** First heading of `brief.md`, or the id. */
	title: string;
	folder: string | null;
	records: string[];
	/** In `workOrder`. */
	work: ProjectWork[];
	/** Code on its branch, or its design-repo folder. */
	people: Person[];
	/**
	 * GitHub's last change to its folder or comment on its threads; null when it could not be read. Read with
	 * `lastUpdated`, which also counts when each piece of work was made.
	 */
	updatedAt?: string | null;
	/** Built here, not yet shared. */
	localOnly?: boolean;
}

export interface ProjectWork {
	name: string;
	branch: string;
	/** The issue that carries this work's comments. */
	issueNumber: number | null;
	/** 0 for work with no thread yet, or only on this machine. */
	openComments: number;
	previewUrl: string | null;
	/** So a comment can say what it was made against. */
	commit: string | null;
	contributors: Person[];
	/** ISO date: its record's, or for work found only as a branch, its first commit. */
	createdAt: string | null;
	route: string | null;
	/** For a prototype, `basedOn.product`; codebase work's product is its `repository` (both read by `productsOf`). */
	product: string | null;
	/**
	 * Given only while the branch is still at that commit in the checkout open here, so a commit since makes it a handoff to
	 * run again.
	 */
	readyAt: string | null;
	localOnly?: boolean;
	repository: string | null;
	pullRequest: string | null;
	cover: string | null;
}

export interface MadeCover {
	projectId: string;
	name: string;
	cover: string;
}

/** The login is known only when one could be resolved. */
export interface Person {
	name: string;
	login: string | null;
}

/**
 * `unpublished`: saved but not deployed, with why when a publish was tried and stopped; `unavailable`: GitHub would not
 * say; `none`: there is no site to be on.
 */
export type PageStatus =
	| { state: 'none' }
	| { state: 'publishing' }
	| { state: 'unpublished'; why?: string }
	| { state: 'unavailable'; why: string }
	| { state: 'published'; url: string };

export interface HandedComment extends Handed {
	/** The one commented on, or a new version from it. */
	target: string;
	/** The version a new one starts from; null for a change in place. */
	from: string | null;
	/** The comment's number on its pin. */
	number: number;
}
