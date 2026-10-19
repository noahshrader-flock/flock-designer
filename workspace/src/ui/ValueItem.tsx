import type { ReactNode, Ref } from 'react';
import { IconButton } from './IconButton';
import type { Marks } from './marks';

/**
 * The rows of a token or a value, the most-used pattern of the design system's pages: a list of them (`ValueList`), one row
 * (`ValueItem`), and a row saying a change, from and to, with its Reset (`ChangeRow`). Each row is a list item in the page's
 * rhythm.
 */

export const ValueList = ({ label, children }: { label?: string; children: ReactNode }) => (
	<ul className="tokens" aria-label={label}>
		{children}
	</ul>
);

/** One token or value row: what it says (`children`). `title` is said on its hover; `marks` are what it is found by. */
export const ValueItem = ({
	children,
	marks,
	title,
	rowRef,
}: {
	children: ReactNode;
	marks?: Marks;
	title?: string;
	rowRef?: Ref<HTMLLIElement>;
}) => (
	<li ref={rowRef} className="token" title={title} {...marks}>
		{children}
	</li>
);

/**
 * A row's one line, in the Styles' own rhythm: its name at the left and its value, or its dot, flush at the right. Pressed
 * as a whole when it does one thing (`onPress`: a component's tab).
 */
export const ValueLine = ({ children, onPress }: { children: ReactNode; onPress?: () => void }) =>
	onPress ? (
		<button type="button" className="token-line token-line-flush token-button" onClick={onPress}>
			{children}
		</button>
	) : (
		<div className="token-line token-line-flush">{children}</div>
	);

/**
 * A change, from and to, as every page says one: its name (after a swatch, for a colour), then what it was and is beside it
 * while both fit, else on the line under it, flush right; anything said under it (where it is written); and, when it can be
 * put back as the library has it, its reset at its right, always shown: a list of changes is what to undo them from.
 */
export const ChangeRow = ({
	name,
	start,
	from,
	to,
	under,
	marks,
	onReset,
}: {
	name: string;
	start?: ReactNode;
	from: ReactNode;
	to: ReactNode;
	under?: ReactNode;
	marks?: Marks;
	onReset?: () => void;
}) => (
	<ValueItem marks={marks}>
		<span className="value-cell value-change">
			<span className="value-label">
				{start}
				{name}
			</span>
			<span className="value-drawn">
				<span>{from}</span> <span>→ {to}</span>
			</span>
		</span>
		{under}
		{onReset && (
			<span className="item-actions">
				<IconButton size="small" icon="discard" label={`Reset ${name}`} onPress={onReset} />
			</span>
		)}
	</ValueItem>
);
