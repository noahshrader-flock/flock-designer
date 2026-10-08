import { BookOpenIcon, CodeIcon } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { PREVIEW_HEIGHT, previewAddress } from '../shared/catalog';
import type { CatalogComponent, CatalogStory, StoryPreview } from '../shared/contract';
import { BackButton } from './BackButton';
import { Loading } from './Loading';
import { MoreMenu } from './MoreMenu';
import { Page } from './Page';
import { Alert, AlertDescription, AlertTitle } from './ui/alert';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { DropdownMenuItem } from './ui/dropdown-menu';

/** The part of a story's title after its group, so a folder with several stories says which is which. */
const storyName = (story: CatalogStory): string => story.title?.split('/').pop() ?? story.file.split('/').pop()!.replace(/\.stories\.tsx$/, '');

/** A link out, as a menu item. The window opens nothing itself: the app hands an https address to the system's browser. */
const Out = ({ href, icon, children }: { href: string; icon: ReactNode; children: ReactNode }) => (
	<DropdownMenuItem asChild>
		<a href={href} target="_blank" rel="noreferrer">
			{icon}
			{children}
		</a>
	</DropdownMenuItem>
);

/** A component's links, Storybook (one per story) and Source, in the More menu the project cards use. */
export const ComponentLinks = ({ component }: { component: CatalogComponent }) => (
	<MoreMenu label={`More for ${component.name}`}>
		{component.stories.map((s) =>
			s.storybook === null ? null : (
				<Out key={s.file} href={s.storybook} icon={<BookOpenIcon />}>
					{component.stories.length > 1 ? `Storybook: ${storyName(s)}` : 'Storybook'}
				</Out>
			),
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
 * A component on its own page: its name, line and links, then each of its story files, live. The previews are built
 * from `develop` once per commit; `commit` is the one the list was read at, so after a sync that moved it they are
 * asked for again.
 */
export const ComponentPage = ({
	component,
	parent,
	commit,
	onBack,
	onOpen,
}: {
	component: CatalogComponent;
	/** The component this one is a part of, when it is one. */
	parent: CatalogComponent | null;
	commit: string;
	onBack: () => void;
	onOpen: (id: string) => void;
}) => {
	const [preview, setPreview] = useState<StoryPreview | { state: 'building' }>({ state: 'building' });

	const build = useCallback(async () => {
		setPreview({ state: 'building' });
		const r = await window.workspace.storyPreview();
		setPreview(r.ok ? r.value : { state: 'failed', error: r.error });
	}, []);
	useEffect(() => {
		if (component.stories.length > 0) void build();
	}, [build, commit, component.stories.length]);

	const tryAgain = (
		<Button variant="secondary" size="sm" onClick={() => void build()}>
			Try again
		</Button>
	);

	return (
		<Page>
			<div className="flex items-start gap-3">
				<BackButton label="Back to components" className="-ml-2" onClick={onBack} />
				<div className="flex min-w-0 grow flex-col gap-0.5 pt-1">
					<h3 className="text-base font-semibold">{component.name}</h3>
					{component.subtitle && <p className="text-muted-foreground text-sm">{component.subtitle}</p>}
				</div>
				<ComponentLinks component={component} />
			</div>

			{component.stories.length === 0 ? (
				<p className="text-muted-foreground text-sm">
					{parent ? (
						<>
							A part of{' '}
							<button type="button" className="text-primary underline underline-offset-4" onClick={() => onOpen(parent.id)}>
								{parent.name}
							</button>
							, shown in its stories.
						</>
					) : (
						'This component has no stories to preview.'
					)}
				</p>
			) : preview.state === 'building' ? (
				<div className="flex flex-col items-center gap-4 py-16 text-center">
					<Loading>Building previews…</Loading>
				</div>
			) : preview.state === 'ready' ? (
				component.stories.map((story) => (
					<Card key={story.file} className="gap-0 overflow-hidden py-0">
						{component.stories.length > 1 && (
							<CardHeader className="border-b py-3">
								<CardTitle className="text-sm font-medium">{storyName(story)}</CardTitle>
							</CardHeader>
						)}
						<CardContent className="px-0">
							<StoryFrame src={previewAddress(preview.base, story.file)} title={`${component.name}: ${storyName(story)}`} />
						</CardContent>
					</Card>
				))
			) : (
				<Alert variant={preview.state === 'no-packages' ? 'warning' : 'destructive'}>
					<AlertTitle>Previews could not be built</AlertTitle>
					<AlertDescription className="flex flex-col items-start gap-3">
						<span>
							{preview.state === 'no-packages'
								? `The library's packages are not installed in ${preview.root}. Run npm install there, then try again.`
								: preview.state === 'no-library'
									? 'There is no design system library connected.'
									: preview.error}
						</span>
						{tryAgain}
					</AlertDescription>
				</Alert>
			)}
		</Page>
	);
};
