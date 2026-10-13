import type { Checkout, Project, ProjectIteration } from '../../shared/contract';
import { READY_LINE } from '../../shared/handoff';
import type { BuildPhase } from '../localBuild';
import { AgentLog, Loading } from '../Loading';
import type { useEditor } from '../useEditor';
import { Alert, AlertDescription } from '../ui/alert';
import { Button } from '../ui/button';

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
	<div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-6 text-center">
		<Status {...props} />
	</div>
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
				<p className="text-sm">
					{handedOff === 'editor'
						? 'The conversation continues in VS Code.'
						: 'The command to continue the conversation is copied: paste it into a terminal.'}
				</p>
				<p className="text-muted-foreground max-w-[480px] text-sm">When the work is done there, open the preview to see it here and share it.</p>
				<Button
					onClick={() => {
						onHandedOff(null);
						onSkipAgent();
					}}
				>
					Open the preview
				</Button>
			</>
		);
	if (phase.kind === 'reported')
		return (
			<>
				<p className="text-sm font-semibold">
					{handoffReady === null ? 'Handoff finished' : handoffReady ? READY_LINE : 'Not ready for engineering yet'}
				</p>
				<p className="text-muted-foreground max-w-[480px] text-sm">
					{handoffReady
						? `HANDOFF.md is on ${iteration.branch}. Give the branch to an engineer when you are ready; nothing was pushed.`
						: 'What the agent said is below: what it fixed, and what still stands in the way.'}
				</p>
				<AgentLog lines={log} />
				<div className="flex gap-2">
					{editor.session && (
						<Button variant="secondary" onClick={() => void editor.continueInClaude()}>
							Continue in Claude Code
						</Button>
					)}
					<Button onClick={onSkipAgent}>Open the preview</Button>
				</div>
			</>
		);
	if (phase.kind === 'failed' && !hosted.shown)
		return (
			<>
				<Alert variant="destructive" className="max-w-[560px] text-left">
					<AlertDescription>{phase.message}</AlertDescription>
				</Alert>
				<AgentLog lines={log} />
				<div className="flex gap-2">
					{editor.available && (
						<Button variant="secondary" onClick={() => void editor.openInEditor()}>
							{editor.editor ? 'Open in VS Code' : 'Show in Finder'}
						</Button>
					)}
					{editor.session && (
						<Button variant="secondary" onClick={() => void editor.continueInClaude()}>
							Continue in Claude Code
						</Button>
					)}
					<Button onClick={onRetry}>Try again</Button>
				</div>
			</>
		);
	if (error)
		return (
			<Alert variant="destructive" className="max-w-[560px] text-left">
				<AlertDescription>{error}</AlertDescription>
			</Alert>
		);
	if (hosted.shown && !hosted.up)
		return (
			<>
				<Loading>This preview is still being built.</Loading>
				<p className="text-muted-foreground max-w-[480px] text-sm">
					It opens here by itself as soon as it is ready. A new share takes a few minutes.
				</p>
				<Button variant="secondary" onClick={hosted.openAnyway}>
					Open it anyway
				</Button>
			</>
		);
	if (!prototype && !iteration.previewUrl && !checkout)
		return (
			<>
				<p className="text-sm">DSNR needs the product repository to show this.</p>
				<p className="text-muted-foreground text-sm">It could not find one on this machine. Point it at your product repository once.</p>
				<Button onClick={onChoose}>Find it</Button>
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
			<Loading>{doing}</Loading>
			{phase.kind === 'agent' && (
				<>
					<p className="text-muted-foreground max-w-[480px] text-sm">
						{handingOff
							? 'The agent is running the full check, both reviews and the fixes they call for. This takes a while.'
							: 'The agent is writing it from your request. This takes a few minutes.'}
					</p>
					<AgentLog lines={log} />
					{editor.available && (
						<div className="flex gap-2">
							<Button variant="secondary" onClick={() => void editor.openInEditor()}>
								{editor.editor ? 'Open in VS Code' : 'Show in Finder'}
							</Button>
							{editor.session && (
								<Button
									variant="secondary"
									title="Stops the agent here and continues the same conversation in VS Code"
									onClick={() => void editor.continueInClaude().then(onHandedOff)}
								>
									Take over in Claude Code
								</Button>
							)}
						</div>
					)}
				</>
			)}
			{phase.kind === 'preview' && !prototype && <p className="text-muted-foreground text-sm">The first time can take a minute.</p>}
		</>
	);
};
