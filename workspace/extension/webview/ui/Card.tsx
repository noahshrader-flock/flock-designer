import type { ReactNode } from 'react';

/**
 * One thing in a grid, as a card: its picture across the top, its name and a quieter line under it, and whatever belongs
 * with them (a badge, at the corner of the picture). The same things a row (`Row`) has, in a card's shape. With `onOpen`,
 * the whole card is a button. `context` is what VS Code's right-click menu for it is given.
 */
export const Card = ({
	picture,
	name,
	meta,
	badge,
	onOpen,
	context,
}: {
	picture: ReactNode;
	name: string;
	meta?: string;
	badge?: ReactNode;
	onOpen?: () => void;
	context?: Record<string, unknown>;
}) => {
	const parts = (
		<>
			<span className="card-media">
				{picture}
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
		<li role="listitem" className="card-item" {...(context ? { 'data-vscode-context': JSON.stringify(context) } : {})}>
			{onOpen ? (
				<button type="button" className="card row-button" onClick={onOpen}>
					{parts}
				</button>
			) : (
				<div className="card">{parts}</div>
			)}
		</li>
	);
};
