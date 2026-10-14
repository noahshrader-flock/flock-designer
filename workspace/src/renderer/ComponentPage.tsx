import { BookOpenIcon, CodeIcon } from 'lucide-react';
import { previewAddress } from '../shared/catalog';
import type { CatalogComponent, TokenEdit } from '../shared/contract';
import { useStoryPreview } from './useStoryPreview';
import { BackButton } from './BackButton';
import { Loading } from './Loading';
import { SkeletonStatus } from './Skeletons';
import { StoryFrame } from './StoryFrame';
import { MoreMenu } from './MoreMenu';
import { Page } from './Page';
import { Card, CardContent } from './ui/card';
import { Skeleton } from './ui/skeleton';
import { Notice, RetryButton } from './Notice';
import { MenuLink } from './Links';

/** A component's links, Storybook (when it has a hosted one) and Source, in its More menu. */
const ComponentLinks = ({ component }: { component: CatalogComponent }) => (
	<MoreMenu label={`More for ${component.name}`}>
		{component.storybook !== null && (
			<MenuLink href={component.storybook} icon={<BookOpenIcon />}>
				Storybook
			</MenuLink>
		)}
		<MenuLink href={component.source} icon={<CodeIcon />}>
			Source
		</MenuLink>
	</MoreMenu>
);

/**
 * A component on its own page: its name, line and links, then its stories, live. The previews are built from the
 * library's branch once per commit; `commit` is the one the list was read at, so after a sync that moved it they are
 * asked for again.
 *
 * **With a change to the tokens** (`edits`, T3), they are built with it: the stories shown stay while it builds, with
 * "Building…" over them, and are replaced when it is built; a change that cannot be tried says why above them. Only the
 * answer to the newest ask is shown.
 */
export const ComponentPage = ({
	component,
	commit,
	edits,
	onBack,
}: {
	component: CatalogComponent;
	commit: string;
	edits: TokenEdit[];
	onBack: () => void;
}) => {
	const { preview, trying, refused, retry } = useStoryPreview(commit, edits);

	return (
		<Page>
			<div className="flex items-start gap-3">
				<BackButton label="Back to components" className="-ml-2" onClick={onBack} />
				<div className="flex min-w-0 grow flex-col gap-0.5 pt-1">
					<h2 data-component-title className="text-base font-semibold">
						{component.name}
					</h2>
					{component.subtitle && <p className="text-muted-foreground text-sm">{component.subtitle}</p>}
				</div>
				<ComponentLinks component={component} />
			</div>

			{preview.state === 'building' ? (
				// Where the stories will be drawn, until they are.
				<SkeletonStatus label="Building previews…">
					<Skeleton className="h-80 w-full rounded-xl" />
				</SkeletonStatus>
			) : preview.state === 'ready' ? (
				<>
					{refused && (
						<Notice variant="destructive" title="This change could not be tried">
							{refused}
						</Notice>
					)}
					<Card className="relative gap-0 overflow-hidden py-0" aria-busy={trying}>
						<CardContent className="px-0">
							<StoryFrame src={previewAddress(preview.base, component.id)} title={component.name} />
						</CardContent>
						{trying && (
							<div className="bg-background/60 absolute inset-0 flex items-start justify-center pt-6">
								<Loading>Building…</Loading>
							</div>
						)}
					</Card>
				</>
			) : (
				<Notice
					variant={preview.state === 'no-packages' ? 'warning' : 'destructive'}
					title="Previews could not be built"
					action={<RetryButton onClick={retry} />}
				>
					{preview.state === 'no-packages'
						? `The library's packages are not installed in ${preview.root}. Run npm install there, then try again.`
						: preview.state === 'no-library'
							? 'There is no design system library connected.'
							: preview.error}
				</Notice>
			)}
		</Page>
	);
};
