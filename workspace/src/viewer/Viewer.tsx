import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { commentRef } from '../shared/comments';
import type { CommentRef, ReviewComment } from '../shared/contract';
import type { CommentStore } from './comments/surfaces';
import { prototypeKey } from '../shared/designPaths';
import { withState } from '../shared/prototypeStates';
import { withTheme } from '../shared/prototypeTheme';
import { type ShownTheme, useShownTheme } from './useShownTheme';
import { prototypeAddressed } from './comments/addressed';
import { CommentBox } from './comments/CommentBox';
import { CommentControl } from './comments/CommentControl';
import { useComments } from './comments/useComments';
import { VersionSwitcher, StateSwitcher, ThemeSwitcher } from './VersionSwitcher';
import { Button, ButtonRow } from '../ui/Button';
import { Dialog } from '../ui/Dialog';
import { Heading } from '../ui/Heading';
import { IconButton } from '../ui/IconButton';
import type { MenuItem } from '../ui/Menu';
import { Spinner } from '../ui/Spinner';
import { Message } from '../ui/Message';
import { browserComments, framePage, saveToken, savedToken, tokenApi } from './browserAdapter';
import { NOTE_WORDS, type SignInConfig, type SignInNote, signedInJustNow, startSignIn } from './signIn';
import { userOf } from '../codeHost/github';
import type { GitHubUser } from '../shared/domain/account';
import { AccountMenu } from './AccountMenu';
import { type Relay, loginIn, relayComments } from './relay';
import { CommentsPanel } from './comments/CommentsPanel';
import { BehindLatest } from './BehindLatest';
import { useOpenOnError } from './comments/useOpenOnError';
import { useReloadOnSaved } from './comments/useReloadOnSaved';

export interface ViewerConfig {
	owner: string;
	repo: string;
	prototypeId: string;
	name: string;
	title: string;
	/** The prototype's folder, relative to this page: a version is `${prototypeHref}${name}/`. */
	prototypeHref: string;
	/** The page of all prototypes, relative to this page; null in VS Code's tab, where the version's dropdown is the way about. */
	prototypesHref: string | null;
	/** `href` is relative to this page. */
	versions: { name: string; href: string; from?: string }[];
	/** Not there on a page built before pages said. */
	states?: string[];
	/** The page's fingerprint; not there on a page built before pages said. */
	page?: string;
}

/** What the page says, as it is given to the bar: in a frame (VS Code's tab) there is no page of prototypes to go back to. */
export const readConfig = (text: string | null, framed: boolean): ViewerConfig => {
	const given = JSON.parse(text ?? '{}') as ViewerConfig;
	return framed ? { ...given, prototypesHref: null } : given;
};

export interface ViewerSlots {
	bar: HTMLElement;
	panel: HTMLElement;
	frame: HTMLIFrameElement;
}

// Kept above the bar, which is drawn again on signing in or out.
type Showing = { states: string[]; state: string | null; onState: (state: string | null) => void; theme: ShownTheme };

const NO_AGENT_MS = 8000;
const NO_AGENT = 'This page cannot show its comments’ pins: it was built without DSNR’s page agent. Build the site again.';

const PageBar = ({
	config,
	slots,
	showing,
	before,
	children,
}: {
	config: ViewerConfig;
	slots: ViewerSlots;
	showing: Showing;
	/** Beside the switchers, first: what is said of the version they switch. */
	before?: ReactNode;
	children: ReactNode;
}) => {
	const versions = useMemo(
		() => config.versions.map((v) => ({ ...v, branch: prototypeKey(config.prototypeId, v.name) })),
		[config.versions, config.prototypeId],
	);
	// No background of its own and no line under it, so it does not look like part of the prototype it is over.
	return createPortal(
		<div className="viewer-bar">
			{config.prototypesHref !== null && <IconButton icon="chevron-left" label="Back to all prototypes" href={config.prototypesHref} />}
			<Heading size="page">{config.title}</Heading>
			<ButtonRow>
				{before}
				<VersionSwitcher
					current={{ name: config.name, branch: prototypeKey(config.prototypeId, config.name) }}
					siblings={versions}
					onSelect={(next) => void (location.href = next.href)}
				/>
				<StateSwitcher states={showing.states} current={showing.state} onSelect={showing.onState} />
				<ThemeSwitcher shown={showing.theme} />
				{children}
			</ButtonRow>
		</div>,
		slots.bar,
	);
};

