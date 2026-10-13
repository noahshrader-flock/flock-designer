import {
	CodeIcon,
	FileTextIcon,
	FolderIcon,
	GitBranchIcon,
	CopyIcon,
	ExternalLinkIcon,
	MessageSquareShareIcon,
	Share2Icon,
	SquareTerminalIcon,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import type { Checkout, Project, ProjectIteration, ShareStatus } from '../shared/contract';
import { recordLabel } from '../shared/brief';
import { projectCodeLink } from '../shared/work';
import { CancelButton } from './CancelButton';
import { dialogView, isMine, stepText } from './shareView';
import { Alert, AlertDescription } from './ui/alert';
import { Button } from './ui/button';
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';
import { DropdownMenuItem, DropdownMenuSeparator } from './ui/dropdown-menu';
import { Spinner } from './ui/spinner';
import { CHANGE_REQUEST } from '../shared/vocabulary';
import { ErrorAlert } from './ErrorAlert';
import { MenuLink, OutLink } from './Links';
import { RetryButton } from './Notice';
import { MoreMenu } from './MoreMenu';
import { useCopy } from './useCopy';

/**
 * What can be done with this page beyond reviewing it, behind one menu: move a prototype into the code,
 * share codebase work, open it in VS Code or continue the agent's conversation, open it in the browser, copy its link.
 *
 * Sharing is for people who are not on this machine: one click, then a dialog that says what is about
 * to happen, watches it, and ends with the address. Only someone with the product repository (an
 * author) is offered it. It is a push and a pull request, so it says so before doing either, and the
 * dialog stays honest about the wait: a build takes minutes. Closing the dialog does not stop it; the
 * menu button shows it is still going.
 */
export const ShareControl = ({
	checkout,
	project,
	iteration,
	canOpen,
	onOpenInBrowser,
	prototype = false,
	onBuildInCodebase,
	editor,
	onViewRecord,
	onAssignFolder,
}: {
	checkout: Checkout | null;
	project: Project;
	iteration: ProjectIteration;
	/** Whether the page is up, so there is something to open. */
	canOpen: boolean;
	onOpenInBrowser: () => void;
	/** A prototype: already where reviewers see it, so there is no sharing, only building it in the codebase. */
	prototype?: boolean;
	/** Offered when there is a product repository here to build it in. */
	onBuildInCodebase?: () => void;
	/** Codebase work, handed to the person's editor: the checkout, and the agent's conversation when there is one. */
	editor?: { editor: boolean; session: boolean; openInEditor: () => unknown; continueInClaude: () => unknown };
	/** Opens one of the project's documents (`project.records`), which are the last group in the menu. */
	onViewRecord?: (name: string) => void;
	/** Opens Assign folder, for a project with a brief, which is where its folder is kept: the menu's last item. */
	onAssignFolder?: () => void;
}) => {
	const [status, setStatus] = useState<ShareStatus>({ state: 'idle' });
	const [open, setOpen] = useState(false);
	const [phase, setPhase] = useState<'confirm' | 'working'>('confirm');
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		void window.workspace.shareStatus().then((r) => r.ok && setStatus(r.value));
		return window.workspace.onShareStatus(setStatus);
	}, []);

	const mine = isMine(status, project.id, iteration.name);
	const running = mine && status.state === 'running';
	const url = mine && status.state === 'ready' ? status.url : iteration.previewUrl;
	const view = dialogView(phase, status, mine);
	// The menu's two groups: what you do to the work, then where you look at it.
	const canMove = prototype && onBuildInCodebase;
	const canShare = checkout && !prototype;
	// Where the project's codebase work is on GitHub, and its documents: always there, whether or not the page is up.
	const builtInCode = projectCodeLink(project);
	const records = onViewRecord !== undefined ? project.records : [];
	const folderable = onAssignFolder !== undefined && project.records.includes('brief.md');
	const documents = builtInCode !== null || records.length > 0;

	const start = async () => {
		if (!checkout) return;
		setError(null);
		const r = await window.workspace.shareIteration(checkout.root, project.id, iteration.name);
		if (!r.ok) return setError(r.error);
		setStatus(r.value);
		setPhase('working');
	};

	const { copied, copy: copyText } = useCopy(setError, 'The address is shown in the dialog.');
	const copy = async () => {
		if (url) await copyText(url);
	};

	return (
		<>
			<MoreMenu busy={running} disabled={!canOpen && !documents}>
				{/* What can be done with the work needs its page up; the documents do not. */}
				{canOpen && (
					<>
						{canMove && (
							<DropdownMenuItem onSelect={onBuildInCodebase}>
								<CodeIcon />
								Build
							</DropdownMenuItem>
						)}
						{canShare && (
							<DropdownMenuItem
								onSelect={() => {
									setPhase(running ? 'working' : 'confirm');
									setError(null);
									setOpen(true);
								}}
							>
								<Share2Icon />
								{running ? 'Sharing…' : url ? 'Update shared preview' : 'Share for review'}
							</DropdownMenuItem>
						)}
						{/* No line when the first group is empty. */}
						{(canMove || canShare) && <DropdownMenuSeparator />}
						{editor && (
							<DropdownMenuItem onSelect={editor.openInEditor}>
								<SquareTerminalIcon />
								{editor.editor ? 'Open in VS Code' : 'Show in Finder'}
							</DropdownMenuItem>
						)}
						{editor?.session && (
							<DropdownMenuItem onSelect={editor.continueInClaude}>
								<MessageSquareShareIcon />
								Continue in Claude Code
							</DropdownMenuItem>
						)}
						<DropdownMenuItem onSelect={onOpenInBrowser}>
							<ExternalLinkIcon />
							Open in browser
						</DropdownMenuItem>
						{url && (
							<DropdownMenuItem onSelect={() => void copy()}>
								<CopyIcon />
								{copied ? 'Copied' : 'Copy preview link'}
							</DropdownMenuItem>
						)}
					</>
				)}
				{/* Where its codebase work is, and the project's documents, after the ways to look at the work. */}
				{documents && (
					<>
						{canOpen && <DropdownMenuSeparator />}
						{builtInCode && (
							<MenuLink href={builtInCode} icon={<GitBranchIcon />}>
								Built in code
							</MenuLink>
						)}
						{records.map((record) => (
							<DropdownMenuItem key={record} onSelect={() => onViewRecord?.(record)}>
								<FileTextIcon />
								{recordLabel(record)}
							</DropdownMenuItem>
						))}
					</>
				)}
				{/* What the project is in, last: it is about the project, not this page. */}
				{folderable && (
					<>
						<DropdownMenuSeparator />
						<DropdownMenuItem onSelect={onAssignFolder}>
							<FolderIcon />
							Assign folder…
						</DropdownMenuItem>
					</>
				)}
			</MoreMenu>

			<Dialog open={open} onOpenChange={setOpen}>
				<DialogContent className="sm:max-w-xl">
					<DialogHeader>
						<DialogTitle>{url && view === 'confirm' ? 'Update the shared preview' : 'Share for review'}</DialogTitle>
					</DialogHeader>
					<DialogBody>
						{view === 'confirm' && (
							<>
								<p className="text-sm">
									This pushes <b>{iteration.branch}</b> to the repository and opens a <b>draft {CHANGE_REQUEST}</b>, so a preview link can be built
									for reviewers. The {CHANGE_REQUEST} is only there to make the link: it is not meant to be merged.
								</p>
								<p className="text-muted-foreground text-sm">
									Only committed work is shared. The build takes several minutes, and you can close this and keep working.
								</p>
							</>
						)}
						{view === 'running' && status.state === 'running' && (
							<div className="flex flex-row items-center gap-3">
								<Spinner />
								<div>
									<p className="text-sm">{stepText(status.step, status.detail)}</p>
									<p className="text-muted-foreground text-sm">You can close this. It carries on.</p>
								</div>
							</div>
						)}
						{view === 'ready' && status.state === 'ready' && (
							<>
								<Alert variant="success">
									<AlertDescription>The preview is up.</AlertDescription>
								</Alert>
								<p className="text-sm break-all">
									<OutLink href={status.url}>{status.url}</OutLink>
								</p>
								<p className="text-muted-foreground text-sm">
									Reviewers will see it on this iteration the next time they open the app. If anything stops it reaching them, the publishing status
									on the Projects page says what.
								</p>
							</>
						)}
						{view === 'failed' && status.state === 'failed' && <ErrorAlert error={status.message} />}
						{error && <ErrorAlert error={error} />}
					</DialogBody>
					<DialogFooter>
						{view === 'confirm' ? (
							<>
								<CancelButton onClick={() => setOpen(false)} />
								<Button onClick={() => void start()}>{url ? 'Push and update' : 'Push and share'}</Button>
							</>
						) : (
							<>
								{view === 'failed' && <RetryButton onClick={() => setPhase('confirm')} />}
								{view === 'ready' && (
									<Button variant="secondary" onClick={() => void copy()}>
										{copied ? 'Copied' : 'Copy link'}
									</Button>
								)}
								<Button onClick={() => setOpen(false)}>{view === 'running' ? 'Close' : 'Done'}</Button>
							</>
						)}
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	);
};
