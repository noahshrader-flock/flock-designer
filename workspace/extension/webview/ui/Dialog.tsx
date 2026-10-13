import { type KeyboardEvent as KeyEvent, type ReactNode, useEffect, useRef } from 'react';

const FOCUSABLE = 'input, textarea, select, button:not(:disabled)';

/**
 * A dialog over the panel, as VS Code's own are: a title, what it asks, and its buttons below, over a scrim that dims
 * what is behind. A side bar's webview cannot draw outside itself, so it covers the panel. Escape and a press on the scrim
 * close it; Tab stays inside it; the focus goes to its first field, and back to what opened it once it is gone.
 */
export const Dialog = ({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) => {
	const box = useRef<HTMLDivElement>(null);
	useEffect(() => {
		const opener = document.activeElement as HTMLElement | null;
		box.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
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
				<h2 className="dialog-title">{title}</h2>
				{children}
			</div>
		</div>
	);
};
