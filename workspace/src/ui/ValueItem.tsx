import type { ReactNode, Ref } from 'react';
import { IconButton } from './IconButton';

/**
 * The rows of a token or a value, the most-used pattern of the design system's pages: a list of them (`ValueList`), one row
 * (`ValueItem`), and a row saying a change, from and to, with its Reset (`ChangeRow`). Each row is a list item in the panel's
 * rhythm, its reset (when it has one) at its right, shown on hover or focus.
 */

/** Data attributes a row is found and marked by: `data-token`, `data-changed`, `data-value-cell`… */
type Marks = Record<`data-${string}`, string | boolean | undefined>;

/** A list of token or value rows. */
export const ValueList = ({ label, children }: { label?: string; children: ReactNode }) => (
	<ul className="tokens" aria-label={label}>
		{children}
	</ul>
);

/** Its reset, at the row's right: back as the library has it. */
const Reset = ({ label, onReset }: { label: string; onReset: () => void }) => (
	<span className="item-actions">
		<IconButton size="small" icon="discard" label={label} onClick={onReset} />
	</span>
);

/**
 * One token or value row: what it says (`children`), and, when it can be put back, its reset (`onReset`, said as
 * `resetLabel`). `title` is said on its hover; `marks` are what it is found by.
 */
export const ValueItem = ({
	children,
	marks,
	title,
	onReset,
	resetLabel,
	rowRef,
}: {
	children: ReactNode;
	marks?: Marks;
	title?: string;
	onReset?: () => void;
	resetLabel?: string;
	rowRef?: Ref<HTMLLIElement>;
}) => (
	<li ref={rowRef} className="token" title={title} {...marks}>
		{children}
		{onReset && <Reset label={resetLabel ?? 'Reset'} onReset={onReset} />}
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
 * while both fit, else on the line under it, flush right; anything said under it (where it is written); and its reset when
 * it can be put back.
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
	<ValueItem marks={marks} {...(onReset ? { onReset, resetLabel: `Reset ${name}` } : {})}>
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
	</ValueItem>
);