export const Viewer = ({
	config,
	slots,
	relay = null,
	openedHere = false,
	signIn = null,
	note = null,
	saved = 0,
}: {
	config: ViewerConfig;
	slots: ViewerSlots;
	relay?: Relay | null;
	/** How many times this version's page has been saved since this one opened, as DSNR says. */
	saved?: number;
	/** None where the site was built without signing in. */
	signIn?: SignInConfig | null;
	note?: SignInNote | null;
	/** Served from this machine with no way to ask DSNR: opened some other way than DSNR's Open in browser. */
	openedHere?: boolean;
}) => {
	const [token, setToken] = useState<string | null>(savedToken);
	const [askedHere, setAskedHere] = useState(false);
	const [said, setSaid] = useState<SignInNote | null>(note);
	const [user, setUser] = useState<GitHubUser | null>(null);
	const [shownState, setShownState] = useState<string | null>(null);
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
	const branch = prototypeKey(config.prototypeId, config.name);
	const github = useMemo(
		() =>
			token
				? tokenApi(token, undefined, () => {
						// Ended: through GitHub again, which comes straight back for an App already approved; unless it was
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
		() =>
			github
				? browserComments(github, { owner: config.owner, repo: config.repo }, { prototypeId: config.prototypeId, branch, page: config.page })
				: null,
		[github, config, branch],
	);
	useEffect(() => {
		setUser(null);
		if (github) void userOf(github).then(setUser, () => setUser(null));
	}, [github]);
	if (relay) return <InDsnr config={config} slots={slots} showing={showing} relay={relay} saved={saved} />;
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
					{/* Hidden on a phone (`.viewer-sign-in`): commenting needs a computer, and the bar's room goes to the title. */}
					{(signIn || openedHere) && (
						<span className="viewer-sign-in">
							<Button variant="secondary" onPress={() => (openedHere ? setAskedHere(true) : signIn && void startSignIn(signIn, window))}>
								Sign in to comment
							</Button>
						</span>
					)}
				</PageBar>
			)}
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

const InDsnr = ({
	config,
	slots,
	showing,
	relay,
	saved,
}: {
	config: ViewerConfig;
	slots: ViewerSlots;
	showing: Showing;
	relay: Relay;
	saved: number;
}) => {
	const [login, setLogin] = useState<string | null | undefined>(undefined);
	const [addressing, setAddressing] = useState<number | null>(null);
	useEffect(() => {
		void relay.ask('signInState', []).then((r) => setLogin(loginIn(r)));
	}, [relay]);
	const store = useMemo(
		() => relayComments(relay, { prototypeId: config.prototypeId, branch: prototypeKey(config.prototypeId, config.name), page: config.page }),
		[relay, config],
	);
	const [signingIn, setSigningIn] = useState(false);
	const signIn = async () => {
		setSigningIn(true);
		const signedIn = loginIn(await relay.ask('signIn', []));
		setSigningIn(false);
		if (signedIn !== null) setLogin(signedIn);
	};
	const address = async (comment: CommentRef, newVersion: boolean) => {
		setAddressing(comment.id);
		// On this page's own version: in the browser, the page may have moved to another since it was opened.
		await relay.ask('address', [comment, prototypeKey(config.prototypeId, config.name), newVersion]);
		setAddressing(null);
	};
	if (login === undefined) return null;
	const version = prototypeKey(config.prototypeId, config.name);
	/** How far the version's base is behind the latest of its branch. */
	const builtOn = <BehindLatest relay={relay} branch={version} />;
	if (login === null)
		return (
			<PageBar config={config} slots={slots} showing={showing} before={builtOn}>
				<Button variant="secondary" busy={signingIn} onPress={() => void signIn()}>
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
			saved={saved}
			before={builtOn}
			actions={(comment: ReviewComment): MenuItem[] =>
				comment.resolved
					? []
					: [
							{
								label: addressing === comment.id ? 'Opening…' : 'Address',
								icon: addressing === comment.id ? <Spinner /> : 'sparkle',
								disabled: addressing !== null,
								onSelect: () => void address(commentRef(comment), false),
							},
							{
								label: 'Address in a new version',
								icon: 'copy',
								disabled: addressing !== null,
								onSelect: () => void address(commentRef(comment), true),
							},
						]
			}
		/>
	);
};

const Commenting = ({
	config,
	slots,
	showing,
	store,
	saved = 0,
	before,
	account,
	actions,
}: {
	config: ViewerConfig;
	slots: ViewerSlots;
	showing: Showing;
	store: CommentStore;
	/** How many times this version's page has been saved since this one opened, as DSNR says. */
	saved?: number;
	/** In the bar, before the switchers. */
	before?: ReactNode;
	account?: ReactNode;
	actions?: (comment: ReviewComment) => MenuItem[];
}) => {
	const page = useMemo(() => framePage(slots.frame), [slots.frame]);
	const [error, setError] = useState<string | null>(null);
	const [opened, setOpened] = useState(false);
	const [route, setRoute] = useState<string | null>(null);
	const [listOpen, setListOpen] = useState(false);

	// A page that never says it is up, from when the bar starts (it may have loaded first, as in VS Code) or from its next
	// load, has no agent (a site built before it): said, not left silently without pins.
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
	useReloadOnSaved(saved, comments.composing);
	useOpenOnError(error, () => setListOpen(true));

	const frameBox = slots.frame.getBoundingClientRect();
	return (
		<>
			<PageBar config={config} slots={slots} showing={showing} before={before}>
				<CommentControl comments={comments} listOpen={listOpen} onToggleList={() => setListOpen((o) => !o)} disabled={!opened} />
				{account}
			</PageBar>
			{listOpen &&
				createPortal(
					<div className="viewer-panel">
						<CommentsPanel
							comments={comments}
							error={error}
							{...(actions ? { actions } : {})}
							states={showing.states}
							onShowState={showing.onState}
							shownTheme={showing.theme}
							page={config.page}
							addressed={(c) => prototypeAddressed(c, config.name)}
						/>
					</div>,
					slots.panel,
				)}
			{comments.composing && <CommentBox comments={comments} origin={{ top: frameBox.top, left: frameBox.left }} error={error} />}
		</>
	);
};

const Said = ({ title, words, onClose }: { title: string; words: string | null; onClose: () => void }) =>
	words === null ? null : (
		<Dialog title={title} onClose={onClose}>
			<Message>{words}</Message>
		</Dialog>
	);
