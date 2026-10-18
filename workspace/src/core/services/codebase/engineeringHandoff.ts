import type { WorkspaceCommand } from '../projects/descriptor';

/**
 * The shared skills an agent run on a product's codebase branch carries, and the product's own commands it is
 * told to use. How the work is done is the same in every product (`skills/`); the commands come from the
 * product's workspace file, so nothing here names one product's tools.
 */

/** How any unattended run on a codebase branch starts and finishes. */
export const CODEBASE_SKILL = 'skills/codebase-work.md';
/** Handoff: the once-only, heavy pass that proves codebase work is fit for an engineer. */
export const HANDOFF_SKILL = 'skills/handoff.md';
/** What engineering receives first on checkout, and so how the app knows a handoff was written. */
export const HANDOFF_FILE = 'HANDOFF.md';

/** A product command as a command line, by its id in the workspace file, or null when the product names none. */
export const commandLine = (commands: WorkspaceCommand[], id: string, projectId: string): string | null => {
	const found = commands.find((c) => c.id === id);
	return found ? found.argv.map((a) => a.replaceAll('<project-id>', projectId)).join(' ') : null;
};
