import { CircleCheckIcon, CodeIcon, CopyIcon, EllipsisVerticalIcon, ExternalLinkIcon, MessageSquareShareIcon, Share2Icon, SquareTerminalIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { Checkout, Project, ProjectIteration, ShareStatus } from '../shared/contract';
import { dialogView, isMine, stepText } from './shareView';
import { Alert, AlertDescription } from './ui/alert';
import { Button } from './ui/button';
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from './ui/dropdown-menu';
import { Spinner } from './ui/spinner';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';

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
	onMoveToCode,
	selection,
	editor,
}: {
	checkout: Checkout | null;
	project: Project;
	iteration: ProjectIteration;
	/** Whether the page is up, so there is something to open. */
	canOpen: boolean;
	onOpenInBrowser: () => void;
	/** A prototype: already where reviewers see it, so there is no sharing, only moving it into the code. */
	prototype?: boolean;
	/** Offered when there is a product repository here to build it in. */
	onMoveToCode?: () => void;
	/** A prototype's version, and whether it is the project's selected one, to select it or not. */
	selection?: { version: number; selected: boolean; onToggle: () => void };
	/** Codebase work, handed to the person's editor: the checkout, and the agent's conversation when there is one. */
	editor?: { editor: boolean; session: boolean; openInEditor: () => unknown; continueInClaude: () => unknown };
}) => {
	const [status, setStatus] = useState<ShareStatus>({ state: 'idle' });
	const [open, setOpen] = useState(false);
	const [phase, setPhase] = useState<'confirm' | 'working'>('confirm');
	const [error, setError] = useState<string | null>(null);
	const [copied, setCopied] = useState(false);

	useEffect(() => {
		void window.workspace.shareStatus().then((r) => r.ok && setStatus(r.value));
		return window.workspace.onShareStatus(setStatus);
	}, []);

	const mine = isMine(status, project.id, iteration.name);
	const running = mine && status.state === 'running';
	const url = mine && status.state === 'ready' ? status.url : iteration.previewUrl;
	const view = dialogView(phase, status, mine);
	// The menu's two groups: what you do to the work, then where you look at it.
	const canMove = prototype && onMoveToCode;
	const canShare = checkout && !prototype;
	const canSelect = prototype && selection;

	const start = async () => {
		if (!checkout) return;
		setError(null);
		const r = await window.workspace.shareIteration(checkout.root, project.id, iteration.name);
		if (!r.ok) return setError(r.error);
		setStatus(r.value);
		setPhase('working');
	};

	const copy = async () => {
		if (!url) return;
		try {
			await navigator.clipboard.writeText(url);
			setCopied(true);
			setTimeout(() => setCopied(false), 1500);
		} catch {
			setError('Could not copy to the clipboard. The address is shown in the dialog.');
		}
	};

	return (
		<>
			<DropdownMenu>
				<Tooltip>
					<TooltipTrigger asChild>
						<DropdownMenuTrigger asChild>
							<Button size="icon-sm" variant="outline" aria-label="More" disabled={!canOpen}>
								{running ? <Spinner /> : <EllipsisVerticalIcon />}
							</Button>
						</DropdownMenuTrigger>
					</TooltipTrigger>
					<TooltipContent>{running ? 'Sharing…' : 'More'}</TooltipContent>
				</Tooltip>
				<DropdownMenuContent align="end" className="w-auto">
					{canSelect && (
						<DropdownMenuItem onSelect={selection.onToggle}>
							<CircleCheckIcon />
							{selection.selected ? `Unselect V${selection.version}` : `Select V${selection.version}`}
						</DropdownMenuItem>
					)}
					{canMove && (
						<DropdownMenuItem onSelect={onMoveToCode}>
							<CodeIcon />
							Build in the codebase
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
					{(canSelect || canMove || canShare) && <DropdownMenuSeparator />}
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
				</DropdownMenuContent>
			</DropdownMenu>

			<Dialog open={open} onOpenChange={setOpen}>
				<DialogContent className="sm:max-w-xl">
					<DialogHeader>
						<DialogTitle>{url && view === 'confirm' ? 'Update the shared preview' : 'Share for review'}</DialogTitle>
					</DialogHeader>
					<DialogBody className="flex flex-col gap-4">
						{view === 'confirm' && (
							<>
								<p className="text-sm">
									This pushes <b>{iteration.branch}</b> to the repository and opens a <b>draft pull request</b>, so a preview
									link can be built for reviewers. The pull request is only there to make the link: it is not meant to be
									merged.
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
									<a className="text-primary underline underline-offset-4" href={status.url} target="_blank" rel="noreferrer">
										{status.url}
									</a>
								</p>
								<p className="text-muted-foreground text-sm">
									Reviewers will see it on this iteration the next time they open the app. If anything stops it reaching
									them, the publishing status on the Projects page says what.
								</p>
							</>
						)}
						{view === 'failed' && status.state === 'failed' && (
							<Alert variant="destructive">
								<AlertDescription className="wrap-anywhere whitespace-pre-wrap">{status.message}</AlertDescription>
							</Alert>
						)}
						{error && (
							<Alert variant="destructive">
								<AlertDescription>{error}</AlertDescription>
							</Alert>
						)}
					</DialogBody>
					<DialogFooter>
						{view === 'confirm' ? (
							<>
								<Button variant="secondary" onClick={() => setOpen(false)}>
									Cancel
								</Button>
								<Button onClick={() => void start()}>{url ? 'Push and update' : 'Push and share'}</Button>
							</>
						) : (
							<>
								{view === 'failed' && (
									<Button variant="secondary" onClick={() => setPhase('confirm')}>
										Try again
									</Button>
								)}
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
