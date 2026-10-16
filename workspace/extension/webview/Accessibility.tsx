import {
	BEST_PRACTICE_TITLE,
	checkedWith,
	countsOf,
	fixLine,
	issueLine,
	notAutomatedLine,
	summaryOf,
	unlisted,
} from '../../src/shared/accessibility';
import { plural } from '../../src/shared/plural';
import type { AccessibilityIssue, AccessibilityResult } from '../../src/shared/contract';
import { Disclosure } from './ui/Disclosure';

/**
 * One kind of issue: what it asks, where in WCAG, on how many elements and in which states, and axe's page on it; then the
 * elements it was found on, each by its selector with what axe says to change, and how many more there are.
 */
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
			<h4 className="issues-title">{title}</h4>
			<ul className="issue-list">
				{issues.map((i) => (
					<Issue key={i.rule} issue={i} />
				))}
			</ul>
		</section>
	);

/**
 * What a check found, in the order a person needs it: a line of what it found, what it was checked with
 * and what no automated check covers (never a pass: what is left is a person's), then the findings themselves, kept closed
 * until they are opened, when there are any. axe's pages are links, which VS Code opens in the browser.
 */
export const AccessibilityFindings = ({ result }: { result: AccessibilityResult }) => {
	const counts = countsOf(result);
	return (
		<>
			<p data-accessibility-summary className={counts.violations ? 'warning-text' : undefined}>
				{summaryOf(counts)}
			</p>
			<p className="quiet">{checkedWith(result)}</p>
			{notAutomatedLine(result) && <p className="quiet">{notAutomatedLine(result)}</p>}
			{(counts.violations > 0 || counts.incomplete > 0 || result.bestPractice.violations.length > 0) && (
				<Disclosure label="Show the findings">
					<Issues title="Found by axe" issues={result.violations} />
					<Issues title="For a person to judge (axe could not decide)" issues={result.incomplete} />
					<Issues title={BEST_PRACTICE_TITLE} issues={result.bestPractice.violations} />
				</Disclosure>
			)}
		</>
	);
};
