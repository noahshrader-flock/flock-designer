import type { WorkspaceCommand } from '../../shared/contract';

/**
 * Handoff: the once-only, heavy pass that proves codebase work is fit for an engineer. While work is being
 * built only a light check runs; this is where the product's full gate, both reviews and their fixes happen.
 * How it is done is shared (`skills/handoff.md`); the product names its own gate in its workspace file.
 */

export const HANDOFF_SKILL = 'skills/handoff.md';

/** What engineering receives first on checkout, and so how the app knows a handoff was written. */
export const HANDOFF_FILE = 'HANDOFF.md';

/** The product's gate as a command line, from its workspace file, or null when it names none. */
export const gateCommand = (commands: WorkspaceCommand[], projectId: string): string | null => {
	const gate = commands.find((c) => c.id === 'handoff');
	return gate ? gate.argv.map((a) => a.replaceAll('<project-id>', projectId)).join(' ') : null;
};

export const handoffTask = ({ skill, projectId, branch, gate }: { skill: string; projectId: string; branch: string; gate: string | null }): string =>
	[
		`Hand ${projectId} to engineering.`,
		'',
		skill.trim(),
		'',
		'## This run',
		'',
		`The work is on \`${branch}\`, and the checkout is on it. Stay on it.`,
		gate
			? `This product's gate is \`${gate}\`. Run it first, and again when your fixes are in.`
			: "This product's workspace file names no handoff gate. Say so first in your summary, then follow its guidance for what a handoff checks.",
		`Finish by saying, on its own line, either \`Ready for engineering\` or \`Not ready\`, then why.`,
	].join('\n');
