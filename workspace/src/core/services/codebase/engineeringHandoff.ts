import type { WorkspaceCommand } from '../projects/descriptor';

export const HANDOFF_SKILL = 'skills/handoff.md';
/** Its presence is how DSNR knows a handoff was written. */
export const HANDOFF_FILE = 'HANDOFF.md';

/** A product command as a command line, by its id in the workspace file, or null when the product names none. */
export const commandLine = (commands: WorkspaceCommand[], id: string, projectId: string): string | null => {
	const found = commands.find((c) => c.id === id);
	return found ? found.argv.map((a) => a.replaceAll('<project-id>', projectId)).join(' ') : null;
};
