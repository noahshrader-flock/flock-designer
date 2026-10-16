import { type ReactNode, useEffect, useRef } from 'react';

/** Where the focus goes first: a field, else what the popover does. */
const FIRST = 'input, textarea, select, button:not(:disabled)';

/**
 * A small panel drawn under what opened it, in the panel, for a few fields that belong to one thing (a value's sliders): the
 * way a menu is, but holding controls, and not a dialog, which is for what is large (a token) and dims the panel. It is
 * placed by its parent, which is `position: relative` and holds the button that opened it; the parent closes it
 * (`useDismiss`: Escape, a press elsewhere). The focus goes to its first field, and the panel scrolls to show it whole.
 */
export const Popover = ({ label, children }: { label: string; children: ReactNode }) => {
	const box = useRef<HTMLDivElement>(null);
	useEffect(() => {
		box.current?.querySelector<HTMLElement>(FIRST)?.focus({ preventScroll: true });
		box.current?.scrollIntoView?.({ block: 'nearest' });
	}, []);
	return (
		<div ref={box} role="dialog" aria-label={label} className="popover">
			{children}
		</div>
	);
};
