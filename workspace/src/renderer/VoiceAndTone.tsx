import { InfoIcon, RefreshCwIcon } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { VoiceAndTone as Voice } from '../shared/contract';
import { VOICE_SKELETON } from '../shared/voice';
import { BranchActions } from './BranchActions';
import { OutLink } from './OutLink';
import { Page } from './Page';
import { RowsSkeleton, SkeletonStatus } from './Skeletons';
import { Alert, AlertAction, AlertDescription, AlertTitle } from './ui/alert';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';

/**
 * The Voice and tone tab (T9 of the design system plan): the company's voice and tone, one file in the design repository,
 * which every agent task carries. Read from GitHub when the tab is first shown and on Refresh, so a commit made in the
 * repository shows; edited in one text area; saved to a branch of DSNR's, each save one commit, and proposed as a draft
 * pull request, as a change to the tokens is (`BranchActions`). A save is made against the file the text was opened at, so
 * a change made on GitHub meanwhile is shown beside the person's text, to choose between, and never overwritten.
 */
export const VoiceAndTone = ({ hidden }: { hidden: boolean }) => {
	const [voice, setVoice] = useState<Voice | null>(null);
	const [error, setError] = useState<string | null>(null);
	// The text in the area: null while there is no file and none has been started.
	const [draft, setDraft] = useState<string | null>(null);
	// The default branch's file the text was opened at, which a save is made against.
	const [against, setAgainst] = useState<string | null>(null);
	// The file as it is on GitHub now, when a save found it changed since it was opened.
	const [theirs, setTheirs] = useState<Voice | null>(null);
	const [reading, setReading] = useState(false);
	const [busy, setBusy] = useState<'saving' | 'proposing' | null>(null);
	// What went wrong saving or proposing, and whether it was proposing, which GitHub's own page can do instead.
	const [failed, setFailed] = useState<{ error: string; proposing: boolean } | null>(null);
	const started = useRef(false);

	// What the text is compared with to know it is changed: the change as last saved, else the default branch's file.
	const unsaved = draft !== null && draft !== (voice?.branch?.text ?? voice?.text ?? null);

	/** Reads it again; the text in the area is replaced only when it holds nothing unsaved, so typing is never lost. */
	const read = useCallback(async (keepTyped: boolean) => {
		setReading(true);
		const r = await window.workspace.voiceAndTone();
		setReading(false);
		if (!r.ok) return setError(r.error);
		setError(null);
		setVoice(r.value);
		if (!keepTyped) {
			setDraft(r.value.branch?.text ?? r.value.text);
			setAgainst(r.value.sha);
		}
	}, []);

	useEffect(() => {
		if (hidden || started.current) return;
		started.current = true;
		void read(false);
	}, [hidden, read]);

	const save = async () => {
		if (draft === null) return;
		setBusy('saving');
		setFailed(null);
		const r = await window.workspace.saveVoiceAndTone(draft, against);
		setBusy(null);
		if (!r.ok) return setFailed({ error: r.error, proposing: false });
		setVoice(r.value.voice);
		if (r.value.state === 'changed') setTheirs(r.value.voice);
	};

	const propose = async () => {
		setBusy('proposing');
		setFailed(null);
		const r = await window.workspace.proposeVoiceAndTone();
		setBusy(null);
		if (!r.ok) return setFailed({ error: r.error, proposing: true });
		setVoice(r.value);
	};

	const startOver = async () => {
		const r = await window.workspace.forgetVoiceBranch();
		if (!r.ok) return setFailed({ error: r.error, proposing: false });
		setFailed(null);
		await read(false);
	};

	if (voice === null && error !== null) {
		return (
			<Page>
				<Alert>
					<InfoIcon />
					<AlertTitle>Could not read the voice and tone</AlertTitle>
					<AlertDescription>{error}</AlertDescription>
					<AlertAction>
						<Button variant="outline" onClick={() => void read(false)}>
							Try again
						</Button>
					</AlertAction>
				</Alert>
			</Page>
		);
	}
	if (voice === null) {
		return (
			<SkeletonStatus label="Reading the voice and tone…">
				<Page>
					<RowsSkeleton />
				</Page>
			</SkeletonStatus>
		);
	}

	const branch = voice.branch;
	return (
		<Page>
			<div className="flex items-start justify-between gap-4">
				<div className="flex min-w-0 flex-col gap-1">
					<h2 className="text-base font-semibold">Voice and tone</h2>
					<p className="text-muted-foreground text-sm">
						How Flock&apos;s product speaks. Every agent task carries this file, from <span className="font-mono text-xs">{voice.path}</span> in the design
						repository; a product&apos;s own guidance wins where it differs.
					</p>
				</div>
				<Button variant="outline" disabled={reading || busy !== null} onClick={() => void read(unsaved)}>
					<RefreshCwIcon />
					Refresh
				</Button>
			</div>

			{error && (
				<Alert variant="destructive">
					<AlertDescription>{error}</AlertDescription>
				</Alert>
			)}

			{theirs && (
				<Alert>
					<InfoIcon />
					<AlertTitle>The voice and tone changed on GitHub since it was opened</AlertTitle>
					<AlertDescription>
						Nothing was saved. It is below as it is now: use it, or keep your text and save it as a change to it.
						<pre data-voice-now className="bg-muted mt-2 max-h-64 w-full overflow-auto rounded-md p-3 font-mono text-xs whitespace-pre-wrap">
							{theirs.text ?? ''}
						</pre>
					</AlertDescription>
					<AlertAction className="flex gap-2">
						<Button
							variant="outline"
							onClick={() => {
								setDraft(theirs.branch?.text ?? theirs.text);
								setAgainst(theirs.sha);
								setTheirs(null);
							}}
						>
							Use theirs
						</Button>
						<Button
							variant="outline"
							onClick={() => {
								setAgainst(theirs.sha);
								setTheirs(null);
							}}
						>
							Keep mine
						</Button>
					</AlertAction>
				</Alert>
			)}

			{draft === null ? (
				<div className="flex flex-col items-start gap-3 rounded-lg border border-dashed p-6">
					<p className="text-sm">There is no voice and tone file yet. Start it here, and save it to propose it.</p>
					<Button onClick={() => setDraft(VOICE_SKELETON)}>Start the file</Button>
				</div>
			) : (
				<Textarea
					aria-label="Voice and tone"
					value={draft}
					onChange={(e) => setDraft(e.target.value)}
					spellCheck
					className="min-h-[60vh] font-mono text-sm md:text-sm"
				/>
			)}

			{(branch || unsaved || failed) && (
				<BranchActions
					branch={branch}
					unsaved={unsaved}
					busy={busy}
					canSave={theirs === null}
					error={
						failed && (
							<>
								{failed.error}
								{failed.proposing && branch && (
									<span className="mt-1 block">
										<OutLink href={branch.compare}>Open the pull request on GitHub</OutLink>
									</span>
								)}
							</>
						)
					}
					onSave={() => void save()}
					onPropose={() => void propose()}
					onStartOver={() => void startOver()}
				/>
			)}
		</Page>
	);
};
