import { useEffect } from 'react';

/** Something gone wrong is said in the comments panel, so it opens to say it: a closed one would say nothing. */
export const useOpenOnError = (error: string | null, open: () => void) => {
	useEffect(() => {
		if (error !== null) open();
	}, [error]); // eslint-disable-line react-hooks/exhaustive-deps
};
