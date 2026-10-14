import { ChevronLeftIcon, LogOutIcon, WandSparklesIcon } from 'lucide-react';
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { commentRef } from '../shared/comments';
import type { CommentRef, ReviewComment } from '../shared/contract';
import type { CommentStore } from '../renderer/comments/surfaces';
import { prototypeKey } from '../shared/designPaths';
import { withState } from '../shared/prototypeStates';
import { prototypeAddressed } from '../renderer/comments/addressed';
import { CommentBox } from '../renderer/comments/CommentBox';
import { CommentControl } from '../renderer/comments/CommentControl';
import { useComments } from '../renderer/comments/useComments';
import { IterationSwitcher, StateSwitcher } from '../renderer/IterationSwitcher';
import { Toolbar } from '../renderer/Toolbar';
import { Button } from '../renderer/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../renderer/ui/dialog';
import { DropdownMenuItem } from '../renderer/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '../renderer/ui/tooltip';
import { browserComments, framePage, saveToken, savedToken, tokenApi } from './browserAdapter';
import { type Relay, loginIn, relayComments } from './relay';
import { closeUnlessBusy } from '../renderer/dialogClose';
import { CommentsPanel } from '../renderer/comments/CommentsPanel';
import { useOpenOnError } from '../renderer/comments/useOpenOnError';

/**
 * A prototype's published page, as the app shows one: its bar (the app's own toolbar, back button, title, version and
 * iteration switchers, and the page's states when it has more than one), the Comment control and its count, the side
 * panel from the right, the box beside the pin. All of it the app's own parts. Drawn into the page the site built, which
 * holds only a link back to the project until this takes over, so the page still works without it.
 *
 * In DSNR's review tab in VS Code (`relay`, ELECTRON_MIGRATION_PLAN 4.2) it comments through the extension: signing in
 * is VS Code's, the comments are the core's, and an open comment can be addressed. Anywhere else it uses a token kept
 * in the browser, which only tests leave until signing in from a page is built.
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
	/** The states the page has (`shared/prototypeStates`); not there on a page built before pages said. */
	states?: string[];
}

/** What is drawn where: the bar, the comments' panel, and the prototype's frame. */
export interface ViewerSlots {
	bar: HTMLElement;
	panel: HTMLElement;
	frame: HTMLIFrameElement;
}

/**
 * The page's states, the one the frame shows, and choosing another; kept above the bar, which is drawn again on signing
 * in or out.
 */
type Showing = { states: string[]; state: string | null; onState: (state: string | null) => void };

/** How long a loaded page is given to say it is up before the bar says it has no pins. */
const NO_AGENT_MS = 8000;
const NO_AGENT = 'This page cannot show its comments’ pins: it was built without DSNR’s page agent. Build the site again.';

/** The page's bar. `children` is what comes last: the Comment control, or signing in. */
const PageBar = ({ config, slots, showing, children }: { config: ViewerConfig; slots: ViewerSlots; showing: Showing; children: ReactNode }) => {
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
			<h1 className="truncate text-sm font-semibold">{config.title}</h1>
			<div className="grow" />
			<div className="flex items-center gap-2">
				<IterationSwitcher
					current={{ name: config.name, branch: prototypeKey(config.projectId, config.name) }}
					siblings={iterations}
					grouped
					onSelect={(next) => void (location.href = next.href)}
				>
					<StateSwitcher states={showing.states} current={showing.state} onSelect={showing.onState} />
				</IterationSwitcher>
				{children}
			</div>
		</Toolbar>,
		slots.bar,
	);
};

export const Viewer = ({ config, slots, relay = null }: { config: ViewerConfig; slots: ViewerSlots; relay?: Relay | null }) => {
	// A token kept in this browser is what the sign-in will leave; until it exists, only tests leave one.
	const [token, setToken] = useState<string | null>(savedToken);
	const [paused, setPaused] = useState(false);
	// The frame opens in the page's first state; another is the same page, asked for in it.
	const [shownState, setShownState] = useState<string | null>(null);
	const showing: Showing = {
		states: config.states ?? [],
		state: shownState,
		onState: (next) => {
			setShownState(next);
			slots.frame.src = withState(slots.frame.getAttribute('src') ?? 'page.html', next);
		},
	};
	const branch = prototypeKey(config.projectId, config.name);
	const tokenStore = useMemo(
		() => (token ? browserComments(tokenApi(token), { owner: config.owner, repo: config.repo }, { projectId: config.projectId, branch }) : null),
		[token, config, branch],
	);
	if (relay) return <InDsnr config={config} slots={slots} showing={showing} relay={relay} />;
	const signOut = () => {
		saveToken(null);
		setToken(null);
	};
	return (
		<>
			{tokenStore ? (
				<Commenting
					key={token}
					config={config}
					slots={slots}
					showing={showing}
					store={tokenStore}
					heading={
						<Button size="sm" variant="ghost" title="Forget the token kept in this browser" onClick={signOut}>
							<LogOutIcon />
							Sign out
						</Button>
					}
				/>
			) : (
				<PageBar config={config} slots={slots} showing={showing}>
					{/* Not on a phone: commenting needs a computer, and the bar's room goes to the title and the switcher. */}
					<Button variant="outline" className="max-sm:hidden" onClick={() => setPaused(true)}>
						Sign in to comment
					</Button>
				</PageBar>
			)}
			<CommentingPaused open={paused} onClose={() => setPaused(false)} />
		</>
	);
};

