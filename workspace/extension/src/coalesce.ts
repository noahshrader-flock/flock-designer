/**
 * `run`, once, `ms` after the last of a burst of asks: what happens several times in a moment (a save, a review opened, a
 * comment written) reads the projects from GitHub once, not once each.
 */
export const coalesce = (run: () => void, ms: number): (() => void) => {
	let timer: ReturnType<typeof setTimeout> | undefined;
	return () => {
		clearTimeout(timer);
		timer = setTimeout(run, ms);
	};
};
