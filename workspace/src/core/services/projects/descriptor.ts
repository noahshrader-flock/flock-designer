import { readFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import type { WorkKind } from '../../../shared/contract';
import { resolveInside } from '../platform/paths';
import { asRecord } from '../../../shared/json';
import { errorText } from '../../../shared/result';

/** The descriptor's commands are the complete list of what may run in a repository; nothing else can be run. */

export const DESCRIPTOR_PATH = '.dsnr/workspace.json';

const isStringArray = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === 'string');

const parseCommand = (raw: unknown, index: number): WorkspaceCommand => {
	const at = `commands[${index}]`;
	if (typeof raw !== 'object' || raw === null) {
		throw new Error(`${at} is not an object`);
	}
	const c = raw as Record<string, unknown>;
	if (typeof c.id !== 'string' || c.id === '') {
		throw new Error(`${at}.id is missing`);
	}
	if (typeof c.label !== 'string' || c.label === '') {
		throw new Error(`${at}.label is missing`);
	}
	if (!isStringArray(c.argv) || c.argv.length === 0) {
		// Already-split argv, never a shell string: there is no shell to interpret
		// quoting, pipes or substitution, so a descriptor cannot smuggle one in.
		throw new Error(`${at}.argv must be a non-empty array of strings`);
	}
	if (c.servesPreviewOn !== undefined && typeof c.servesPreviewOn !== 'number') {
		throw new Error(`${at}.servesPreviewOn must be a port number`);
	}
	return {
		id: c.id,
		label: c.label,
		argv: c.argv,
		...(typeof c.servesPreviewOn === 'number' ? { servesPreviewOn: c.servesPreviewOn } : {}),
	};
};

/**
 * The kinds of work a descriptor may say it can share. Only `codebase` is shared; `prototype` is read, so a product that
 * names it is not refused, and means nothing.
 */
const KINDS = ['prototype', 'codebase'] as const;

/**
 * A design system's folder in the product's own repository, as a path inside it with no slash at its end. It comes from a
 * file anyone may edit and is joined onto the checkout, so it is nothing but plain folder names: not absolute, not up a
 * level, not empty, and not the repository itself (that is a design system in a repository of its own: leave it out).
 */
const designSystemFolder = (value: unknown): string => {
	const bad = () => new Error(`${DESCRIPTOR_PATH} has a designSystem.folder that is not a folder inside the repository`);
	if (typeof value !== 'string') throw bad();
	const path = value.replace(/\/+$/, '');
	if (path === '' || path.startsWith('/') || path.split('/').some((part) => part === '' || part === '.' || part === '..')) throw bad();
	return path;
};

/**
 * Optional: a repository that cannot build a preview for a branch just leaves it out. When it is
 * there it is held to what sharing needs, because a bad address here would be recorded for every
 * reviewer: https only, and a place for the pull request number.
 */
const parseShare = (raw: unknown): ShareDescriptor | undefined => {
	if (raw === undefined) return undefined;
	const s = asRecord(raw);
	if (typeof s.url !== 'string' || !s.url.startsWith('https://') || !s.url.includes('<pr>')) {
		throw new Error(`${DESCRIPTOR_PATH} share.url must be an https address containing <pr>`);
	}
	if (typeof s.workflow !== 'string' || s.workflow === '') {
		throw new Error(`${DESCRIPTOR_PATH} share.workflow must name the workflow that deploys a preview`);
	}
	if (!Array.isArray(s.kinds) || s.kinds.length === 0 || !s.kinds.every((k) => (KINDS as readonly unknown[]).includes(k))) {
		throw new Error(`${DESCRIPTOR_PATH} share.kinds must list "codebase" (a "prototype" there is read, and means nothing)`);
	}
	return { url: s.url, workflow: s.workflow, kinds: s.kinds as ShareDescriptor['kinds'] };
};

