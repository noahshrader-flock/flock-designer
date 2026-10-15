import { type KeyboardEvent as KeyEvent, type ReactNode, useEffect, useRef } from 'react';
import { IconButton } from './IconButton';

const FOCUSABLE = 'input, textarea, select, button:not(:disabled)';
/** Where the focus goes first: a field, else what the dialog does; the X it closes with is where it ends up only if there is nothing else. */
const FIRST = 'input, textarea, select, button:not(:disabled):not(.dialog-close)';

/**
 * A dialog over the panel, as VS Code's own are: a title with its close X at the far right of the same row, what it asks,
 * and its buttons below, over a scrim that dims what is behind. A side bar's webview cannot draw outside itself, so it covers
 * the panel. The X, Escape and a press on the scrim close it; Tab stays inside it; the focus goes to its first field, and back
 * to what opened it once it is gone.
 */
export const Dialog = ({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) => {
	const box = useRef<HTMLDivElement>(null);
	useEffect(() => {
		const opener = document.activeElement as HTMLElement | null;
		(box.current?.querySelector<HTMLElement>(FIRST) ?? box.current?.querySelector<HTMLElement>(FOCUSABLE))?.focus();
		return () => opener?.focus?.();
	}, []);
	const onKeyDown = (e: KeyEvent) => {
		if (e.key === 'Escape') return void (e.stopPropagation(), onClose());
		if (e.key !== 'Tab') return;
		const inside = [...(box.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])];
		const [first, last] = [inside[0], inside.at(-1)];
		if (e.shiftKey && document.activeElement === first) return void (e.preventDefault(), last?.focus());
		if (!e.shiftKey && document.activeElement === last) return void (e.preventDefault(), first?.focus());
	};
	return (
		<div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
			<div ref={box} role="dialog" aria-modal="true" aria-label={title} className="dialog" onKeyDown={onKeyDown}>
				<div className="dialog-head">
					<h2 className="dialog-title">{title}</h2>
					<IconButton size="small" icon="close" label="Close" onClick={onClose} className="dialog-close" />
				</div>
				{children}
			</div>
		</div>
	);
};

/** What went wrong, said where it happened, as every dialog and panel part says it; nothing when nothing did. */
export const ErrorLine = ({ error }: { error: string | null | undefined }) =>
	error ? (
		<p role="alert" className="dialog-error">
			{error}
		</p>
	) : null;

/**
 * What a dialog does, as its buttons in a row across its width: one fills it, several share it. Closing is the X in the
 * dialog's title, so there is no Cancel or Close here; a dialog that does nothing has no row at all.
 */
export const DialogButtons = ({ children }: { children?: ReactNode }) => (children ? <div className="dialog-buttons">{children}</div> : null);
