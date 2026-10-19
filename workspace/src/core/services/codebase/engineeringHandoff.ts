import { basename } from 'node:path';
import { DESCRIPTOR_PATH, type WorkspaceCommand } from '../projects/descriptor';

export const HANDOFF_SKILL = 'skills/handoff.md';
/** Its presence is how DSNR knows a handoff was written. */
export const HANDOFF_FILE = 'HANDOFF.md';

/** A product command as a command line, by its id in the workspace file, or null when the product names none. */
export const commandLine = (commands: WorkspaceCommand[], id: string, projectId: string): string | null => {
	const found = commands.find((c) => c.id === id);
	return found ? found.argv.map((a) => a.replaceAll('<project-id>', projectId)).join(' ') : null;
};

const LOCKFILES = new Set(['package-lock.json', 'npm-shrinkwrap.json', 'yarn.lock', 'pnpm-lock.yaml', 'bun.lockb']);

/** What a handoff's work never changes: the repository's automation, its locked packages, and DSNR's setup in it. */
export const leftAlone = (path: string): boolean => path.startsWith('.github/') || LOCKFILES.has(basename(path)) || path === DESCRIPTOR_PATH;

export const handoffPrompt = ({ projectId, branch, taskFile }: { projectId: string; branch: string; taskFile: string }): string =>
	[
		`Hand ${projectId} to engineering, on ${branch}.`,
		`Your task is in ${taskFile}. It is complete: read all of it, then do what it says, in order.`,
	].join(' ');
