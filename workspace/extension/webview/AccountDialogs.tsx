import { useEffect, useState } from 'react';
import type { PublishStatus } from '../../src/shared/contract';
import { syncWords } from '../src/publishing';
import { Button } from './ui/Button';
import { Dialog, DialogButtons } from './ui/Dialog';
import { workspace } from './host';
import { Message } from './ui/Message';
import { askOnce } from './hooks/ask';

/**
 * The GitHub account, as a dialog in the panel (the title bar's account action opens it): who is signed in, and Sign out.
 * VS Code keeps the account itself in its Accounts menu, so only DSNR's use of it ends. What went wrong is said, and it stays.
 */
export const AccountDialog = ({ login, onClose }: { login: string; onClose: () => void }) => {
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	const signOut = async () => {
		setBusy(true);
		setError(null);
		const r = await workspace().signOut();
		setBusy(false);
		if (r.ok) onClose();
		else setError(r.error);
	};
	return (
		<Dialog title="GitHub account" onClose={onClose}>
			<Message>
				Signed in to GitHub as <strong>{login}</strong>.
			</Message>
			<Message tone="error">{error}</Message>
			<DialogButtons>
				<Button disabled={busy} onClick={() => void signOut()}>
					{busy ? 'Signing out…' : 'Sign out of DSNR'}
				</Button>
			</DialogButtons>
		</Dialog>
	);
};

/**
 * Whether the person's work is synced, as a dialog in the panel (the status bar's item opens it): said in the status
 * bar's own words (`syncWords`), what is held back with why and its files, and Sync now. It follows the sync while it is
 * open, so a sync that finishes is seen finishing.
 */
export const SyncDialog = ({ onClose }: { onClose: () => void }) => {
	const [status, setStatus] = useState<PublishStatus | null>(null);
	const [error, setError] = useState<string | null>(null);
	useEffect(() => {
		const stop = askOnce(
			() => workspace().publishStatus(),
			(r) => (r.ok ? setStatus(r.value) : setError(r.error)),
		);
		const off = workspace().onPublishStatus(setStatus);
		return () => {
			stop();
			off();
		};
	}, []);
	const syncNow = async () => {
		setError(null);
		const r = await workspace().publishNow();
		if (r.ok) setStatus(r.value);
		else setError(r.error);
	};
	return (
		<Dialog title="Your work’s sync" onClose={onClose}>
			{status === null ? (
				error === null && <Message>Reading how your work is synced…</Message>
			) : (
				<>
					<Message>{syncWords(status)}</Message>
					{status.state === 'held' && (
						<ul className="problem-list">
							{status.problems.map((p) => (
								<li key={p.what} data-held className="held">
									<strong>{p.what}</strong>
									<span>{[p.why, ...(p.files ?? [])].join(' ')}</span>
								</li>
							))}
						</ul>
					)}
				</>
			)}
			<Message tone="error">{error}</Message>
			<DialogButtons>
				{status !== null && status.state !== 'unavailable' ? (
					<Button disabled={status.state === 'working'} onClick={() => void syncNow()}>
						Sync now
					</Button>
				) : undefined}
			</DialogButtons>
		</Dialog>
	);
};
