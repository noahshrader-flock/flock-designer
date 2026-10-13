import type { ReactNode } from 'react';
import type { Checkout, Project, ProjectIteration } from '../../shared/contract';
import { READY_LINE } from '../../shared/handoff';
import type { BuildPhase } from '../localBuild';
import { AgentLog } from '../Loading';
import type { useEditor } from '../useEditor';
import { Button } from '../ui/button';
import { ErrorAlert } from '../ErrorAlert';
import { RetryButton } from '../Notice';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '../ui/empty';
import { Spinner } from '../ui/spinner';

type Editor = ReturnType<typeof useEditor>;

/**
 * What the slot says before the page is open, one state at a time: the work handed to the person's editor, a Handoff's
 * report, a build that failed, an error, a shared preview still being built, no product repository to build it with, and
 * otherwise where the build has got to.
 */
export const PreviewStatus = (props: {
	project: Project;
	iteration: ProjectIteration;
	prototype: boolean;
	checkout: Checkout | null;
	phase: BuildPhase;
	log: string[];
	editor: Editor;
	error: string | null;
	/** The conversation was taken over in the person's editor or a terminal, so the screen waits for them. */
	handedOff: 'editor' | 'terminal' | null;
	onHandedOff: (to: 'editor' | 'terminal' | null) => void;
	/** A Handoff's verdict: ready for engineering, not yet, or not known. */
	handoffReady: boolean | null;
	/** The shared preview is shown instead of a build here, and whether it answers yet. */
	hosted: { shown: boolean; up: boolean; openAnyway: () => void };
	onRetry: () => void;
	/** Straight to the preview: the work was finished somewhere else. */
	onSkipAgent: () => void;
	onChoose: () => void;
}) => (
	<Empty className="absolute inset-0">
		<Status {...props} />
	</Empty>
);

/** What a state says: its title, and what to know, in shadcn's empty state. */
const Says = ({ title, children, working }: { title: ReactNode; children?: ReactNode; working?: boolean }) => (
	<EmptyHeader>
		{working && (
			<EmptyMedia>
				<Spinner className="size-6" />
			</EmptyMedia>
		)}
		<EmptyTitle>{title}</EmptyTitle>
		{children && <EmptyDescription>{children}</EmptyDescription>}
	</EmptyHeader>
);

/** Open the work in the person's editor, and carry on the agent's conversation there, when they can be. */
const InEditor = ({ editor, takeOver }: { editor: Editor; takeOver?: (to: 'editor' | 'terminal' | null) => void }) => (
	<>
		{editor.available && (
			<Button variant="secondary" onClick={() => void editor.openInEditor()}>
				{editor.editor ? 'Open in VS Code' : 'Show in Finder'}
			</Button>
		)}
		{editor.session &&
			(takeOver ? (
				<Button
					variant="secondary"
					title="Stops the agent here and continues the same conversation in VS Code"
					onClick={() => void editor.continueInClaude().then(takeOver)}
				>
					Take over in Claude Code
				</Button>
			) : (
				<Button variant="secondary" onClick={() => void editor.continueInClaude()}>
					Continue in Claude Code
				</Button>
			))}
	</>
);

const Status = ({
	project,
	iteration,
	prototype,
	checkout,
	phase,
	log,
	editor,
	error,
	handedOff,
	onHandedOff,
	handoffReady,
	hosted,
	onRetry,
	onSkipAgent,
	onChoose,
}: Parameters<typeof PreviewStatus>[0]) => {
	if (handedOff)
		return (
			<>
				<Says
					title={
						handedOff === 'editor'
							? 'The conversation continues in VS Code.'
							: 'The command to continue the conversation is copied: paste it into a terminal.'
					}
				>
					When the work is done there, open the preview to see it here and share it.
				</Says>
				<EmptyContent>
					<Button
						onClick={() => {
							onHandedOff(null);
							onSkipAgent();
						}}
					>
						Open the preview
					</Button>
				</EmptyContent>
			</>
		);
	if (phase.kind === 'reported')
		return (
			<>
				<Says title={handoffReady === null ? 'Handoff finished' : handoffReady ? READY_LINE : 'Not ready for engineering yet'}>
					{handoffReady
						? `HANDOFF.md is on ${iteration.branch}. Give the branch to an engineer when you are ready; nothing was pushed.`
						: 'What the agent said is below: what it fixed, and what still stands in the way.'}
				</Says>
				<AgentLog lines={log} />
				<EmptyContent className="flex-row justify-center">
					{editor.session && (
						<Button variant="secondary" onClick={() => void editor.continueInClaude()}>
							Continue in Claude Code
						</Button>
					)}
					<Button onClick={onSkipAgent}>Open the preview</Button>
				</EmptyContent>
			</>
		);
	if (phase.kind === 'failed' && !hosted.shown)
		return (
			<>
				<ErrorAlert error={phase.message} className="max-w-xl text-left" />
				<AgentLog lines={log} />
				<EmptyContent className="flex-row justify-center">
					<InEditor editor={editor} />
					<RetryButton onClick={onRetry} />
				</EmptyContent>
			</>
		);
	if (error) return <ErrorAlert error={error} className="max-w-xl text-left" />;
	if (hosted.shown && !hosted.up)
		return (
			<>
				<Says working title="This preview is still being built.">
					It opens here by itself as soon as it is ready. A new share takes a few minutes.
				</Says>
				<EmptyContent>
					<Button variant="secondary" onClick={hosted.openAnyway}>
						Open it anyway
					</Button>
				</EmptyContent>
			</>
		);
	if (!prototype && !iteration.previewUrl && !checkout)
		return (
			<>
				<Says title="DSNR needs the product repository to show this.">
					It could not find one on this machine. Point it at your product repository once.
				</Says>
				<EmptyContent>
					<Button onClick={onChoose}>Find it</Button>
				</EmptyContent>
			</>
		);
	const handingOff = phase.kind === 'agent' && phase.handoff === true;
	const doing = handingOff
		? `Handing off ${project.title}…`
		: phase.kind === 'agent' && phase.accessibility
			? 'Fixing what the accessibility check found…'
			: phase.kind === 'agent'
				? `Building ${project.title}…`
				: phase.kind === 'preview'
					? 'Starting the preview…'
					: 'Opening the preview…';
	return (
		<>
			<Says working title={doing}>
				{phase.kind === 'agent'
					? handingOff
						? 'The agent is running the full check, both reviews and the fixes they call for. This takes a while.'
						: 'The agent is writing it from your request. This takes a few minutes.'
					: phase.kind === 'preview' && !prototype
						? 'The first time can take a minute.'
						: undefined}
			</Says>
			{phase.kind === 'agent' && (
				<>
					<AgentLog lines={log} />
					{editor.available && (
						<EmptyContent className="flex-row justify-center">
							<InEditor editor={editor} takeOver={onHandedOff} />
						</EmptyContent>
					)}
				</>
			)}
		</>
	);
};
