import { useEffect, useRef } from 'react';

/**
 * A page saved while this one is open is shown by reloading it (`saved` counts the saves): at once when nothing is being
 * written, and when the person has finished with the comment box when something is, so a draft is never lost to it.
 */
export const useReloadOnSaved = (saved: number, writing: boolean, reload: () => void = () => window.location.reload()): void => {
	const shown = useRef(saved);
	useEffect(() => {
		if (saved === shown.current || writing) return;
		shown.current = saved;
		reload();
	}, [saved, writing, reload]);
};
