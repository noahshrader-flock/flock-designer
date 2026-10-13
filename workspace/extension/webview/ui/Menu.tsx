import { type KeyboardEvent as KeyEvent, useEffect, useId, useRef, useState } from 'react';
import { Icon } from './Icon';

/** One thing a menu offers: what it says, its codicon, and what it does. */
export interface MenuItem {
	label: string;
	icon: string;
	onSelect: () => void;
}

/**
 * A menu in a popover, from a button of its own (the ellipsis, as VS Code's lists have one), drawn under it in the
 * panel. The button says whether it is open; Escape or a press elsewhere closes it, and the arrow keys move through it.
 */
export const Menu = ({ label, items }: { label: string; items: MenuItem[] }) => {
	const [open, setOpen] = useState(false);
	const wrap = useRef<HTMLSpanElement>(null);
	const list = useId();
	useEffect(() => {
		if (!open) return;
		const escape = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
		const close = (e: MouseEvent) => !wrap.current?.contains(e.target as Node) && setOpen(false);
		document.addEventListener('keydown', escape);
		document.addEventListener('mousedown', close);
		wrap.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
		return () => {
			document.removeEventListener('keydown', escape);
			document.removeEventListener('mousedown', close);
		};
	}, [open]);
	const onKeyDown = (e: KeyEvent<HTMLElement>) => {
		const all = [...(wrap.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
		const at = all.indexOf(document.activeElement as HTMLElement);
		const to = { ArrowDown: at + 1, ArrowUp: at - 1, Home: 0, End: all.length - 1 }[e.key];
		if (to === undefined) return;
		e.preventDefault();
		all[(to + all.length) % all.length]?.focus();
	};
	return (
		<span ref={wrap} className={open ? 'menu menu-open' : 'menu'} onKeyDown={onKeyDown}>
			<button
				type="button"
				className="menu-button"
				aria-label={label}
				aria-haspopup="menu"
				aria-expanded={open}
				aria-controls={list}
				onClick={() => setOpen(!open)}
			>
				<Icon name="ellipsis" />
			</button>
			{open && (
				<div id={list} role="menu" aria-label={label} className="menu-list">
					{items.map((item) => (
						<button
							key={item.label}
							type="button"
							role="menuitem"
							className="menu-item"
							onClick={() => {
								setOpen(false);
								item.onSelect();
							}}
						>
							<Icon name={item.icon} />
							<span>{item.label}</span>
						</button>
					))}
				</div>
			)}
		</span>
	);
};
