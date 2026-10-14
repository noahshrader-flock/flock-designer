import { checkedWith, issueLine, notAutomatedLine } from '../../src/shared/accessibility';
import type { AccessibilityIssue, AccessibilityResult } from '../../src/shared/contract';

/** One kind of issue: what it asks, where in WCAG, on how many elements and in which states, and axe's page on it. */
const Issue = ({ issue }: { issue: AccessibilityIssue }) => (
	<li className="issue">
		<span className="issue-help">{issue.help}</span>
		<span className="issue-meta">
			{issueLine(issue)} <a href={issue.url}>{issue.rule}</a>
		</span>
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
 * What a check found, and what it was made with, as the app lists it (`AccessibilityFindings`): never a pass, and what is
 * left for a person is said. axe's pages are links, which VS Code opens in the browser.
 */
export const AccessibilityFindings = ({ result }: { result: AccessibilityResult }) => (
	<>
		<p className="quiet">{checkedWith(result)}</p>
		<Issues title="Found by axe" issues={result.violations} />
		<Issues title="For a person to judge (axe could not decide)" issues={result.incomplete} />
		{notAutomatedLine(result) && <p className="quiet">{notAutomatedLine(result)}</p>}
	</>
);
