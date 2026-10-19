import type { ReactNode, Ref } from 'react';
import { IconButton } from './IconButton';
import type { Marks } from './marks';

export const ValueList = ({ label, children }: { label?: string; children: ReactNode }) => (
	<ul className="tokens" aria-label={label}>
		{children}
	</ul>
);

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

export const ValueLine = ({ children, onPress }: { children: ReactNode; onPress?: () => void }) =>
	onPress ? (
		<button type="button" className="token-line token-line-flush token-button" onClick={onPress}>
			{children}
		</button>
	) : (
		<div className="token-line token-line-flush">{children}</div>
	);

/** Its reset is always shown when it can be put back: a list of changes is what to undo them from. */
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
