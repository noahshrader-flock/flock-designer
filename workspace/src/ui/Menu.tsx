import { type KeyboardEvent as KeyEvent, type ReactNode, Fragment, useEffect, useId, useRef, useState } from 'react';
import { Icon } from './Icon';
import { useDismiss } from './useDismiss';

/**
 * One thing a menu offers: what it says, its icon (at its start: a codicon's name, or one drawn where the font has none), and
 * what it does. In a choice (`checked` given, true or false) it is a radio of its section: the chosen one has a check at its end.
 */
export interface MenuItem {
	label: string;
	icon: string | ReactNode;
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
 * A menu in a popover, from a button of its own, drawn under it on the page: the ellipsis by default, as VS Code's lists
 * have one, shown only on hover or focus; or another `icon` shown always (`always`, the cog of a view's options); or, in
 * place of an icon, what it is a menu of (`face`: a person's picture, for who is signed in). The
 * button is the default size, the search box's, or `small` for a row, a card or a header. Its
 * sections are separated by a divider. The button says whether it is open; Escape or a press elsewhere closes it, and the
 * arrow keys move through it.
 */
export const Menu = ({
	label,
	sections,
	icon = 'ellipsis',
	face,
	always = false,
	size = 'default',
}: {
	label: string;
	sections: MenuSection[];
	icon?: string;
	face?: ReactNode;
	always?: boolean;
	size?: 'default' | 'small';
}) => {
	const [open, setOpen] = useState(false);
	const wrap = useRef<HTMLSpanElement>(null);
	const button = useRef<HTMLButtonElement>(null);
	const list = useId();
	// Escape closes it, and the keyboard goes on from the button it opened from; so does a press elsewhere.
	useDismiss(open, wrap, () => setOpen(false), button);
	useEffect(() => {
		if (open) wrap.current?.querySelector<HTMLElement>(ENTRIES)?.focus();
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
			{typeof item.icon === 'string' ? <Icon name={item.icon} /> : item.icon}
			<span>{item.label}</span>
			{item.checked === true && <Icon name="check" className="menu-check" />}
		</button>
	);
	return (
		<span ref={wrap} className={open ? 'menu menu-open' : 'menu'} onKeyDown={onKeyDown}>
			<button
				ref={button}
				type="button"
				className={[
					'menu-button',
					...(size === 'small' ? ['menu-button-small'] : []),
					...(always || face ? ['menu-button-shown'] : []),
					...(face ? ['menu-button-face'] : []),
				].join(' ')}
				aria-label={label}
				title={label}
				aria-haspopup="menu"
				aria-expanded={open}
				{...(open ? { 'aria-controls': list } : {})}
				onClick={() => setOpen(!open)}
			>
				{face ?? <Icon name={icon} />}
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
