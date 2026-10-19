import { type ReactNode, useEffect, useRef, useState } from 'react';
import { PANEL_MIN, PANEL_STEP, type PanelWidths, clampPanelWidth, loadPanelWidth, panelMax, savePanelWidth } from './panelWidth';

/**
 * A side panel at the right of a screen, resized by dragging its divider or with the arrow keys; its width is remembered
 * and kept within the window. It holds the pointer while dragging: the prototype's frame beside it never passes the
 * pointer back, so a drag that crossed it would be lost.
 */
export const ResizablePanel = ({
	panel,
	label,
	children,
}: {
	panel: PanelWidths;
	/** The divider's name for assistive technology: "Resize the comments sidebar". */
	label: string;
	children: ReactNode;
}) => {
	const [width, setWidth] = useState(() => loadPanelWidth(window.innerWidth, panel));
	const [resizing, setResizing] = useState(false);
	const dragging = useRef(false);

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
			    may not pass the pointer to this window (a framed page does not). */}
			<div
				role="separator"
				aria-orientation="vertical"
				aria-label={label}
				aria-valuenow={width}
				aria-valuemin={PANEL_MIN}
				aria-valuemax={panelMax(window.innerWidth, panel)}
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
				className="panel-divider"
				{...(resizing ? { 'data-resizing': '' } : {})}
			/>
			{/* Inline on purpose: the width is wherever the person dragged the divider, a runtime value. */}
			<div className="side-panel" style={{ width }}>
				{children}
			</div>
		</>
	);
};
