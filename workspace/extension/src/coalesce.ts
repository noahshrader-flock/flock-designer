/** `run`, once, `ms` after the last call of a burst (a trailing debounce). */
export const coalesce = (run: () => void, ms: number): (() => void) => {
	let timer: ReturnType<typeof setTimeout> | undefined;
	return () => {
		clearTimeout(timer);
		timer = setTimeout(run, ms);
	};
};
