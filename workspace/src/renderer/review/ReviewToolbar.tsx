import { CloudUploadIcon, ExternalLinkIcon, FolderIcon, GitBranchIcon, PackageCheckIcon, TriangleAlertIcon } from 'lucide-react';
import type { Checkout, IterationKind, PageStatus, Project, ProjectIteration } from '../../shared/contract';
import { prototypePagePath } from '../../shared/designPaths';
import { AccessibilityStatus } from '../AccessibilityStatus';
import { BackButton } from '../BackButton';
import { CommentControl } from '../comments/CommentControl';
import type { useComments } from '../comments/useComments';
import { IterationSwitcher, StateSwitcher, ThemeSwitcher } from '../IterationSwitcher';
import type { ShownTheme } from '../useShownTheme';
import type { BuildPhase } from '../localBuild';
import { ShareControl } from '../ShareControl';
import { Toolbar, ToolbarEnd } from '../Toolbar';
import type { useEditor } from '../useEditor';
import { Button } from '../ui/button';
import { LocationHint } from '../LocationHint';

/**
 * The review screen's toolbar: where you are and the way back, what the accessibility check found, and at the right what
 * can be done: the uncommitted changes, the published page, the iteration and state switcher, comments, Hand off (codebase
 * work's next step, so it is the one filled button) and the share menu.
 */
export const ReviewToolbar = ({
	project,
	iteration,
	prototype,
	kind,
	siblings,
	checkout,
	phase,
	editor,
	published,
	states,
	shownState,
	onShowState,
	shownTheme,
	comments,
	listOpen,
	onToggleList,
	opened,
	onBack,
	onOpen,
	onHandOff,
	onBuildInCodebase,
	onViewRecord,
	onAssignFolder,
	setError,
}: {
	project: Project;
	iteration: ProjectIteration;
	/** A page the app serves itself (an older prototype on an `fd/` branch is code, and opens like codebase work). */
	prototype: boolean;
	/** The kind of work, whichever way it is opened. */
	kind: IterationKind;
	siblings: ProjectIteration[];
	checkout: Checkout | null;
	phase: BuildPhase;
	editor: ReturnType<typeof useEditor>;
	published: { page: PageStatus; publish: () => void; openPage: () => void };
	states: string[];
	shownState: string | null;
	onShowState: (state: string | null) => void;
	/** The theme a prototype is shown in, and choosing the other. */
	shownTheme: ShownTheme;
	comments: ReturnType<typeof useComments>;
	listOpen: boolean;
	onToggleList: () => void;
	opened: boolean;
	onBack: () => void;
	onOpen: (project: Project, iteration: ProjectIteration) => void;
	onHandOff?: () => void;
	onBuildInCodebase?: () => void;
	onViewRecord: (name: string) => void;
	onAssignFolder: () => void;
	setError: (error: string) => void;
}) => {
	const { page } = published;
	const where = prototype ? prototypePagePath(project.id, iteration.name) : iteration.branch;
	return (
		<Toolbar>
			<BackButton label="Back to projects" className="-mr-2 -ml-2" onClick={onBack} />
			{/* The iteration is named by the switcher beside the comments, which is always shown. */}
			<h1 className="truncate text-sm font-semibold">{project.title}</h1>
			<LocationHint icon={prototype ? FolderIcon : GitBranchIcon} label={`${prototype ? 'Saved at' : 'Branch'} ${where}`} value={where} />
			{/* What the automated accessibility check found on the page, each time it is opened (T7): beside where it is saved. */}
			{kind === 'prototype' && <AccessibilityStatus projectId={project.id} name={iteration.name} opened={phase.kind === 'running' ? phase : null} />}
			<ToolbarEnd>
				{phase.kind === 'running' && phase.uncommitted && (
					<Button
						variant="ghost"
						title={`${checkout?.name ?? 'The checkout'} has changes nobody committed. ${editor.session ? 'Continue in Claude Code to finish them' : 'Open it in VS Code to look'}, or commit them yourself.`}
						onClick={() => void (editor.session ? editor.continueInClaude() : editor.openInEditor())}
					>
						<TriangleAlertIcon />
						Uncommitted changes
					</Button>
				)}
				{page.state === 'published' && (
					<Button title="Its page on the published site" onClick={published.openPage}>
						<ExternalLinkIcon />
						Open page
					</Button>
				)}
				{page.state === 'publishing' && (
					<Button variant="outline" disabled>
						Publishing…
					</Button>
				)}
				{(page.state === 'unpublished' || page.state === 'unavailable') && (
					// Publishing happens by itself; this is asking for it now, after it stopped or before it would.
					<Button variant="outline" title={page.why ?? 'Saved, but not on its page yet'} onClick={published.publish}>
						<CloudUploadIcon />
						Publish
					</Button>
				)}
				<IterationSwitcher
					current={iteration}
					siblings={siblings}
					grouped={kind === 'prototype'}
					onSelect={(next) => onOpen(project, next)}
					note={(i) => (i.localOnly && !project.localOnly ? ' · only on this machine' : '')}
				>
					<StateSwitcher states={states} current={shownState} onSelect={onShowState} />
				</IterationSwitcher>
				{prototype && <ThemeSwitcher shown={shownTheme} />}
				<CommentControl comments={comments} listOpen={listOpen} onToggleList={onToggleList} disabled={!opened} />
				{onHandOff && (
					<Button onClick={onHandOff}>
						<PackageCheckIcon />
						Hand off
					</Button>
				)}
				<ShareControl
					checkout={checkout}
					project={project}
					iteration={iteration}
					canOpen={opened}
					onOpenInBrowser={() => void window.workspace.openPreviewInBrowser().then((r) => !r.ok && setError(r.error))}
					prototype={prototype}
					onBuildInCodebase={onBuildInCodebase}
					editor={editor.available ? editor : undefined}
					onViewRecord={onViewRecord}
					onAssignFolder={onAssignFolder}
				/>
			</ToolbarEnd>
		</Toolbar>
	);
};
