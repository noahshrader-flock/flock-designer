import type { Project } from '../shared/contract';
import { RichText } from './RichText';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from './ui/sheet';
import { LinesSkeleton, SkeletonStatus } from './Skeletons';
import { ErrorAlert } from './ErrorAlert';
import { closeUnlessBusy } from './dialogClose';
import { useWorkspace } from './useWorkspace';

/**
 * One file from a project's folder, read out in a panel from the side: the brief, the review notes, the
 * list of iterations. Markdown files are shown as rich text; anything else as the text it is.
 */
export const RecordSheet = ({ project, name, open, onClose }: { project: Project; name: string; open: boolean; onClose: () => void }) => {
	const { value: text, error } = useWorkspace(() => window.workspace.readRecord(project.id, name), [project.id, name]);

	return (
		<Sheet open={open} onOpenChange={closeUnlessBusy(onClose)}>
			<SheetContent className="data-[side=right]:inset-y-auto data-[side=right]:top-(--nav-height) data-[side=right]:h-[calc(100dvh-var(--nav-height))] data-[side=right]:w-full data-[side=right]:sm:max-w-2xl">
				<SheetHeader>
					<SheetTitle className="font-mono">{name}</SheetTitle>
					<SheetDescription>{project.title}</SheetDescription>
				</SheetHeader>
				<div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
					{error && <ErrorAlert error={error} />}
					{text === null && !error && (
						<SkeletonStatus label="Loading the file…">
							<LinesSkeleton count={8} />
						</SkeletonStatus>
					)}
					{text !== null &&
						(!text ? (
							<p className="text-muted-foreground text-sm">This file is empty.</p>
						) : /\.(md|markdown)$/i.test(name) ? (
							<RichText>{text}</RichText>
						) : (
							<pre className="m-0 font-mono text-xs wrap-anywhere whitespace-pre-wrap">{text}</pre>
						))}
				</div>
			</SheetContent>
		</Sheet>
	);
};
