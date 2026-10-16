import { useEffect, useRef, useState } from 'react';
import { hexAndAlpha, isHex, typedHex } from '../shared/tokens';

/**
 * A color's own value as its control edits it, in the app and in VS Code: a picker, committed when it is closed (the
 * browser's own `change`, not every color it passes through), and a hex field, committed when it is left or Enter is
 * pressed, or put back when what is typed is not a color. The opacity written after the value is kept either way. With
 * `live`, the picker also commits every color it passes through, for a value tried without a build.
 */
export const useColorField = (value: string, onCommit: (hex: string) => void, { live = false }: { live?: boolean } = {}) => {
	const { hex: own, alpha } = hexAndAlpha(value);
	const [hex, setHex] = useState(own);
	const picker = useRef<HTMLInputElement>(null);
	useEffect(() => setHex(own), [own]);
	useEffect(() => {
		const el = picker.current;
		const done = () => {
			const picked = el && typedHex(el.value, alpha);
			if (picked) onCommit(picked);
		};
		el?.addEventListener('change', done);
		return () => el?.removeEventListener('change', done);
	}, [onCommit, alpha]);
	const commit = () => {
		const typed = typedHex(hex, alpha);
		if (typed) onCommit(typed);
		else setHex(own);
	};
	return {
		/** The picker's own props. */
		picker: {
			ref: picker,
			value: (isHex(hex) ? hex : own).toLowerCase(),
			onChange: (e: { target: { value: string } }) => {
				setHex(e.target.value.toUpperCase());
				const picked = live && typedHex(e.target.value, alpha);
				if (picked) onCommit(picked);
			},
		},
		hex,
		setHex,
		commit,
	};
};
