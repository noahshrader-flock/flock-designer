import { type ReactNode, useId } from 'react';
import { Icon } from './Icon';

/**
 * What opens and closes, the one way: the browser's own disclosure (a `details` and its `summary`), so it opens and closes
 * by click and by keyboard and says its state to assistive technology, with nothing to keep in step; its chevron turns as it
 * opens. Its summary names the part it opens (`aria-controls`).
 */
const Collapsible = ({
	className,
	summaryClassName,
	open,
	summary,
	children,
}: {
	className: string;
	summaryClassName: string;
	open: boolean;
	summary: ReactNode;
	children: ReactNode;
}) => {
	const body = useId();
	return (
		<details className={className} open={open}>
			<summary className={summaryClassName} aria-controls={body}>
				<Icon name="chevron-right" className="collapse-chevron" />
				{summary}
			</summary>
			<div id={body}>{children}</div>
		</details>
	);
};

/**
 * A titled part of a list, as VS Code's side bar sections are: a header with a chevron, the title in capitals and, when it is
 * a count of things, how many it holds; open until closed.
 */
export const Section = ({ title, count, children }: { title: string; count?: number; children: ReactNode }) => (
	<Collapsible
		className="section"
		summaryClassName="section-header"
		open
		summary={
			<>
				<span data-part="title" className="section-title">
					{title}
				</span>
				{count !== undefined && (
					<span data-part="count" className="section-count">
						{count}
					</span>
				)}
			</>
		}
	>
		{children}
	</Collapsible>
);

/** More of something, closed until it is asked for (`label`: Show 3 more); what it holds is read in place, never a page of its own. */
export const Disclosure = ({ label, children }: { label: string; children: ReactNode }) => (
	<Collapsible className="disclosure" summaryClassName="disclosure-summary" open={false} summary={label}>
		{children}
	</Collapsible>
);
