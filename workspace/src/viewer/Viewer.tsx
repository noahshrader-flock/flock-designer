import { LogOutIcon } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { prototypeKey } from '../shared/projects';
import { prototypeAddressed } from '../renderer/comments/addressed';
import { CommentBox } from '../renderer/comments/CommentBox';
import { CommentControl } from '../renderer/comments/CommentControl';
import { CommentList } from '../renderer/comments/CommentList';
import { CommentsHeading } from '../renderer/comments/CommentsHeading';
import { useComments } from '../renderer/comments/useComments';
import { Alert, AlertDescription } from '../renderer/ui/alert';
import { Button } from '../renderer/ui/button';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../renderer/ui/dialog';
import { Input } from '../renderer/ui/input';
import { browserComments, framePage, saveToken, savedToken, tokenApi } from './browserAdapter';

/**
 * Commenting on a prototype's published page, with the app's own comments experience: the Comment control and its
 * count in the page's bar, the side panel from the right, the box beside the pin. Drawn into the page the site built,
 * so the page works as it is without this, and gains comments with it.
 */

/** What the site writes into each iteration's page for this. */
export interface ViewerConfig {
	owner: string;
	repo: string;
	projectId: string;
	name: string;
}

/** What is drawn where: the bar's slot, the panel's, and the prototype's frame. */
export interface ViewerSlots {
	bar: HTMLElement;
	panel: HTMLElement;
	frame: HTMLIFrameElement;
}

export const Viewer = ({ config, slots }: { config: ViewerConfig; slots: ViewerSlots }) => {
	const [token, setToken] = useState<string | null>(savedToken);
	const [signingIn, setSigningIn] = useState(false);
	const signIn = (t: string | null) => {
		saveToken(t);
		setToken(t);
	};
	return (
		<>
			{token ? (
				<Commenting key={token} config={config} slots={slots} token={token} onSignOut={() => signIn(null)} />
			) : (
				createPortal(
					<Button size="sm" variant="outline" onClick={() => setSigningIn(true)}>
						Sign in to comment
					</Button>,
					slots.bar,
				)
			)}
			<SignIn config={config} open={signingIn} onClose={() => setSigningIn(false)} onToken={signIn} />
		</>
	);
};

const Commenting = ({ config, slots, token, onSignOut }: { config: ViewerConfig; slots: ViewerSlots; token: string; onSignOut: () => void }) => {
	const store = useMemo(
		() => browserComments(tokenApi(token), { owner: config.owner, repo: config.repo }, { projectId: config.projectId, branch: prototypeKey(config.projectId, config.name) }),
		[token, config],
	);
	const page = useMemo(() => framePage(slots.frame), [slots.frame]);
	const [error, setError] = useState<string | null>(null);
	const [opened, setOpened] = useState(false);
	const [route, setRoute] = useState<string | null>(null);
	const [listOpen, setListOpen] = useState(false);

	// The prototype is up once its frame has loaded, and again after every load: its pins are drawn then.
	useEffect(() => {
		const frame = slots.frame;
		const moved = () => void page.route().then(setRoute);
		// Each load is a new document, listened to for moves within it; the last is let go on leaving.
		let listening: Window | null = null;
		const loaded = () => {
			setOpened(true);
			moved();
			listening = frame.contentWindow;
			listening?.addEventListener('hashchange', moved);
		};
		if (frame.contentDocument?.readyState === 'complete') loaded();
		frame.addEventListener('load', loaded);
		return () => {
			frame.removeEventListener('load', loaded);
			listening?.removeEventListener('hashchange', moved);
		};
	}, [slots.frame, page]);

	const comments = useComments({ store, page, opened, route, setError, onPinClick: () => setListOpen(true) });
	// Something went wrong is only useful if it can be seen: it is said in the panel, so the panel opens.
	useEffect(() => {
		if (error !== null) setListOpen(true);
	}, [error]);

	const frameBox = slots.frame.getBoundingClientRect();
	return (
		<>
			{createPortal(<CommentControl comments={comments} listOpen={listOpen} onToggleList={() => setListOpen((o) => !o)} disabled={!opened} />, slots.bar)}
			{listOpen &&
				createPortal(
					<div className="bg-card flex h-full w-[360px] flex-col gap-4 overflow-y-auto border-l p-4">
						<CommentsHeading comments={comments}>
							<Button size="sm" variant="ghost" title="Forget the token kept in this browser" onClick={onSignOut}>
								<LogOutIcon />
								Sign out
							</Button>
						</CommentsHeading>
						{error && !comments.composing && (
							<Alert variant="destructive">
								<AlertDescription>{error}</AlertDescription>
							</Alert>
						)}
						<CommentList
							comments={comments}
							addressed={(c) => prototypeAddressed(c, config.projectId, config.name)}
						/>
					</div>,
					slots.panel,
				)}
			{comments.composing && (
				<CommentBox
					comments={comments}
					origin={{ top: frameBox.top, left: frameBox.left }}
					error={error}
					note="A comment made on this page has no picture of the spot yet: only the app can take one."
				/>
			)}
		</>
	);
};

/**
 * Signing in, for testing only: a fine-grained token, kept in this browser. Everyone else will sign in with GitHub
 * itself (M9 of the Pages plan); a page cannot do that on its own.
 */
const SignIn = ({ config, open, onClose, onToken }: { config: ViewerConfig; open: boolean; onClose: () => void; onToken: (t: string) => void }) => {
	const [value, setValue] = useState('');
	const [error, setError] = useState<string | null>(null);
	const [checking, setChecking] = useState(false);
	const check = async () => {
		setChecking(true);
		setError(null);
		try {
			// Asked of GitHub before it is kept: a token that cannot read this repository's issues is said to be so now.
			await tokenApi(value.trim()).api(`/repos/${config.owner}/${config.repo}/issues?per_page=1`);
			onToken(value.trim());
			setValue('');
			onClose();
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
		} finally {
			setChecking(false);
		}
	};
	return (
		<Dialog open={open} onOpenChange={(o) => !o && onClose()}>
			<DialogContent className="sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>Sign in to comment</DialogTitle>
					<DialogDescription>For testing, until signing in with GitHub works from a page.</DialogDescription>
				</DialogHeader>
				<DialogBody className="flex flex-col gap-3">
					<p className="text-sm">
						Paste a{' '}
						<a className="underline" href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noreferrer">
							fine-grained GitHub token
						</a>{' '}
						with <strong>Issues: read and write</strong> on {config.owner}/{config.repo}, and nothing else.
					</p>
					<p className="text-muted-foreground text-sm">It is kept in this browser only, and sent only to GitHub. Sign out to forget it.</p>
					<Input type="password" autoComplete="off" aria-label="GitHub token" value={value} onChange={(e) => setValue(e.target.value)} />
					{error && (
						<Alert variant="destructive">
							<AlertDescription>{error}</AlertDescription>
						</Alert>
					)}
				</DialogBody>
				<DialogFooter>
					<Button variant="secondary" onClick={onClose}>
						Cancel
					</Button>
					<Button onClick={() => void check()} disabled={checking || !value.trim()}>
						{checking ? 'Checking…' : 'Sign in'}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
};
