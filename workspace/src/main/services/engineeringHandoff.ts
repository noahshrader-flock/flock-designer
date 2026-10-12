import type { WorkspaceCommand } from '../../shared/contract';
import { NOT_READY_LINE, READY_LINE } from '../../shared/handoff';

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

export const lightCheckLine = (lightCheck: string | null): string =>
	lightCheck
		? `This product's light check is \`${lightCheck}\`.`
		: "This product's workspace file names no light check (`check-iteration`): run its type check, lint and the tests for what you changed.";

/** What goes before the task of any run on a codebase branch: the shared rules for it, and this product's light check. */
export const codebaseWorkPreamble = (skill: string, lightCheck: string | null): string =>
	[skill.trim(), '', lightCheckLine(lightCheck), '', '---', ''].join('\n');

export const handoffTask = ({
	skill,
	projectId,
	branch,
	gate,
	lightCheck,
}: { skill: string; projectId: string; branch: string; gate: string | null; lightCheck: string | null }): string =>
	[
		`Hand ${projectId} to engineering.`,
		'',
		skill.trim(),
		'',
		'## This run',
		'',
		`The work is on \`${branch}\`, and the checkout is on it. Stay on it.`,
		gate
			? `This product's gate is \`${gate}\`. Run it first, and last, once HANDOFF.md is committed.`
			: "This product's workspace file names no handoff gate. Say so first in your summary, then follow its guidance for what a handoff checks.",
		lightCheckLine(lightCheck),
		`Finish by saying, on its own line, either \`${READY_LINE}\` or \`${NOT_READY_LINE}\`, then why.`,
	].join('\n');