/**
 * In DSNR's review tab: who is signed in is the extension's, signing in is VS Code's own (from Sign in to comment), and
 * the comments are the core's, with Address on an open one, run by the extension as it runs a build.
 */
const InDsnr = ({ config, slots, showing, relay }: { config: ViewerConfig; slots: ViewerSlots; showing: Showing; relay: Relay }) => {
	const [login, setLogin] = useState<string | null | undefined>(undefined);
	const [addressing, setAddressing] = useState<number | null>(null);
	useEffect(() => {
		void relay.ask('signInState', []).then((r) => setLogin(loginIn(r)));
	}, [relay]);
	const store = useMemo(
		() => relayComments(relay, { projectId: config.projectId, branch: prototypeKey(config.projectId, config.name) }),
		[relay, config],
	);
	const signIn = async () => {
		const signedIn = loginIn(await relay.ask('signIn', []));
		if (signedIn !== null) setLogin(signedIn);
	};
	const address = async (comment: CommentRef) => {
		setAddressing(comment.id);
		await relay.ask('address', [comment]);
		setAddressing(null);
	};
	if (login === undefined) return null;
	if (login === null)
		return (
			<PageBar config={config} slots={slots} showing={showing}>
				<Button variant="outline" onClick={() => void signIn()}>
					Sign in to comment
				</Button>
			</PageBar>
		);
	return (
		<Commenting
			config={config}
			slots={slots}
			showing={showing}
			store={store}
			actions={(comment: ReviewComment) =>
				comment.resolved ? null : (
					<DropdownMenuItem disabled={addressing !== null} onSelect={() => void address(commentRef(comment))}>
						<WandSparklesIcon />
						{addressing === comment.id ? 'Working…' : 'Address'}
					</DropdownMenuItem>
				)
			}
		/>
	);
};

const Commenting = ({
	config,
	slots,
	showing,
	store,
	heading,
	actions,
}: {
	config: ViewerConfig;
	slots: ViewerSlots;
	showing: Showing;
	store: CommentStore;
	/** What the panel's heading has at its end: Sign out, for a token kept in the browser. */
	heading?: ReactNode;
	/** More at the top of an open comment's menu: Address, in DSNR. */
	actions?: (comment: ReviewComment) => ReactNode;
}) => {
	const page = useMemo(() => framePage(slots.frame), [slots.frame]);
	const [error, setError] = useState<string | null>(null);
	const [opened, setOpened] = useState(false);
	const [route, setRoute] = useState<string | null>(null);
	const [listOpen, setListOpen] = useState(false);

	// The prototype is up once its page's agent says so, after every load, and its pins are drawn then; and again when its
	// route moves. A page that loads and never says so has no agent (a site built before it): said, not left without pins.
	useEffect(() => {
		const frame = slots.frame;
		let waitingFor: ReturnType<typeof setTimeout> | undefined;
		const stopReady = page.onReady((at) => {
			clearTimeout(waitingFor);
			setOpened(true);
			setRoute(at);
		});
		const stopRoute = page.onRoute(setRoute);
		const loaded = () => {
			clearTimeout(waitingFor);
			waitingFor = setTimeout(() => setError(NO_AGENT), NO_AGENT_MS);
		};
		frame.addEventListener('load', loaded);
		return () => {
			clearTimeout(waitingFor);
			stopReady();
			stopRoute();
			frame.removeEventListener('load', loaded);
			page.stop();
		};
	}, [slots.frame, page]);

	const comments = useComments({ store, page, opened, route, setError, onPinClick: () => setListOpen(true) });
	useOpenOnError(error, () => setListOpen(true));

	const frameBox = slots.frame.getBoundingClientRect();
	return (
		<>
			<PageBar config={config} slots={slots} showing={showing}>
				<CommentControl comments={comments} listOpen={listOpen} onToggleList={() => setListOpen((o) => !o)} disabled={!opened} />
			</PageBar>
			{listOpen &&
				createPortal(
					// The page's panel slot holds the same panel as the app's: its divider, then the panel, side by side.
					<div className="flex h-full">
						<CommentsPanel
							comments={comments}
							error={error}
							heading={heading}
							{...(actions ? { actions } : {})}
							states={showing.states}
							onShowState={showing.onState}
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
	<Dialog open={open} onOpenChange={closeUnlessBusy(onClose)}>
		<DialogContent className="sm:max-w-md">
			<DialogHeader>
				<DialogTitle>Commenting here is coming</DialogTitle>
				<DialogDescription>For now, comment on this prototype in DSNR.</DialogDescription>
			</DialogHeader>
			<DialogFooter>
				<Button onClick={onClose}>OK</Button>
			</DialogFooter>
		</DialogContent>
	</Dialog>
);
