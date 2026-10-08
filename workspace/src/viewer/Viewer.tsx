import { ChevronLeftIcon, LogOutIcon } from 'lucide-react';
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { prototypeKey } from '../shared/projects';
import { prototypeAddressed } from '../renderer/comments/addressed';
import { CommentBox } from '../renderer/comments/CommentBox';
import { CommentControl } from '../renderer/comments/CommentControl';
import { CommentList } from '../renderer/comments/CommentList';
import { CommentsHeading } from '../renderer/comments/CommentsHeading';
import { useComments } from '../renderer/comments/useComments';
import { IterationSwitcher } from '../renderer/IterationSwitcher';
import { Toolbar } from '../renderer/Toolbar';
import { Alert, AlertDescription } from '../renderer/ui/alert';
import { Button } from '../renderer/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../renderer/ui/dialog';
import { Tooltip, TooltipContent, TooltipTrigger } from '../renderer/ui/tooltip';
import { browserComments, framePage, saveToken, savedToken, tokenApi } from './browserAdapter';

/**
 * A prototype's published page, as the app shows one: its bar (the app's own toolbar, back button, title and iteration
 * switcher), the Comment control and its count, the side panel from the right, the box beside the pin. All of it the
 * app's own parts. Drawn into the page the site built, which holds only a link back to the project until this takes
 * over, so the page still works without it.
 */

/** What the site writes into each iteration's page for this. */
export interface ViewerConfig {
	owner: string;
	repo: string;
	projectId: string;
	name: string;
	title: string;
	/** Where the project's own page is, from this one. */
	projectHref: string;
	/** Every iteration of the project that has a page, and where each is from this one. */
	iterations: { name: string; href: string }[];
}

/** What is drawn where: the bar, the comments' panel, and the prototype's frame. */
export interface ViewerSlots {
	bar: HTMLElement;
	panel: HTMLElement;
	frame: HTMLIFrameElement;
}

/** The page's bar. `children` is what comes last: the Comment control, or signing in. */
const PageBar = ({ config, slots, children }: { config: ViewerConfig; slots: ViewerSlots; children: ReactNode }) => {
	const iterations = useMemo(
		() => config.iterations.map((i) => ({ ...i, branch: prototypeKey(config.projectId, i.name) })),
		[config.iterations, config.projectId],
	);
	return createPortal(
		<Toolbar>
			<Tooltip>
				<TooltipTrigger asChild>
					<Button size="icon" variant="ghost" aria-label="Back to the project" className="-mr-2 -ml-2" asChild>
						<a href={config.projectHref}>
							<ChevronLeftIcon />
						</a>
					</Button>
				</TooltipTrigger>
				<TooltipContent side="bottom">Back to the project</TooltipContent>
			</Tooltip>
			<h2 className="truncate text-sm font-semibold">{config.title}</h2>
			<div className="grow" />
			<div className="flex items-center gap-2">
				<IterationSwitcher
					current={{ name: config.name, branch: prototypeKey(config.projectId, config.name) }}
					siblings={iterations}
					grouped
					onSelect={(next) => void (location.href = next.href)}
				/>
				{children}
			</div>
		</Toolbar>,
		slots.bar,
	);
};

export const Viewer = ({ config, slots }: { config: ViewerConfig; slots: ViewerSlots }) => {
	// A token kept in this browser is what the sign-in will leave; until it exists, only tests leave one.
	const [token, setToken] = useState<string | null>(savedToken);
	const [paused, setPaused] = useState(false);
	const signOut = () => {
		saveToken(null);
		setToken(null);
	};
	return (
		<>
			{token ? (
				<Commenting key={token} config={config} slots={slots} token={token} onSignOut={signOut} />
			) : (
				<PageBar config={config} slots={slots}>
					{/* Not on a phone: commenting needs a computer, and the bar's room goes to the title and the switcher. */}
					<Button size="sm" variant="outline" className="max-sm:hidden" onClick={() => setPaused(true)}>
						Sign in to comment
					</Button>
				</PageBar>
			)}
			<CommentingPaused open={paused} onClose={() => setPaused(false)} />
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
			<PageBar config={config} slots={slots}>
				<CommentControl comments={comments} listOpen={listOpen} onToggleList={() => setListOpen((o) => !o)} disabled={!opened} />
			</PageBar>
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
 * Commenting from a page is paused until signing in with GitHub works from one (M9 of the Pages plan): the button is
 * kept where it will be, and says where to comment meanwhile.
 */
const CommentingPaused = ({ open, onClose }: { open: boolean; onClose: () => void }) => (
	<Dialog open={open} onOpenChange={(o) => !o && onClose()}>
		<DialogContent className="sm:max-w-md">
			<DialogHeader>
				<DialogTitle>Commenting here is coming</DialogTitle>
				<DialogDescription>For now, comment on this prototype in Flock Designer.</DialogDescription>
			</DialogHeader>
			<DialogFooter>
				<Button onClick={onClose}>OK</Button>
			</DialogFooter>
		</DialogContent>
	</Dialog>
);
