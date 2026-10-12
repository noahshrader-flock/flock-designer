import { AccessibilityIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { countsOf, foundIn, summaryOf } from '../shared/accessibility';
import { plural } from '../shared/plural';
import type { AccessibilityIssue, AccessibilityResult } from '../shared/contract';
import { Button } from './ui/button';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog';
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
				plural(issue.nodes, 'element'),
				foundIn(issue).length ? `in ${foundIn(issue).join(', ')}` : null,
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
 * In a prototype's toolbar, at the right of the icon that says where it is saved (T7 of the design system plan, part B):
 * a ghost button with the accessibility icon and how many issues the automated check found, as a component's card has it.
 * Pressing it opens what the check found and what it was made with, in a modal. Its words ("3 automated issues, 2 need a
 * person") are the same everywhere and are its name for a screen reader and on hover. Never a pass: at most, no issues
 * found by automated checks, and what is left for a person is said.
 */
export const AccessibilityStatus = ({ projectId, name, opened }: { projectId: string; name: string; opened: unknown }) => {
	const check = useAccessibility(projectId, name, opened);
	const [open, setOpen] = useState(false);
	if (check === null) return null;
	if (check.state === 'checking')
		return (
			<Button variant="ghost" size="icon" disabled aria-label="Checking accessibility…" title="Checking accessibility…">
				<Spinner />
			</Button>
		);
	if (check.state === 'failed')
		return (
			<Button variant="ghost" size="icon" disabled aria-label="Accessibility not checked" title={check.error}>
				<AccessibilityIcon />
			</Button>
		);
	const { result } = check;
	const summary = summaryOf(countsOf(result));
	return (
		<>
			<Button
				variant="ghost"
				aria-label={summary}
				title={summary}
				data-accessibility={result.violations.length}
				className={result.violations.length ? 'text-warning' : undefined}
				onClick={() => setOpen(true)}
			>
				<AccessibilityIcon aria-hidden />
				{result.violations.length}
			</Button>
			<Dialog open={open} onOpenChange={setOpen}>
				<DialogContent className="sm:max-w-xl">
					<DialogHeader>
						<DialogTitle>Accessibility</DialogTitle>
						<DialogDescription>{summary}</DialogDescription>
					</DialogHeader>
					<DialogBody className="flex flex-col gap-3">
						<AccessibilityFindings result={result} />
					</DialogBody>
				</DialogContent>
			</Dialog>
		</>
	);
};
