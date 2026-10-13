import { useEffect, useRef, useState } from 'react';

/**
 * Copying to the clipboard, one way: `copy` puts the text there and says `copied` for a moment, then not, so the next
 * copy can say it again; a clipboard that refuses is told to `onError`, with where the text is instead.
 */
export const useCopy = (onError: (message: string) => void, where: string) => {
	const [copied, setCopied] = useState(false);
	const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
	useEffect(() => () => clearTimeout(timer.current), []);
	const copy = async (text: string) => {
		try {
			await navigator.clipboard.writeText(text);
			setCopied(true);
			clearTimeout(timer.current);
			timer.current = setTimeout(() => setCopied(false), 1500);
		} catch {
			onError(`Could not copy to the clipboard. ${where}`);
		}
	};
	return { copied, copy };
};
