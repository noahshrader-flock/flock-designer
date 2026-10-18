import { spawn } from 'node:child_process';
import { COMMIT_PATTERN } from '../../../shared/sha';

/**
 * Opens an address in the person's default browser, from a command that has just published a page.
 *
 * Only an https address of the plain kind a published page has (host, path, and the deploy's `?v=`): anything else is
 * not opened, so nothing a page, a comment or an agent says can make this open some other place. Argv only, never a
 * shell. Not being able to open one is not an error: the link was printed.
 */

const PLAIN = new RegExp(`^https://[A-Za-z0-9.-]+(?::\\d+)?(?:/[A-Za-z0-9._~/-]*)?(?:\\?v=${COMMIT_PATTERN})?$`);

/** The program and arguments that open `url` on this platform, or null when it is not an address to open. */
export const browserCommand = (url: string, platform: NodeJS.Platform = process.platform): { file: string; args: string[] } | null => {
	if (!PLAIN.test(url)) return null;
	if (platform === 'darwin') return { file: 'open', args: [url] };
	// `start` is a command of the shell, and its first quoted argument is a window title: hence the empty one.
	if (platform === 'win32') return { file: 'cmd', args: ['/c', 'start', '""', url] };
	return { file: 'xdg-open', args: [url] };
};

export const openInBrowser = (url: string): void => {
	const command = browserCommand(url);
	if (command === null) return;
	const child = spawn(command.file, command.args, { stdio: 'ignore', detached: true, shell: false });
	child.on('error', () => undefined);
	child.unref();
};
