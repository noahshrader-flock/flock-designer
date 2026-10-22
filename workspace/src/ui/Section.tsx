import { type ReactNode, useId } from 'react';
import { Icon } from './Icon';
import { Waiting } from './Spinner';
import type { Marks } from './marks';

/** The browser's own disclosure, so click, keyboard and its state to assistive technology come with nothing to keep in step. */
const Collapsible = ({
	className,
	summaryClassName,
	open,
	summary,
	chevronEnd = false,
	waiting = false,
	marks,
	children,
}: {
	className: string;
	summaryClassName: string;
	open: boolean;
	summary: ReactNode;
	/** The chevron after the words, in place of before them. */
	chevronEnd?: boolean;
	/** Something it says is being worked out: a spinner before the words, as a Message's. */
	waiting?: boolean;
	/** On the row that is pressed. */
	marks?: Marks;
	children: ReactNode;
}) => {
	const body = useId();
	const chevron = <Icon name="chevron-right" className="collapse-chevron" />;
	return (
		<details className={className} open={open}>
			<summary className={summaryClassName} aria-controls={body} {...marks}>
				{!chevronEnd && chevron}
				{waiting ? <Waiting>{summary}</Waiting> : summary}
				{chevronEnd && chevron}
			</summary>
			<div id={body}>{children}</div>
		</details>
	);
};

/** `open` is how it starts: the person's own opening and closing is kept until it is given another. */
export const Section = ({ title, count, open = true, children }: { title: string; count?: number; open?: boolean; children: ReactNode }) => (
	<Collapsible
		className="section"
		summaryClassName="section-header"
		open={open}
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

/** A long list under one line that says what it is and how many: closed until pressed, then scrolling in its own height. */
export const ListDisclosure = ({ label, waiting, marks, children }: { label: string; waiting?: boolean; marks?: Marks; children: ReactNode }) => (
	<Collapsible
		className="list-disclosure"
		summaryClassName="disclosure-summary"
		open={false}
		summary={label}
		chevronEnd
		waiting={waiting}
		marks={marks}
	>
		{children}
	</Collapsible>
);
