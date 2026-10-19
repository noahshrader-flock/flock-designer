import { type KeyboardEvent as KeyEvent, type ReactNode, useEffect, useRef } from 'react';
import { IconButton } from './IconButton';
import { focusPanel } from './focusPanel';
import { useEscape } from './useDismiss';

// What Tab goes through inside it: fields, buttons, and links (a finding's page), but not the dialog itself (`tabindex=-1`).
const FOCUSABLE = 'input:not(:disabled), textarea:not(:disabled), select:not(:disabled), button:not(:disabled), a[href]';
/** Where the focus goes first: a field, else what the dialog does; the X it closes with is where it ends up only if there is nothing else. */
const FIRST = 'input:not(:disabled), textarea:not(:disabled), select:not(:disabled), button:not(:disabled):not(.dialog-close)';

/**
 * A dialog over the page, as VS Code's own are: a title with its close X at the far right of the same row, what it asks,
 * and its buttons below, over a scrim that dims what is behind. A page cannot draw outside itself (a side bar's webview, a
 * framed bar), so it covers the page. The X, Escape (`useEscape`, unless something opened over it since) and a press on the scrim close it; Tab stays inside it; the focus goes to its first field (or what
 * it does), and back to what opened it once it is gone. A dialog that is a few controls for one thing, as a popover is
 * (`focus="panel"`: a token's), takes the focus on the dialog itself instead, as the popover does (`focusPanel`), so no
 * control is drawn as chosen the moment it opens.
 */
export const Dialog = ({
	title,
	onClose,
	focus = 'field',
	children,
}: {
	title: string;
	onClose: () => void;
	focus?: 'field' | 'panel';
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
					<IconButton size="small" icon="close" label="Close" onPress={onClose} className="dialog-close" />
				</div>
				{children}
			</div>
		</div>
	);
};

/**
 * What a dialog does, as its buttons in a row across its width: one fills it, several share it. Closing is the X in the
 * dialog's title, so there is no Cancel or Close here; a dialog that does nothing has no row at all.
 */
export const DialogButtons = ({ children }: { children?: ReactNode }) => (children ? <div className="dialog-buttons">{children}</div> : null);
