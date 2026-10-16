import { ChevronLeftIcon, WandSparklesIcon } from 'lucide-react';
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { commentRef } from '../shared/comments';
import type { CommentRef, ReviewComment } from '../shared/contract';
import type { CommentStore } from '../renderer/comments/surfaces';
import { prototypeKey } from '../shared/designPaths';
import { withState } from '../shared/prototypeStates';
import { withTheme } from '../shared/prototypeTheme';
import { type ShownTheme, useShownTheme } from '../renderer/useShownTheme';
import { prototypeAddressed } from '../renderer/comments/addressed';
import { CommentBox } from '../renderer/comments/CommentBox';
import { CommentControl } from '../renderer/comments/CommentControl';
import { useComments } from '../renderer/comments/useComments';
import { IterationSwitcher, StateSwitcher, ThemeSwitcher } from '../renderer/IterationSwitcher';
import { type BarSize, Toolbar, barButtonSize } from '../renderer/Toolbar';
import { Button } from '../renderer/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../renderer/ui/dialog';
import { DropdownMenuItem } from '../renderer/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '../renderer/ui/tooltip';
import { browserComments, framePage, saveToken, savedToken, tokenApi } from './browserAdapter';
import { NOTE_WORDS, type SignInConfig, type SignInNote, signedInJustNow, startSignIn } from './signIn';
import { userOf } from '../host/github';
import type { GitHubUser } from '../shared/domain/account';
import { AccountMenu } from './AccountMenu';
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
 * is VS Code's, the comments are the core's, and an open comment can be addressed. On the published site it signs the
 * person in with GitHub (`signIn`, PUBLISHED_COMMENTS_PLAN Phase 3) and comments with their token, kept in the browser.
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
type Showing = { states: string[]; state: string | null; onState: (state: string | null) => void; theme: ShownTheme };

/** How long a loaded page is given to say it is up before the bar says it has no pins. */
const NO_AGENT_MS = 8000;
const NO_AGENT = 'This page cannot show its comments’ pins: it was built without DSNR’s page agent. Build the site again.';

/** The page's bar is small: it is over a prototype, and takes little room. */
const BAR: BarSize = 'sm';

/** The page's bar. `children` is what comes last: the Comment control, or signing in. */
const PageBar = ({ config, slots, showing, children }: { config: ViewerConfig; slots: ViewerSlots; showing: Showing; children: ReactNode }) => {
	const iterations = useMemo(
		() => config.iterations.map((i) => ({ ...i, branch: prototypeKey(config.projectId, i.name) })),
		[config.iterations, config.projectId],
	);
	return createPortal(
		<Toolbar quiet>
			<Tooltip>
				<TooltipTrigger asChild>
					<Button size={barButtonSize(BAR, true)} variant="ghost" aria-label="Back to the project" className="-mr-2 -ml-2" asChild>
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
					size={BAR}
					onSelect={(next) => void (location.href = next.href)}
				>
					<StateSwitcher states={showing.states} current={showing.state} onSelect={showing.onState} size={BAR} />
				</IterationSwitcher>
				<ThemeSwitcher shown={showing.theme} size={BAR} />
				{children}
			</div>
		</Toolbar>,
		slots.bar,
	);
};

