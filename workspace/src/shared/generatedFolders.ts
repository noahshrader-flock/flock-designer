/**
 * Folders no one writes by hand: what is installed, built or generated, in any repository DSNR reads. The one list, which
 * each place that reads a library's files extends with what it leaves out of its own (git's folder, tests, stories).
 */
export const GENERATED_FOLDERS = ['node_modules', 'dist', 'build', 'out', 'coverage', 'storybook-static'] as const;

const GENERATED = new Set<string>(GENERATED_FOLDERS);

/** Whether a path (with `/`) is in one of them, at any depth. */
export const inGeneratedFolder = (path: string): boolean =>
	path
		.split('/')
		.slice(0, -1)
		.some((part) => GENERATED.has(part));
