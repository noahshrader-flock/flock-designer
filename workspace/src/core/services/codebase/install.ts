import type { WorkspaceDescriptor } from '../projects/descriptor';

/**
 * Runs only the command the repository declares (`install` in its `.dsnr/workspace.json`), as with every command DSNR runs.
 */

export const INSTALL_COMMAND = 'install';

/** The repository's own install command, as a line a person can run; null when it declares none. */
export const installLine = (descriptor: Pick<WorkspaceDescriptor, 'commands'>): string | null =>
	descriptor.commands.find((c) => c.id === INSTALL_COMMAND)?.argv.join(' ') ?? null;