export const Viewer = ({
	config,
	slots,
	relay = null,
	openedHere = false,
	onAddressed,
	signIn = null,
	note = null,
}: {
	config: ViewerConfig;
	slots: ViewerSlots;
	relay?: Relay | null;
	/** Signing in with GitHub, on the published site; none where the site was built without it. */
	signIn?: SignInConfig | null;
	/** What the last sign-in left to say, when it did not go. */
	note?: SignInNote | null;
	/** Served from this machine with no way to ask DSNR: opened some other way than DSNR's Open in browser. */
	openedHere?: boolean;
	/** Told the iteration Address showed its change in: a page in the browser goes to it (BROWSER_COMMENTS_PLAN D1). */
	onAddressed?: (name: string) => void;
}) => {
	// The token kept in this browser, on the bar's own origin, which a prototype framed with no origin of its own cannot reach.
	const [token, setToken] = useState<string | null>(savedToken);
	const [askedHere, setAskedHere] = useState(false);
	const [said, setSaid] = useState<SignInNote | null>(note);
	const [user, setUser] = useState<GitHubUser | null>(null);
	// The frame opens in the page's first state; another is the same page, asked for in it.
	const [shownState, setShownState] = useState<string | null>(null);
	// The theme it is shown in: light, the page's own address, until dark is chosen, which the page is then asked for.
	const shownTheme = useShownTheme((theme) => {
		slots.frame.src = withTheme(slots.frame.getAttribute('src') ?? 'page.html', theme);
	});
	const showing: Showing = {
		theme: shownTheme,
		states: config.states ?? [],
		state: shownState,
		onState: (next) => {
			setShownState(next);
			slots.frame.src = withState(slots.frame.getAttribute('src') ?? 'page.html', next);
		},
	};
	const branch = prototypeKey(config.projectId, config.name);
	const github = useMemo(
		() =>
			token
				? tokenApi(token, undefined, () => {
						// Ended (D3): through GitHub again, which comes straight back for an App already approved; unless it was
						// just now, so a token GitHub keeps refusing is said, not sent round again and again.
						saveToken(null);
						setToken(null);
						if (signIn && !signedInJustNow(window)) void startSignIn(signIn, window);
						else setSaid('ended');
					})
				: null,
		[token, signIn],
	);
	const tokenStore = useMemo(
		() => (github ? browserComments(github, { owner: config.owner, repo: config.repo }, { projectId: config.projectId, branch }) : null),
		[github, config, branch],
	);
	useEffect(() => {
		setUser(null);
		if (github) void userOf(github).then(setUser, () => setUser(null));
	}, [github]);
	if (relay) return <InDsnr config={config} slots={slots} showing={showing} relay={relay} {...(onAddressed ? { onAddressed } : {})} />;
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
					account={user && <AccountMenu user={user} onSignOut={signOut} />}
				/>
			) : (
				<PageBar config={config} slots={slots} showing={showing}>
					{/* Not on a phone: commenting needs a computer, and the bar's room goes to the title and the switcher. A site
					    built without signing in has no way to: no button. */}
					{(signIn || openedHere) && (
						<Button
							size={BAR}
							variant="outline"
							className="max-sm:hidden"
							onClick={() => (openedHere ? setAskedHere(true) : signIn && void startSignIn(signIn, window))}
						>
							Sign in to comment
						</Button>
					)}
				</PageBar>
			)}
			{/* A page from this machine comments once it is opened from DSNR, which gives it the way to ask: said so. */}
			<Said
				title="Open this page from DSNR to comment"
				words={
					askedHere ? 'In VS Code, use Open in browser on the prototype: the page it opens comments through DSNR, signed in as you are there.' : null
				}
				onClose={() => setAskedHere(false)}
			/>
			<Said
				title={said === 'ended' ? 'Signed out' : 'Not signed in'}
				words={!tokenStore && said ? NOTE_WORDS[said] : null}
				onClose={() => setSaid(null)}
			/>
		</>
	);
};

/**
 * Through DSNR, in its review tab or a page opened from it in the browser: who is signed in is the extension's, signing in is VS Code's own (from Sign in to comment), and
 * the comments are the core's, with Address on an open one, run by the extension as it runs a build.
 */