export const parseDescriptor = (text: string): WorkspaceDescriptor => {
	let raw: unknown;
	try {
		raw = JSON.parse(text);
	} catch (err) {
		throw new Error(`${DESCRIPTOR_PATH} is not valid JSON: ${errorText(err)}`);
	}
	if (typeof raw !== 'object' || raw === null) {
		throw new Error(`${DESCRIPTOR_PATH} is not an object`);
	}
	const d = raw as Record<string, unknown>;

	if (d.version !== 1) {
		// Refusing a version we do not know beats reading it optimistically and
		// running something that means what a later schema said it meant.
		throw new Error(`${DESCRIPTOR_PATH} declares version ${String(d.version)}; this app understands 1`);
	}
	for (const key of ['product', 'contextDir'] as const) {
		if (typeof d[key] !== 'string' || d[key] === '') {
			throw new Error(`${DESCRIPTOR_PATH} is missing ${key}`);
		}
	}
	const branch = d.branchPattern as Record<string, unknown> | undefined;
	if (!branch || typeof branch.codebase !== 'string') {
		throw new Error(`${DESCRIPTOR_PATH} is missing branchPattern.codebase`);
	}
	if (!Array.isArray(d.commands)) {
		throw new Error(`${DESCRIPTOR_PATH} is missing commands`);
	}
	const commands = d.commands.map(parseCommand);
	const ids = commands.map((c) => c.id);
	const duplicate = ids.find((id, i) => ids.indexOf(id) !== i);
	if (duplicate) {
		throw new Error(`${DESCRIPTOR_PATH} declares two commands with id "${duplicate}"`);
	}
	const ds = d.designSystem as Record<string, unknown> | undefined;
	if (!ds || typeof ds.package !== 'string' || ds.package === '') {
		throw new Error(`${DESCRIPTOR_PATH} is missing designSystem.package`);
	}
	const folder = ds.folder === undefined ? undefined : designSystemFolder(ds.folder);

	return {
		version: 1,
		product: d.product as string,
		contextDir: d.contextDir as string,
		branchPattern: { codebase: branch.codebase },
		commands,
		designSystem: { package: ds.package, ...(folder !== undefined ? { folder } : {}) },
		...(d.share !== undefined ? { share: parseShare(d.share) } : {}),
	};
};

export const readDescriptor = (root: string): WorkspaceDescriptor => {
	const path = resolveInside(root, DESCRIPTOR_PATH);
	let text: string;
	try {
		text = readFileSync(path, 'utf8');
	} catch {
		throw new Error(`This repository has no ${DESCRIPTOR_PATH}, so Workspace does not know what it may run here.`);
	}
	return parseDescriptor(text);
};

/** The one lookup that decides whether a command may run. */
export const findCommand = (descriptor: WorkspaceDescriptor, commandId: string): WorkspaceCommand => {
	const command = descriptor.commands.find((c) => c.id === commandId);
	if (!command) {
		throw new Error(`"${commandId}" is not a command this repository declares`);
	}
	return command;
};

/** The one rule for agents and DSNR's tasks alike, so they never look for the design system in different places. */
export const designSystemCheckout = (root: string, designSystem: WorkspaceDescriptor['designSystem'] = readDescriptor(root).designSystem): string =>
	designSystem.folder !== undefined ? join(root, designSystem.folder) : join(dirname(root), basename(designSystem.package));

/**
 * The core's alone, never a page's. A repository without this file can be opened read-only, but nothing can be run in it.
 */
export interface WorkspaceDescriptor {
	/** Schema version, so an older app can refuse a newer descriptor honestly. */
	version: 1;
	product: string;
	/** Relative to the root. */
	contextDir: string;
	/** With a `<project-id>` placeholder: `feature/<project-id>`. */
	branchPattern: { codebase: string };
	/** Every command Workspace may run. Nothing else is runnable. */
	commands: WorkspaceCommand[];
	/**
	 * `folder` when the design system is in this repository (a monorepo); without it, it is a repository of its own,
	 * checked out beside this one and named as its package is.
	 */
	designSystem: { package: string; folder?: string };
	/** Absent: it cannot be shared from here. */
	share?: ShareDescriptor;
}

export interface ShareDescriptor {
	/** With `<pr>` where the pull request number goes. Must be https. */
	url: string;
	/** The workflow whose success means the preview is up. */
	workflow: string;
	/** Only `codebase` is shared (see `KINDS`). */
	kinds: WorkKind[];
}

export interface WorkspaceCommand {
	id: string;
	label: string;
	/** Already split, never a shell string. */
	argv: string[];
	/** The port it serves a preview on, which Workspace waits to answer. */
	servesPreviewOn?: number;
}
