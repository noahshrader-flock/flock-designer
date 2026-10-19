import { spawn } from 'node:child_process';
import { COMMIT_PATTERN } from '../../../shared/sha';

/**
 * Opens a just-published page in the default browser. Only a plain https address (host, path, the deploy's `?v=`), so
 * nothing a page, comment or agent says can open somewhere else; argv only, never a shell. Failing to open is not an
 * error: the link was printed.
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
