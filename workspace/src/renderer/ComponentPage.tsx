import { BookOpenIcon, CodeIcon, SwatchBookIcon, TriangleAlertIcon } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { PREVIEW_HEIGHT, previewAddress } from '../shared/catalog';
import type { CatalogComponent, DesignTokens, StoryPreview } from '../shared/contract';
import { BackButton } from './BackButton';
import { Loading } from './Loading';
import { MoreMenu } from './MoreMenu';
import { Page } from './Page';
import { TOKENS_PANEL } from './panelWidth';
import { ResizablePanel } from './ResizablePanel';
import { TokensPanel } from './TokensPanel';
import { Alert, AlertAction, AlertDescription, AlertTitle } from './ui/alert';
import { Button } from './ui/button';
import { Card, CardContent } from './ui/card';
import { DropdownMenuItem } from './ui/dropdown-menu';

/** A link out, as a menu item. The window opens nothing itself: the app hands an https address to the system's browser. */
const Out = ({ href, icon, children }: { href: string; icon: ReactNode; children: ReactNode }) => (
	<DropdownMenuItem asChild>
		<a href={href} target="_blank" rel="noreferrer">
			{icon}
			{children}
		</a>
	</DropdownMenuItem>
);

/** A component's links, Storybook (when it has a hosted one) and Source, in the More menu the project cards use. */
const ComponentLinks = ({ component }: { component: CatalogComponent }) => (
	<MoreMenu label={`More for ${component.name}`}>
		{component.storybook !== null && (
			<Out href={component.storybook} icon={<BookOpenIcon />}>
				Storybook
			</Out>
		)}
		<Out href={component.source} icon={<CodeIcon />}>
			Source
		</Out>
	</MoreMenu>
);

/** The tallest a frame grows to; past that it scrolls inside. A page saying more is not believed. */
const MAX_FRAME = 4000;

/**
 * One story file, live, in a frame of its own: the library's code runs there and nowhere else. The frame has the local
 * server's origin, which is not the window's, so nothing in it can reach the app (DESIGN_SYSTEM_PLAN.md, P1); its own
 * origin is needed because the library reads `document.cookie` as it loads. The only thing taken from it is its height,
 * and only from this frame.
 */
const StoryFrame = ({ src, title }: { src: string; title: string }) => {
	const frame = useRef<HTMLIFrameElement>(null);
	const [height, setHeight] = useState(120);
	useEffect(() => {
		const heard = (e: MessageEvent) => {
			if (e.source !== frame.current?.contentWindow) return;
			const h = (e.data as Record<string, unknown> | null)?.[PREVIEW_HEIGHT];
			if (typeof h === 'number' && Number.isFinite(h)) setHeight(Math.min(Math.max(Math.ceil(h), 40), MAX_FRAME));
		};
		window.addEventListener('message', heard);
		return () => window.removeEventListener('message', heard);
	}, []);
	return <iframe ref={frame} src={src} title={title} sandbox="allow-scripts allow-same-origin" className="block w-full border-0" style={{ height }} />;
};

/**
 * A component on its own page: its name, line and links, then its stories, live. The previews are built from the
 * library's branch once per commit; `commit` is the one the list was read at, so after a sync that moved it they are
 * asked for again. **Tokens** opens the library's tokens in a resizable panel at the right (decision 21), beside the
 * previews; whether it is open is the tab's, so it stays as it was from one component to the next.
 */
export const ComponentPage = ({
	component,
	commit,
	onBack,
	tokens,
	tokensOpen,
	onTokensOpen,
}: {
	component: CatalogComponent;
	commit: string;
	onBack: () => void;
	tokens: DesignTokens;
	tokensOpen: boolean;
	onTokensOpen: (open: boolean) => void;
}) => {
	const [preview, setPreview] = useState<StoryPreview | { state: 'building' }>({ state: 'building' });

	const build = useCallback(async () => {
		setPreview({ state: 'building' });
		const r = await window.workspace.storyPreview();
		setPreview(r.ok ? r.value : { state: 'failed', error: r.error });
	}, []);
	useEffect(() => {
		void build();
	}, [build, commit]);

	return (
		// The page and, at its right, the tokens panel: the row fills the window under its bars, and each scrolls on its own.
		<div className="flex h-[calc(100dvh-var(--nav-height)-var(--toolbar-height))]">
			<div className="min-w-0 flex-1 overflow-y-auto">
				<Page>
					<div className="flex items-start gap-3">
						<BackButton label="Back to components" className="-ml-2" onClick={onBack} />
						<div className="flex min-w-0 grow flex-col gap-0.5 pt-1">
							<h3 className="text-base font-semibold">{component.name}</h3>
							{component.subtitle && <p className="text-muted-foreground text-sm">{component.subtitle}</p>}
						</div>
						<Button variant={tokensOpen ? 'secondary' : 'outline'} aria-pressed={tokensOpen} onClick={() => onTokensOpen(!tokensOpen)}>
							<SwatchBookIcon />
							Tokens
						</Button>
						<ComponentLinks component={component} />
					</div>

					{preview.state === 'building' ? (
						<div className="flex flex-col items-center gap-4 py-16 text-center">
							<Loading>Building previews…</Loading>
						</div>
					) : preview.state === 'ready' ? (
						<Card className="gap-0 overflow-hidden py-0">
							<CardContent className="px-0">
								<StoryFrame src={previewAddress(preview.base, component.id)} title={component.name} />
							</CardContent>
						</Card>
					) : (
						<Alert variant={preview.state === 'no-packages' ? 'warning' : 'destructive'}>
							<TriangleAlertIcon />
							<AlertTitle>Previews could not be built</AlertTitle>
							<AlertDescription>
								{preview.state === 'no-packages'
									? `The library's packages are not installed in ${preview.root}. Run npm install there, then try again.`
									: preview.state === 'no-library'
										? 'There is no design system library connected.'
										: preview.error}
							</AlertDescription>
							<AlertAction>
								<Button variant="outline" onClick={() => void build()}>
									Try again
								</Button>
							</AlertAction>
						</Alert>
					)}
				</Page>
			</div>
			{tokensOpen && (
				<ResizablePanel panel={TOKENS_PANEL} label="Resize the tokens panel">
					<TokensPanel tokens={tokens} />
				</ResizablePanel>
			)}
		</div>
	);
};
