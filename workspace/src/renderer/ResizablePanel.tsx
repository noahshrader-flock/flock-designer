import { type ReactNode, useEffect, useRef, useState } from 'react';
import { PANEL_STEP, type PanelWidths, clampPanelWidth, loadPanelWidth, savePanelWidth } from './panelWidth';

/**
 * A side panel at the right of a screen, with a divider to resize it: drag it, or focus it and use the arrow keys. Its
 * width is the panel's own (`PanelWidths`), remembered, and kept within the window as it is resized. One component, so
 * the review screen's comments and the Design System tab's tokens resize the same way.
 *
 * `onResizing` is told when a drag starts and ends, for a screen with something that must step aside meanwhile (the
 * review screen's native preview).
 *
 * **Not shadcn's Resizable, on purpose.** That one resizes panes in proportion and follows the pointer across both of
 * them; the review screen's preview is a native view, which never passes the pointer back to the window, so a drag that
 * crosses it is lost. This one keeps a width in pixels, grabs only over its own side, and holds the pointer while dragging.
 */
export const ResizablePanel = ({
	panel,
	label,
	onResizing,
	children,
}: {
	panel: PanelWidths;
	/** The divider's name for assistive technology: "Resize the comments sidebar". */
	label: string;
	onResizing?: (resizing: boolean) => void;
	children: ReactNode;
}) => {
	const [width, setWidth] = useState(() => loadPanelWidth(window.innerWidth, panel));
	const [resizing, setResizing] = useState(false);
	const dragging = useRef(false);

	useEffect(() => onResizing?.(resizing), [resizing]); // eslint-disable-line react-hooks/exhaustive-deps

	// A narrower window may no longer have room for the width that was set.
	useEffect(() => {
		const fit = () => setWidth((w) => clampPanelWidth(w, window.innerWidth, panel));
		window.addEventListener('resize', fit);
		return () => window.removeEventListener('resize', fit);
	}, [panel]);

	const start = (e: React.PointerEvent<HTMLElement>) => {
		e.preventDefault();
		try {
			// Keeps the drag attached to the divider if the pointer strays off it.
			e.currentTarget.setPointerCapture(e.pointerId);
		} catch {
			// Resizing still works without capture; it just follows the pointer less tightly.
		}
		dragging.current = true;
		setResizing(true);
	};
	// The panel's right edge is the window's, so its width is how far the pointer is from it.
	const move = (e: React.PointerEvent<HTMLElement>) => {
		if (dragging.current) setWidth(clampPanelWidth(window.innerWidth - e.clientX, window.innerWidth, panel));
	};
	const end = () => {
		if (!dragging.current) return;
		dragging.current = false;
		setResizing(false);
		setWidth((w) => {
			savePanelWidth(w, panel);
			return w;
		});
	};

	return (
		<>
			{/* One pixel to look at, with a wider strip to grab that extends over the panel only: what is on the other side
			    may not pass the pointer to this window (the review screen's native preview does not). */}
			<div
				role="separator"
				aria-orientation="vertical"
				aria-label={label}
				aria-valuenow={width}
				tabIndex={0}
				onPointerDown={start}
				onPointerMove={move}
				onPointerUp={end}
				onPointerCancel={end}
				onKeyDown={(e: React.KeyboardEvent) => {
					if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
					e.preventDefault();
					const next = clampPanelWidth(width + (e.key === 'ArrowLeft' ? PANEL_STEP : -PANEL_STEP), window.innerWidth, panel);
					setWidth(next);
					savePanelWidth(next, panel);
				}}
				className={`relative w-px shrink-0 touch-none outline-none transition-colors after:absolute after:inset-y-0 after:left-0 after:w-1.75 after:cursor-col-resize after:content-[''] hover:bg-primary focus-visible:bg-primary ${
					resizing ? 'bg-primary' : 'bg-border'
				}`}
			/>
			{/* Inline on purpose: the width is wherever the person dragged the divider, a runtime value. */}
			<div className="bg-card flex min-h-0 shrink-0 flex-col" style={{ width }}>
				{children}
			</div>
		</>
	);
};
