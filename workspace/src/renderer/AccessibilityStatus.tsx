import { AccessibilityIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { countsOf, summaryOf } from '../shared/accessibility';
import type { AccessibilityIssue, AccessibilityResult } from '../shared/contract';
import { Button } from './ui/button';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { Spinner } from './ui/spinner';

type Check = { state: 'checking' } | { state: 'ready'; result: AccessibilityResult } | { state: 'failed'; error: string };

/**
 * A prototype's accessibility check, each time its page is opened (`opened` is that opening): kept by the app, so asking
 * again for the same page is answered at once, and a changed page is checked again.
 */
const useAccessibility = (projectId: string, name: string, opened: unknown): Check | null => {
	const [check, setCheck] = useState<Check | null>(null);
	useEffect(() => {
		if (opened === null) return;
		let live = true;
		setCheck({ state: 'checking' });
		void window.workspace.checkAccessibility(projectId, name).then((r) => {
			if (live) setCheck(r.ok ? { state: 'ready', result: r.value } : { state: 'failed', error: r.error });
		});
		return () => {
			live = false;
		};
	}, [projectId, name, opened]);
	return check;
};

/** One kind of issue: what it asks, where in WCAG, on how many elements and in which states, and axe's page on it. */
const Issue = ({ issue }: { issue: AccessibilityIssue }) => (
	<li className="flex flex-col gap-0.5 py-2">
		<span className="text-sm font-medium">{issue.help}</span>
		<span className="text-muted-foreground text-xs">
			{[
				issue.criteria.length ? `WCAG ${issue.criteria.join(', ')}` : null,
				issue.impact,
				`${issue.nodes} element${issue.nodes === 1 ? '' : 's'}`,
				issue.states.length > 1 || issue.states[0] !== 'default' ? `in ${issue.states.join(', ')}` : null,
			]
				.filter(Boolean)
				.join(' · ')}{' '}
			<a className="text-primary underline underline-offset-4" href={issue.url} target="_blank" rel="noreferrer">
				{issue.rule}
			</a>
		</span>
	</li>
);

const Issues = ({ title, issues }: { title: string; issues: AccessibilityIssue[] }) =>
	issues.length === 0 ? null : (
		<section className="flex flex-col">
			<h4 className="text-sm font-semibold">{title}</h4>
			<ul className="divide-y">
				{issues.map((i) => (
					<Issue key={i.rule} issue={i} />
				))}
			</ul>
		</section>
	);

/**
 * What a check found, and what it was made with, the same wherever it is listed: a prototype's toolbar, a component's
 * panel. Never a pass, and what is left for a person is said.
 */
export const AccessibilityFindings = ({ result }: { result: AccessibilityResult }) => (
	<>
		<p className="text-muted-foreground text-xs">
			Checked with axe-core {result.ran.axe} at {result.ran.target}
			{result.ran.states.length > 1 ? `, in ${result.ran.states.join(', ')}` : ''}. Automated checks find about half of the problems WCAG covers: this is not a
			pass, and the manual checklist is a person&rsquo;s.
		</p>
		<Issues title="Found by axe" issues={result.violations} />
		<Issues title="For a person to judge (axe could not decide)" issues={result.incomplete} />
		{result.notAutomated.length > 0 && (
			<p className="text-muted-foreground text-xs">
				No automated check covers {result.notAutomated.join(' or ')}: those criteria are a person&rsquo;s to check.
			</p>
		)}
	</>
);

/**
 * In a prototype's toolbar (T7 of the design system plan, part B): what the automated check found, in the same words
 * everywhere ("3 automated issues, 2 need a person"), and what it was made with. Never a pass: at most, no issues found
 * by automated checks, and what is left for a person is said.
 */
export const AccessibilityStatus = ({ projectId, name, opened }: { projectId: string; name: string; opened: unknown }) => {
	const check = useAccessibility(projectId, name, opened);
	if (check === null) return null;
	if (check.state === 'checking')
		return (
			<Button variant="ghost" disabled>
				<Spinner />
				Checking accessibility…
			</Button>
		);
	if (check.state === 'failed')
		return (
			<Button variant="ghost" disabled title={check.error}>
				<AccessibilityIcon />
				Accessibility not checked
			</Button>
		);
	const { result } = check;
	return (
		<Popover>
			<PopoverTrigger asChild>
				<Button variant="ghost" data-accessibility={result.violations.length} className={result.violations.length ? 'text-warning' : undefined}>
					<AccessibilityIcon />
					{summaryOf(countsOf(result))}
				</Button>
			</PopoverTrigger>
			<PopoverContent align="end" className="flex max-h-[min(70vh,560px)] w-[420px] flex-col gap-3 overflow-y-auto">
				<AccessibilityFindings result={result} />
			</PopoverContent>
		</Popover>
	);
};
