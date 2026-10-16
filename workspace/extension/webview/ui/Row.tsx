import type { ReactNode } from 'react';
import { ThumbWash } from './ThumbWash';

/**
 * One thing in a list, as a row of VS Code's own lists: a picture at its start (which is washed while the row that opens is
 * hovered: `ThumbWash`), a name, a quieter line under it, and whatever belongs at its end (a badge). The name and the line are
 * cut with an ellipsis when the side bar is narrow, never wrapped. With `onOpen`, the whole row is a button. `context` is what
 * VS Code's right-click menu for the row is given (its `data-vscode-context`), which its `webview/context` items are chosen by.
 */
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
	meta?: string;
	end?: ReactNode;
	onOpen?: () => void;
	/** Its tab is the one in front in the editor: marked on its picture (`aria-current`). */
	current?: boolean;
	context?: Record<string, unknown>;
	/** What more can be done with it (`Menu`), beside the row and not in the button that opens it. */
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
		<li role="listitem" className={onOpen ? 'row-item' : shape} {...(current ? { 'data-current': '' } : {})} {...(context ? { 'data-vscode-context': JSON.stringify(context) } : {})}>
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