const InDsnr = ({
	config,
	slots,
	showing,
	relay,
	onAddressed,
}: {
	config: ViewerConfig;
	slots: ViewerSlots;
	showing: Showing;
	relay: Relay;
	onAddressed?: (name: string) => void;
}) => {
	const [login, setLogin] = useState<string | null | undefined>(undefined);
	const [addressing, setAddressing] = useState<number | null>(null);
	useEffect(() => {
		void relay.ask('signInState', []).then((r) => setLogin(loginIn(r)));
	}, [relay]);
	const store = useMemo(
		() => relayComments(relay, { projectId: config.projectId, branch: prototypeKey(config.projectId, config.name) }),
		[relay, config],
	);
	// Signing in is VS Code's own, in its window: while it is open there, the page says so and waits.
	const [signingIn, setSigningIn] = useState(false);
	const signIn = async () => {
		setSigningIn(true);
		const signedIn = loginIn(await relay.ask('signIn', []));
		setSigningIn(false);
		if (signedIn !== null) setLogin(signedIn);
	};
	const address = async (comment: CommentRef) => {
		setAddressing(comment.id);
		// On this page's own iteration: in the browser, the page may have moved to another since it was opened.
		const r = await relay.ask('address', [comment, prototypeKey(config.projectId, config.name)]);
		setAddressing(null);
		if (r.ok && typeof r.value === 'string') onAddressed?.(r.value);
	};
	if (login === undefined) return null;
	if (login === null)
		return (
			<PageBar config={config} slots={slots} showing={showing}>
				<Button size={BAR} variant="outline" disabled={signingIn} onClick={() => void signIn()}>
					{signingIn ? 'Continue in VS Code…' : 'Sign in to comment'}
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
	account,
	actions,
}: {
	config: ViewerConfig;
	slots: ViewerSlots;
	showing: Showing;
	store: CommentStore;
	/** Who is signed in, at the end of the bar, for a token kept in the browser. */
	account?: ReactNode;
	/** More at the top of an open comment's menu: Address, in DSNR. */
	actions?: (comment: ReviewComment) => ReactNode;
}) => {
	const page = useMemo(() => framePage(slots.frame), [slots.frame]);
	const [error, setError] = useState<string | null>(null);
	const [opened, setOpened] = useState(false);
	const [route, setRoute] = useState<string | null>(null);
	const [listOpen, setListOpen] = useState(false);

	// The prototype is up once its page's agent says so, after every load, and its pins are drawn then; and again when its
	// route moves. A page that never says so, from when the bar starts (it may have loaded first, as in VS Code) or from
	// its next load, has no agent (a site built before it): said, not left without pins, until it does say so.
	useEffect(() => {
		const frame = slots.frame;
		let waitingFor: ReturnType<typeof setTimeout> | undefined;
		const wait = () => {
			clearTimeout(waitingFor);
			waitingFor = setTimeout(() => setError(NO_AGENT), NO_AGENT_MS);
		};
		// First: a ready the driver heard before the bar started is told at once, and ends the wait.
		wait();
		const stopReady = page.onReady((at) => {
			clearTimeout(waitingFor);
			setError((was) => (was === NO_AGENT ? null : was));
			setOpened(true);
			setRoute(at);
		});
		const stopRoute = page.onRoute(setRoute);
		frame.addEventListener('load', wait);
		return () => {
			clearTimeout(waitingFor);
			stopReady();
			stopRoute();
			frame.removeEventListener('load', wait);
			page.stop();
		};
	}, [slots.frame, page]);

	const comments = useComments({ store, page, opened, route, setError, onPinClick: () => setListOpen(true) });
	useOpenOnError(error, () => setListOpen(true));

	const frameBox = slots.frame.getBoundingClientRect();
	return (
		<>
			<PageBar config={config} slots={slots} showing={showing}>
				<CommentControl comments={comments} listOpen={listOpen} onToggleList={() => setListOpen((o) => !o)} disabled={!opened} size={BAR} />
				{account}
			</PageBar>
			{listOpen &&
				createPortal(
					// The page's panel slot holds the same panel as the app's: its divider, then the panel, side by side.
					<div className="flex h-full">
						<CommentsPanel
							comments={comments}
							error={error}
							{...(actions ? { actions } : {})}
							states={showing.states}
							onShowState={showing.onState}
							shownTheme={showing.theme}
							addressed={(c) => prototypeAddressed(c, config.projectId, config.name)}
						/>
					</div>,
					slots.panel,
				)}
			{comments.composing && <CommentBox comments={comments} origin={{ top: frameBox.top, left: frameBox.left }} error={error} />}
		</>
	);
};

/** A short word in a dialog, with OK: how a sign-in went, or how to comment from a page that cannot. */
const Said = ({ title, words, onClose }: { title: string; words: string | null; onClose: () => void }) => (
	<Dialog open={words !== null} onOpenChange={closeUnlessBusy(onClose)}>
		<DialogContent className="sm:max-w-md">
			<DialogHeader>
				<DialogTitle>{title}</DialogTitle>
				<DialogDescription>{words}</DialogDescription>
			</DialogHeader>
			<DialogFooter>
				<Button onClick={onClose}>OK</Button>
			</DialogFooter>
		</DialogContent>
	</Dialog>
);
