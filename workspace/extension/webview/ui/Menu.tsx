import { type KeyboardEvent as KeyEvent, Fragment, useEffect, useId, useRef, useState } from 'react';
import { Icon } from './Icon';

/**
 * One thing a menu offers: what it says, its codicon (at its start), and what it does. In a choice (`checked` given, true or
 * false) it is a radio of its section: the chosen one has a check at its end.
 */
export interface MenuItem {
	label: string;
	icon: string;
	onSelect: () => void;
	checked?: boolean;
	/** Shown, and not pressable: what cannot be done just now (Sync, while it is syncing). */
	disabled?: boolean;
}

/** A group of what a menu offers, under a heading of its own when it has one (a choice's name: Layout). */
export interface MenuSection {
	heading?: string;
	items: MenuItem[];
}

/** What a menu's entries are, whichever kind: for the keyboard to move among. */
const ENTRIES = '[role^="menuitem"]';

/**
 * A menu in a popover, from a button of its own, drawn under it in the panel: the ellipsis by default, as VS Code's lists
 * have one, shown only on hover or focus; or another `icon` shown always (`always`, the cog of a view's options). The
 * button is the default size, the search box's, or `small` for a row, a card or a header. Its
 * sections are separated by a divider. The button says whether it is open; Escape or a press elsewhere closes it, and the
 * arrow keys move through it.
 */
export const Menu = ({
	label,
	sections,
	icon = 'ellipsis',
	always = false,
	size = 'default',
}: {
	label: string;
	sections: MenuSection[];
	icon?: string;
	always?: boolean;
	size?: 'default' | 'small';
}) => {
	const [open, setOpen] = useState(false);
	const wrap = useRef<HTMLSpanElement>(null);
	const button = useRef<HTMLButtonElement>(null);
	const list = useId();
	useEffect(() => {
		if (!open) return;
		// Escape closes it, and the keyboard goes on from the button it opened from.
		const escape = (e: KeyboardEvent) => {
			if (e.key !== 'Escape') return;
			setOpen(false);
			button.current?.focus();
		};
		const close = (e: MouseEvent) => !wrap.current?.contains(e.target as Node) && setOpen(false);
		document.addEventListener('keydown', escape);
		document.addEventListener('mousedown', close);
		wrap.current?.querySelector<HTMLElement>(ENTRIES)?.focus();
		return () => {
			document.removeEventListener('keydown', escape);
			document.removeEventListener('mousedown', close);
		};
	}, [open]);
	const onKeyDown = (e: KeyEvent<HTMLElement>) => {
		const all = [...(wrap.current?.querySelectorAll<HTMLElement>(ENTRIES) ?? [])];
		const at = all.indexOf(document.activeElement as HTMLElement);
		const to = { ArrowDown: at + 1, ArrowUp: at - 1, Home: 0, End: all.length - 1 }[e.key];
		if (to === undefined) return;
		e.preventDefault();
		all[(to + all.length) % all.length]?.focus();
	};
	const entry = (item: MenuItem) => (
		<button
			key={item.label}
			type="button"
			role={item.checked === undefined ? 'menuitem' : 'menuitemradio'}
			{...(item.checked === undefined ? {} : { 'aria-checked': item.checked })}
			className="menu-item"
			disabled={item.disabled === true}
			onClick={() => {
				setOpen(false);
				// What it opens (a dialog) gives the focus back to what had it: the button, not a menu that is gone.
				button.current?.focus();
				item.onSelect();
			}}
		>
			<Icon name={item.icon} />
			<span>{item.label}</span>
			{item.checked === true && <Icon name="check" className="menu-check" />}
		</button>
	);
	return (
		<span ref={wrap} className={open ? 'menu menu-open' : 'menu'} onKeyDown={onKeyDown}>
			<button
				ref={button}
				type="button"
				className={['menu-button', ...(size === 'small' ? ['menu-button-small'] : []), ...(always ? ['menu-button-shown'] : [])].join(' ')}
				aria-label={label}
				title={label}
				aria-haspopup="menu"
				aria-expanded={open}
				{...(open ? { 'aria-controls': list } : {})}
				onClick={() => setOpen(!open)}
			>
				<Icon name={icon} />
			</button>
			{open && (
				<div id={list} role="menu" aria-label={label} className="menu-list">
					{sections.map((section, i) => (
						<Fragment key={section.heading ?? i}>
							{i > 0 && <div role="separator" className="menu-divider" />}
							{section.heading ? (
								<div role="group" aria-label={section.heading} className="menu-group">
									<div className="menu-heading">{section.heading}</div>
									{section.items.map(entry)}
								</div>
							) : (
								section.items.map(entry)
							)}
						</Fragment>
					))}
				</div>
			)}
		</span>
	);
};
