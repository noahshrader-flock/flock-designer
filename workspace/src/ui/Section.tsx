import { type ReactNode, useId } from 'react';
import { Icon } from './Icon';

/** The browser's own disclosure, so click, keyboard and its state to assistive technology come with nothing to keep in step. */
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

export const Disclosure = ({ label, children }: { label: string; children: ReactNode }) => (
	<Collapsible className="disclosure" summaryClassName="disclosure-summary" open={false} summary={label}>
		{children}
	</Collapsible>
);
