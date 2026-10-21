import type { ReactNode } from 'react';
import { ThumbWash } from './ThumbWash';

/** `context` is its `data-vscode-context`, which VS Code's `webview/context` items are chosen by. */
export const Row = ({
	start,
	name,
	meta,
	end,
	onOpen,
	current = false,
	context,
	actions,
}: {
	start?: ReactNode;
	name: string;
	meta?: ReactNode;
	end?: ReactNode;
	onOpen?: () => void;
	current?: boolean;
	context?: Record<string, unknown>;
	actions?: ReactNode;
}) => {
	const parts = (
		<>
			{/* The picture and its wash are one box, so the wash is the picture's size and not the row's. */}
			{start && (
				<span className="thumb">
					{start}
					{onOpen && <ThumbWash />}
				</span>
			)}
			<span className="row-text">
				<span data-part="name" className="row-name">
					{name}
				</span>
				{meta && (
					<span data-part="meta" className="row-meta">
						{meta}
					</span>
				)}
			</span>
			{end}
		</>
	);
	const shape = meta || start ? 'row row-two-lines' : 'row';
	return (
		<li
			role="listitem"
			className={onOpen ? 'row-item' : shape}
			{...(current ? { 'data-current': '' } : {})}
			{...(context ? { 'data-vscode-context': JSON.stringify(context) } : {})}
		>
			{onOpen ? (
				<button type="button" className={`${shape} row-button`} onClick={onOpen} {...(current ? { 'aria-current': true } : {})}>
					{parts}
				</button>
			) : (
				parts
			)}
			{actions && <span className="item-actions">{actions}</span>}
		</li>
	);
};
