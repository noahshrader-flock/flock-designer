import {
	BEST_PRACTICE_TITLE,
	TO_FIX_TITLE,
	checkedWith,
	countsOf,
	fixLine,
	issueLine,
	notAutomatedLine,
	summaryOf,
	unlisted,
} from '../../src/shared/accessibility';
import { useState } from 'react';
import { plural } from '../../src/shared/plural';
import type { AccessibilityIssue, AccessibilityResult } from '../../src/shared/contract';
import { Dialog } from '../../src/ui/Dialog';
import { LinkButton } from '../../src/ui/LinkButton';
import { Message } from '../../src/ui/Message';
import { Heading } from '../../src/ui/Heading';

const Issue = ({ issue }: { issue: AccessibilityIssue }) => (
	<li className="issue">
		<span className="issue-help">{issue.help}</span>
		<span className="issue-meta">
			{issueLine(issue)} <a href={issue.url}>{issue.rule}</a>
		</span>
		{issue.elements.length > 0 && (
			<ul className="issue-elements" data-issue-elements={issue.rule}>
				{issue.elements.map((e, i) => (
					<li key={`${e.state}:${e.target}:${i}`} className="issue-meta">
						<code>{e.target}</code>
						{e.state !== 'default' && ` in ${e.state}`}
						{fixLine(e) && `: ${fixLine(e)}`}
					</li>
				))}
				{unlisted(issue) > 0 && <li className="issue-meta">and {plural(unlisted(issue), 'more element')}</li>}
			</ul>
		)}
	</li>
);

const Issues = ({ title, issues }: { title: string; issues: AccessibilityIssue[] }) =>
	issues.length === 0 ? null : (
		<section className="issues" aria-label={title}>
			<Heading size="group">{title}</Heading>
			<ul className="issue-list">
				{issues.map((i) => (
					<Issue key={i.rule} issue={i} />
				))}
			</ul>
		</section>
	);

/** Never reads as a pass: what is left to check by hand is always said beside what was found. */
export const AccessibilityFindings = ({ result }: { result: AccessibilityResult }) => {
	const counts = countsOf(result);
	const [open, setOpen] = useState(false);
	return (
		<>
			<p data-accessibility-summary className={counts.violations ? 'warning-text' : undefined}>
				{summaryOf(counts)}
			</p>
			<Message>{checkedWith(result)}</Message>
			{notAutomatedLine(result) && <Message>{notAutomatedLine(result)}</Message>}
			{(counts.violations > 0 || result.bestPractice.violations.length > 0) && (
				<LinkButton onPress={() => setOpen(true)}>Show the findings</LinkButton>
			)}
			{open && (
				<Dialog title="Accessibility findings" onClose={() => setOpen(false)}>
					<Issues title={TO_FIX_TITLE} issues={result.violations} />
					<Issues title={BEST_PRACTICE_TITLE} issues={result.bestPractice.violations} />
				</Dialog>
			)}
		</>
	);
};
