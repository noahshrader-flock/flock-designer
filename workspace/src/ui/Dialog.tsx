import { type KeyboardEvent as KeyEvent, type ReactNode, useEffect, useRef } from 'react';
import { IconButton } from './IconButton';
import { focusPanel } from './focusPanel';
import { useEscape } from './useDismiss';

// What Tab goes through inside it: fields, buttons, and links (a finding's page), but not the dialog itself (`tabindex=-1`).
const FOCUSABLE = 'input:not(:disabled), textarea:not(:disabled), select:not(:disabled), button:not(:disabled), a[href]';
const FIRST = 'input:not(:disabled), textarea:not(:disabled), select:not(:disabled), button:not(:disabled):not(.dialog-close)';

/**
 * Over a scrim that covers the page, since a webview cannot draw outside itself. `focus="panel"` focuses the dialog itself,
 * as a popover does, so no control is drawn as chosen as it opens.
 */
export const Dialog = ({
	title,
	onClose,
	focus = 'field',
	actions,
	children,
}: {
	title: string;
	onClose: () => void;
	focus?: 'field' | 'panel';
	/** In the title's row, at the end, before the close: what is done to everything the dialog lists. */
	actions?: ReactNode;
	children: ReactNode;
}) => {
	const box = useRef<HTMLDivElement>(null);
	useEscape(true, onClose);
	useEffect(() => {
		const opener = document.activeElement as HTMLElement | null;
		if (focus === 'panel') focusPanel(box.current);
		else (box.current?.querySelector<HTMLElement>(FIRST) ?? box.current?.querySelector<HTMLElement>(FOCUSABLE))?.focus();
		return () => opener?.focus?.();
		// Only as it opens: where the focus is after that is the person's.
	}, []); // eslint-disable-line react-hooks/exhaustive-deps
	const onKeyDown = (e: KeyEvent) => {
		if (e.key !== 'Tab') return;
		const inside = [...(box.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])];
		const [first, last] = [inside[0], inside.at(-1)];
		// Back from the dialog itself, where the focus can be (`focus="panel"`), is back to its last control, not out of it.
		if (e.shiftKey && (document.activeElement === first || document.activeElement === box.current)) return void (e.preventDefault(), last?.focus());
		if (!e.shiftKey && document.activeElement === last) return void (e.preventDefault(), first?.focus());
	};
	return (
		<div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
			<div ref={box} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} className="dialog" onKeyDown={onKeyDown}>
				<div className="dialog-head">
					<h2 className="dialog-title">{title}</h2>
					{actions}
					<IconButton size="small" icon="close" label="Close" onPress={onClose} className="dialog-close" />
				</div>
				<div className="dialog-body">{children}</div>
			</div>
		</div>
	);
};

/** Closing is the X in the dialog's title, so there is no Cancel or Close here. */
export const DialogButtons = ({ children }: { children?: ReactNode }) => (children ? <div className="dialog-buttons">{children}</div> : null);
