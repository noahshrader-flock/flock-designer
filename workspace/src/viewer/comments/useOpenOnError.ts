import { useEffect } from 'react';

// Errors are said in the comments panel, and a closed one would say nothing.
export const useOpenOnError = (error: string | null, open: () => void) => {
	useEffect(() => {
		if (error !== null) open();
	}, [error]); // eslint-disable-line react-hooks/exhaustive-deps
};
