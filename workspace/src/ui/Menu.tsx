import { type KeyboardEvent as KeyEvent, type ReactNode, Fragment, useEffect, useId, useRef, useState } from 'react';
import { Icon } from './Icon';
import { useDismiss } from './useDismiss';

/** In a choice (`checked` given, true or false) it is a radio of its section. */
export interface MenuItem {
	label: string;
	icon?: string | ReactNode;
	onSelect: () => void;
	checked?: boolean;
	disabled?: boolean;
}

export interface MenuSection {
	heading?: string;
	items: MenuItem[];
}

const ENTRIES = '[role^="menuitem"]';
const CHOSEN = '[aria-checked="true"]';

export const Menu = ({
	label,
	sections,
	icon = 'ellipsis',
	face,
	field,
	align = 'end',
	always = false,
	size = 'default',
}: {
	label: string;
	sections: MenuSection[];
	icon?: string;
	face?: ReactNode;
	/** The button says what is chosen, with a chevron, and is a control of the kit's default size rather than an icon alone. */
	field?: string;
	/** Which edge of the button the list lines up with. */
	align?: 'start' | 'end';
	always?: boolean;
	size?: 'default' | 'small';
}) => {
	const [open, setOpen] = useState(false);
	const wrap = useRef<HTMLSpanElement>(null);
	const button = useRef<HTMLButtonElement>(null);
	const list = useId();
	useDismiss(open, wrap, () => setOpen(false), button);
	useEffect(() => {
		if (open) (wrap.current?.querySelector<HTMLElement>(CHOSEN) ?? wrap.current?.querySelector<HTMLElement>(ENTRIES))?.focus();
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
	const triggerClass =
		field !== undefined
			? 'menu-field'
			: [
					'menu-button',
					...(size === 'small' ? ['menu-button-small'] : []),
					...(always || face ? ['menu-button-shown'] : []),
					...(face ? ['menu-button-face'] : []),
				].join(' ');
	const trigger =
		field !== undefined ? (
			<>
				<span className="menu-field-text">{field}</span>
				<Icon name="chevron-down" size="small" />
			</>
		) : (
			(face ?? <Icon name={icon} />)
		);
	return (
		<span
			ref={wrap}
			className={['menu', ...(open ? ['menu-open'] : []), ...(align === 'start' ? ['menu-start'] : [])].join(' ')}
			onKeyDown={onKeyDown}
		>
			<button
				ref={button}
				type="button"
				className={triggerClass}
				aria-label={label}
				title={label}
				aria-haspopup="menu"
				aria-expanded={open}
				{...(open ? { 'aria-controls': list } : {})}
				onClick={() => setOpen(!open)}
			>
				{trigger}
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
