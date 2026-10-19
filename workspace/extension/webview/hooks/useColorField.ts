import { useEffect, useRef, useState } from 'react';
import { hexAndAlpha, isHex, typedHex } from '../../../src/shared/tokens';

/** The picker commits when closed (the browser's `change`, not every color it passes), unless `live`; the opacity is kept either way. */
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
