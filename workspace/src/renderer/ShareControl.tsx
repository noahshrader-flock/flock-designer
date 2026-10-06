import { CopyIcon, Share2Icon } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import type { Checkout, Project, ProjectIteration, ShareStatus } from '../shared/contract';
import { dialogView, isMine, stepText } from './shareView';
import { Alert, AlertDescription } from './ui/alert';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';
import { Spinner } from './ui/spinner';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';

/**
 * Share an iteration with people who are not on this machine: one click, then a dialog that
 * says what is about to happen, watches it, and ends with the address.
 *
 * Only someone with the product repository (an author) sees it. It is a push and a pull request,
 * so it says so before doing either, and the dialog stays honest about the wait: a build takes
 * minutes. Closing the dialog does not stop it; the button shows it is still going.
 */
export const ShareControl = ({
	checkout,
	project,
	iteration,
	onOpenChange,
}: {
	checkout: Checkout | null;
	project: Project;
	iteration: ProjectIteration;
	/** The preview is a native layer over this window, so the screen must know when a dialog needs the space. */
	onOpenChange: (open: boolean) => void;
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

	const show = useCallback(
		(next: boolean) => {
			setOpen(next);
			onOpenChange(next);
		},
		[onOpenChange],
	);
	// Leaving with the dialog open must hand the preview back.
	useEffect(() => () => onOpenChange(false), [onOpenChange]);

	if (!checkout) return null;

	const start = async () => {
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
			{url && (
				<Tooltip>
					<TooltipTrigger asChild>
						<Button size="icon" variant="ghost" aria-label="Copy the preview link" onClick={() => void copy()}>
							<CopyIcon />
						</Button>
					</TooltipTrigger>
					<TooltipContent>{copied ? 'Copied' : 'Copy the preview link'}</TooltipContent>
				</Tooltip>
			)}
			<Button
				size="sm"
				variant="secondary"
				onClick={() => {
					setPhase(running ? 'working' : 'confirm');
					setError(null);
					show(true);
				}}
			>
				{running ? <Spinner /> : <Share2Icon />}
				{running ? 'Sharing…' : url ? 'Update shared preview' : 'Share for review'}
			</Button>

			<Dialog open={open} onOpenChange={show}>
				<DialogContent className="sm:max-w-xl">
					<DialogHeader>
						<DialogTitle>{url && view === 'confirm' ? 'Update the shared preview' : 'Share for review'}</DialogTitle>
					</DialogHeader>
					<div className="flex flex-col gap-4">
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
								<Alert>
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
					</div>
					<DialogFooter>
						{view === 'confirm' ? (
							<>
								<Button variant="secondary" onClick={() => show(false)}>
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
								<Button onClick={() => show(false)}>{view === 'running' ? 'Close' : 'Done'}</Button>
							</>
						)}
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	);
};
