import { type ReactNode, useEffect, useRef } from 'react';
import { focusPanel } from './focusPanel';

/**
 * A small panel under what opened it, for a few fields of one thing (a value's sliders); a dialog is for what is large. Its
 * parent places it (`position: relative`, holding the button) and closes it (`useDismiss`). It focuses itself
 * (`focusPanel`) and scrolls to show itself whole.
 */
export const Popover = ({ label, children }: { label: string; children: ReactNode }) => {
	const box = useRef<HTMLDivElement>(null);
	useEffect(() => {
		focusPanel(box.current);
		box.current?.scrollIntoView?.({ block: 'nearest' });
	}, []);
	return (
		<div ref={box} role="dialog" aria-label={label} tabIndex={-1} className="popover">
			{children}
		</div>
	);
};
