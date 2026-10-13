import { type ReactNode, useId, useState } from 'react';
import { Icon } from './Icon';

/**
 * A titled part of a list, as VS Code's side bar sections are: a header with a chevron, the title in capitals and how
 * many it holds, open until closed. The header is a button that says whether it is open and which part it opens.
 */
export const Section = ({ title, count, children }: { title: string; count: number; children: ReactNode }) => {
	const [open, setOpen] = useState(true);
	const body = useId();
	return (
		<div className="section">
			<button type="button" className="section-header" aria-expanded={open} aria-controls={body} onClick={() => setOpen(!open)}>
				<Icon name={`chevron-${open ? 'down' : 'right'}`} />
				<span data-part="title" className="section-title">
					{title}
				</span>
				<span data-part="count" className="section-count">
					{count}
				</span>
			</button>
			<div id={body} hidden={!open}>
				{children}
			</div>
		</div>
	);
};
