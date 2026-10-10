import { readFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import type { ShareDescriptor, WorkspaceCommand, WorkspaceDescriptor } from '../../shared/contract';
import { resolveInside } from './paths';

/**
 * Reads what a repository says about itself.
 *
 * Nothing about Coke is compiled into this app. A repository declares its own
 * context directory, prototype root, branch naming and -- the part that matters
 * -- the complete list of commands Workspace may run in it. If it is not in the
 * descriptor, it cannot be run.
 */

export const DESCRIPTOR_PATH = '.dsnr/workspace.json';

export class DescriptorProblem extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'DescriptorProblem';
	}
}

const isStringArray = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === 'string');

const parseCommand = (raw: unknown, index: number): WorkspaceCommand => {
	const at = `commands[${index}]`;
	if (typeof raw !== 'object' || raw === null) {
		throw new DescriptorProblem(`${at} is not an object`);
	}
	const c = raw as Record<string, unknown>;
	if (typeof c.id !== 'string' || c.id === '') {
		throw new DescriptorProblem(`${at}.id is missing`);
	}
	if (typeof c.label !== 'string' || c.label === '') {
		throw new DescriptorProblem(`${at}.label is missing`);
	}
	if (!isStringArray(c.argv) || c.argv.length === 0) {
		// Already-split argv, never a shell string: there is no shell to interpret
		// quoting, pipes or substitution, so a descriptor cannot smuggle one in.
		throw new DescriptorProblem(`${at}.argv must be a non-empty array of strings`);
	}
	if (c.servesPreviewOn !== undefined && typeof c.servesPreviewOn !== 'number') {
		throw new DescriptorProblem(`${at}.servesPreviewOn must be a port number`);
	}
	return {
		id: c.id,
		label: c.label,
		argv: c.argv,
		...(typeof c.servesPreviewOn === 'number' ? { servesPreviewOn: c.servesPreviewOn } : {}),
	};
};

/** The kinds of work a descriptor may say it can share. */
const KINDS = ['prototype', 'codebase'] as const;

/**
 * Optional: a repository that cannot build a preview for a branch just leaves it out. When it is
 * there it is held to what sharing needs, because a bad address here would be recorded for every
 * reviewer: https only, and a place for the pull request number.
 */
const parseShare = (raw: unknown): ShareDescriptor | undefined => {
	if (raw === undefined) return undefined;
	const s = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
	if (typeof s.url !== 'string' || !s.url.startsWith('https://') || !s.url.includes('<pr>')) {
		throw new DescriptorProblem(`${DESCRIPTOR_PATH} share.url must be an https address containing <pr>`);
	}
	if (typeof s.workflow !== 'string' || s.workflow === '') {
		throw new DescriptorProblem(`${DESCRIPTOR_PATH} share.workflow must name the workflow that deploys a preview`);
	}
	if (!Array.isArray(s.kinds) || s.kinds.length === 0 || !s.kinds.every((k) => (KINDS as readonly unknown[]).includes(k))) {
		throw new DescriptorProblem(`${DESCRIPTOR_PATH} share.kinds must list "prototype", "codebase" or both`);
	}
	return { url: s.url, workflow: s.workflow, kinds: s.kinds as ShareDescriptor['kinds'] };
};

export const parseDescriptor = (text: string): WorkspaceDescriptor => {
	let raw: unknown;
	try {
		raw = JSON.parse(text);
	} catch (err) {
		throw new DescriptorProblem(`${DESCRIPTOR_PATH} is not valid JSON: ${(err as Error).message}`);
	}
	if (typeof raw !== 'object' || raw === null) {
		throw new DescriptorProblem(`${DESCRIPTOR_PATH} is not an object`);
	}
	const d = raw as Record<string, unknown>;

	if (d.version !== 1) {
		// Refusing a version we do not know beats reading it optimistically and
		// running something that means what a later schema said it meant.
		throw new DescriptorProblem(`${DESCRIPTOR_PATH} declares version ${String(d.version)}; this app understands 1`);
	}
	for (const key of ['product', 'contextDir', 'prototypeRoot'] as const) {
		if (typeof d[key] !== 'string' || d[key] === '') {
			throw new DescriptorProblem(`${DESCRIPTOR_PATH} is missing ${key}`);
		}
	}
	const branch = d.branchPattern as Record<string, unknown> | undefined;
	if (!branch || typeof branch.prototype !== 'string' || typeof branch.codebase !== 'string') {
		throw new DescriptorProblem(`${DESCRIPTOR_PATH} is missing branchPattern.prototype or branchPattern.codebase`);
	}
	if (!Array.isArray(d.commands)) {
		throw new DescriptorProblem(`${DESCRIPTOR_PATH} is missing commands`);
	}
	const commands = d.commands.map(parseCommand);
	const ids = commands.map((c) => c.id);
	const duplicate = ids.find((id, i) => ids.indexOf(id) !== i);
	if (duplicate) {
		throw new DescriptorProblem(`${DESCRIPTOR_PATH} declares two commands with id "${duplicate}"`);
	}
	const ds = d.designSystem as Record<string, unknown> | undefined;
	if (!ds || typeof ds.package !== 'string' || ds.package === '') {
		throw new DescriptorProblem(`${DESCRIPTOR_PATH} is missing designSystem.package`);
	}

	return {
		version: 1,
		product: d.product as string,
		contextDir: d.contextDir as string,
		prototypeRoot: d.prototypeRoot as string,
		branchPattern: { prototype: branch.prototype, codebase: branch.codebase },
		commands,
		designSystem: { package: ds.package },
		...(d.share !== undefined ? { share: parseShare(d.share) } : {}),
	};
};

export const readDescriptor = (root: string): WorkspaceDescriptor => {
	const path = resolveInside(root, DESCRIPTOR_PATH);
	let text: string;
	try {
		text = readFileSync(path, 'utf8');
	} catch {
		throw new DescriptorProblem(
			`This repository has no ${DESCRIPTOR_PATH}, so Workspace does not know what it may run here.`,
		);
	}
	return parseDescriptor(text);
};

/** The one lookup that decides whether a command may run. */
export const findCommand = (descriptor: WorkspaceDescriptor, commandId: string): WorkspaceCommand => {
	const command = descriptor.commands.find((c) => c.id === commandId);
	if (!command) {
		throw new DescriptorProblem(`"${commandId}" is not a command this repository declares`);
	}
	return command;
};

/**
 * The design system's checkout beside a product, named as its package is (`designSystem.package`): where its guidance is
 * read, by an agent and by the tasks DSNR makes alike. One rule, so they never look in different places.
 */
export const designSystemCheckout = (root: string, pkg: string = readDescriptor(root).designSystem.package): string =>
	join(dirname(root), basename(pkg));
