import {
	FSAlert,
	FSBox,
	FSButton,
	FSDialog,
	FSDialogActions,
	FSDialogContent,
	FSDialogTitle,
	FSIconButton,
	FSLink,
	FSSpinner,
	FSStack,
	FSTooltip,
	FSTypography,
} from '@flocksafety/flock-react-component-lib';
import ContentCopy from '@mui/icons-material/ContentCopy';
import ShareOutlined from '@mui/icons-material/ShareOutlined';
import { useCallback, useEffect, useState } from 'react';
import type { Checkout, Project, ProjectIteration, ShareStatus } from '../shared/contract';
import { dialogView, isMine, stepText } from './shareView';

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
				<FSTooltip title={copied ? 'Copied' : 'Copy the preview link'} describeChild>
					<FSIconButton size="sm" variant="ghost" aria-label="Copy the preview link" onClick={() => void copy()}>
						<ContentCopy fontSize="small" />
					</FSIconButton>
				</FSTooltip>
			)}
			<FSButton
				size="sm"
				variant="secondary"
				startIcon={running ? <FSSpinner size={14} /> : <ShareOutlined fontSize="small" />}
				onClick={() => {
					setPhase(running ? 'working' : 'confirm');
					setError(null);
					show(true);
				}}
			>
				{running ? 'Sharing…' : url ? 'Update shared preview' : 'Share for review'}
			</FSButton>

			<FSDialog open={open} onClose={() => show(false)} fullWidth maxWidth="sm">
				<FSDialogTitle>{url && view === 'confirm' ? 'Update the shared preview' : 'Share for review'}</FSDialogTitle>
				<FSDialogContent>
					<FSStack spacing={2} sx={{ pt: 1 }}>
						{view === 'confirm' && (
							<>
								<FSTypography variant="body2">
									This pushes <b>{iteration.branch}</b> to the repository and opens a <b>draft pull request</b>, so a preview link
									can be built for reviewers. The pull request is only there to make the link: it is not meant to be merged.
								</FSTypography>
								<FSTypography variant="body2" color="text.secondary">
									Only committed work is shared. The build takes several minutes, and you can close this and keep working.
								</FSTypography>
							</>
						)}
						{view === 'running' && status.state === 'running' && (
							<FSStack direction="row" spacing={1.5} alignItems="center">
								<FSSpinner />
								<FSBox>
									<FSTypography variant="body1">{stepText(status.step, status.detail)}</FSTypography>
									<FSTypography variant="body2" color="text.secondary">
										You can close this. It carries on.
									</FSTypography>
								</FSBox>
							</FSStack>
						)}
						{view === 'ready' && status.state === 'ready' && (
							<>
								<FSAlert severity="success">The preview is up.</FSAlert>
								<FSTypography variant="body2" sx={{ wordBreak: 'break-all' }}>
									<FSLink href={status.url} target="_blank" rel="noreferrer">
										{status.url}
									</FSLink>
								</FSTypography>
								{status.published.state === 'published' ? (
									<FSTypography variant="body2" color="text.secondary">
										Reviewers will see it on this iteration the next time they open the app.
									</FSTypography>
								) : (
									<FSAlert severity="warning">
										The link was saved here but not shared with reviewers: {status.published.reason}
									</FSAlert>
								)}
							</>
						)}
						{view === 'failed' && status.state === 'failed' && (
							<FSAlert severity="error" sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
								{status.message}
							</FSAlert>
						)}
						{error && <FSAlert severity="error">{error}</FSAlert>}
					</FSStack>
				</FSDialogContent>
				<FSDialogActions>
					{view === 'confirm' ? (
						<>
							<FSButton size="md" variant="secondary" onClick={() => show(false)}>
								Cancel
							</FSButton>
							<FSButton size="md" onClick={() => void start()}>
								{url ? 'Push and update' : 'Push and share'}
							</FSButton>
						</>
					) : (
						<>
							{view === 'failed' && (
								<FSButton size="md" variant="secondary" onClick={() => setPhase('confirm')}>
									Try again
								</FSButton>
							)}
							{view === 'ready' && (
								<FSButton size="md" variant="secondary" onClick={() => void copy()}>
									{copied ? 'Copied' : 'Copy link'}
								</FSButton>
							)}
							<FSButton size="md" onClick={() => show(false)}>
								{view === 'running' ? 'Close' : 'Done'}
							</FSButton>
						</>
					)}
				</FSDialogActions>
			</FSDialog>
		</>
	);
};
