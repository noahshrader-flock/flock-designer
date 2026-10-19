import type { ReactNode } from 'react';
import { ThumbWash } from './ThumbWash';

/** `context` is what VS Code's right-click menu for it is given. */
export const Card = ({
	picture,
	name,
	meta,
	badge,
	onOpen,
	current = false,
	context,
	actions,
}: {
	picture: ReactNode;
	name: string;
	meta?: string;
	badge?: ReactNode;
	onOpen?: () => void;
	current?: boolean;
	context?: Record<string, unknown>;
	actions?: ReactNode;
}) => {
	const parts = (
		<>
			<span className="card-media">
				{picture}
				{/* Before the badge, so the badge stays above the wash. */}
				{onOpen && <ThumbWash />}
				{badge && <span className="card-badge">{badge}</span>}
			</span>
			<span className="card-text">
				<span data-part="name" className="row-name">
					{name}
				</span>
				{meta && (
					<span data-part="meta" className="row-meta">
						{meta}
					</span>
				)}
			</span>
		</>
	);
	return (
		<li
			role="listitem"
			className="card-item"
			{...(current ? { 'data-current': '' } : {})}
			{...(context ? { 'data-vscode-context': JSON.stringify(context) } : {})}
		>
			{onOpen ? (
				<button type="button" className="card row-button" onClick={onOpen} {...(current ? { 'aria-current': true } : {})}>
					{parts}
				</button>
			) : (
				<div className="card">{parts}</div>
			)}
			{actions && <span className="item-actions">{actions}</span>}
		</li>
	);
};
