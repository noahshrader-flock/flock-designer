import { foundIn } from '../../src/shared/accessibility';
import type { AccessibilityIssue, AccessibilityResult } from '../../src/shared/contract';
import { plural } from '../../src/shared/plural';

/** One kind of issue: what it asks, where in WCAG, on how many elements and in which states, and axe's page on it. */
const Issue = ({ issue }: { issue: AccessibilityIssue }) => (
	<li className="issue">
		<span className="issue-help">{issue.help}</span>
		<span className="issue-meta">
			{[
				issue.criteria.length ? `WCAG ${issue.criteria.join(', ')}` : null,
				issue.impact,
				plural(issue.nodes, 'element'),
				foundIn(issue).length ? `in ${foundIn(issue).join(', ')}` : null,
			]
				.filter(Boolean)
				.join(' · ')}{' '}
			<a href={issue.url}>{issue.rule}</a>
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
		<p className="quiet">
			Checked with axe-core {result.ran.axe} at {result.ran.target}
			{result.ran.states.length > 1 ? `, in ${result.ran.states.join(', ')}` : ''}. Automated checks find about half of the problems WCAG covers: this
			is not a pass, and the manual checklist is a person&rsquo;s.
		</p>
		<Issues title="Found by axe" issues={result.violations} />
		<Issues title="For a person to judge (axe could not decide)" issues={result.incomplete} />
		{result.notAutomated.length > 0 && (
			<p className="quiet">No automated check covers {result.notAutomated.join(' or ')}: those criteria are a person&rsquo;s to check.</p>
		)}
	</>
);
