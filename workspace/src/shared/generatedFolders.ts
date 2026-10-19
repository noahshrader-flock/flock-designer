/** Each place that reads a library's files adds what it leaves out of its own (git's folder, tests, stories). */
export const GENERATED_FOLDERS = ['node_modules', 'dist', 'build', 'out', 'coverage', 'storybook-static'] as const;

const GENERATED = new Set<string>(GENERATED_FOLDERS);

/** `path` uses `/`; its own name is not tested, only its folders. */
export const inGeneratedFolder = (path: string): boolean =>
	path
		.split('/')
		.slice(0, -1)
		.some((part) => GENERATED.has(part));
