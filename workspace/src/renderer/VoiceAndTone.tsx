import { RefreshCwIcon } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { VoiceAndTone as Voice } from '../shared/contract';
import { BranchActions } from './BranchActions';
import { OutLink } from './Links';
import { Page } from './Page';
import { RowsSkeleton, SkeletonStatus } from './Skeletons';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';
import { CHANGE_REQUEST, HOST } from '../shared/vocabulary';
import { ErrorAlert } from './ErrorAlert';
import { Notice, RetryButton } from './Notice';
import { InlineAction } from './Links';
import { PageHeading } from './PageHeading';

/**
 * The Voice and Tone tab (T9 of the design system plan): a product's voice and tone, one file in the connected design system's
 * agent files, which every agent task carries. Read from GitHub when the tab is first shown and on Refresh, so a commit made in the
 * repository shows; edited in one text area, which is always there (blank until the file has been written, so there is
 * nothing to start); saved to a branch of DSNR's, each save one commit, and proposed as a draft
 * pull request, as a change to the tokens is (`BranchActions`). A save is made against the file the text was opened at, so
 * a change made on GitHub meanwhile is shown beside the person's text, to choose between, and never overwritten.
 */
export const VoiceAndTone = ({ hidden }: { hidden: boolean }) => {
	const [voice, setVoice] = useState<Voice | null>(null);
	const [error, setError] = useState<string | null>(null);
	// The text in the area: blank while there is no file.
	const [draft, setDraft] = useState('');
	// The default branch's file the text was opened at, which a save is made against.
	const [against, setAgainst] = useState<string | null>(null);
	// The file as it is on GitHub now, when a save found it changed since it was opened.
	const [theirs, setTheirs] = useState<Voice | null>(null);
	const [reading, setReading] = useState(false);
	const [busy, setBusy] = useState<'saving' | 'proposing' | null>(null);
	// What went wrong saving or proposing, and whether it was proposing, which GitHub's own page can do instead.
	const [failed, setFailed] = useState<{ error: string; proposing: boolean } | null>(null);
	const started = useRef(false);

	// What the text is compared with to know it is changed: the change as last saved, else the default branch's file, else nothing.
	const unsaved = draft !== (voice?.branch?.text ?? voice?.text ?? '');

	/** Reads it again; the text in the area is replaced only when it holds nothing unsaved, so typing is never lost. */
	const read = useCallback(async (keepTyped: boolean) => {
		setReading(true);
		const r = await window.workspace.voiceAndTone();
		setReading(false);
		if (!r.ok) return setError(r.error);
		setError(null);
		setVoice(r.value);
		if (!keepTyped) {
			setDraft(r.value.branch?.text ?? r.value.text ?? '');
			setAgainst(r.value.sha);
		}
	}, []);

	useEffect(() => {
		if (hidden || started.current) return;
		started.current = true;
		void read(false);
	}, [hidden, read]);

	const save = async () => {
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
				<Notice variant="destructive" title="Could not read the voice and tone" action={<RetryButton onClick={() => void read(false)} />}>
					{error}
				</Notice>
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
			<PageHeading
				title="Voice and Tone"
				action={
					<Button variant="outline" disabled={reading || busy !== null} onClick={() => void read(unsaved)}>
						<RefreshCwIcon />
						Refresh
					</Button>
				}
			>
				How the product speaks.
			</PageHeading>

			{error && <ErrorAlert error={error} />}

			{theirs && (
				<Notice
					title={`The voice and tone changed on ${HOST} since it was opened`}
					action={
						<Button
							variant="outline"
							onClick={() => {
								setDraft(theirs.branch?.text ?? theirs.text ?? '');
								setAgainst(theirs.sha);
								setTheirs(null);
							}}
						>
							Use theirs
						</Button>
					}
				>
					Nothing was saved. It is below as it is now: use it, or{' '}
					<InlineAction
						onClick={() => {
							setAgainst(theirs.sha);
							setTheirs(null);
						}}
					>
						keep mine
					</InlineAction>{' '}
					and save it as a change to it.
					<pre data-voice-now className="bg-muted mt-2 max-h-64 w-full overflow-auto rounded-md p-3 font-mono text-xs whitespace-pre-wrap">
						{theirs.text ?? ''}
					</pre>
				</Notice>
			)}

			<Textarea
				aria-label="Voice and tone"
				placeholder="How the product speaks: its voice, the rules it follows, what it never does."
				value={draft}
				onChange={(e) => setDraft(e.target.value)}
				spellCheck
				className="min-h-[60vh] font-mono text-sm md:text-sm"
			/>
			{/* Where it is kept: every agent task carries this file. */}
			<p data-voice-file className="text-muted-foreground -mt-2 font-mono text-xs">
				{voice.repository} · {voice.path}
			</p>

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
										<OutLink href={branch.compare}>{`Open the ${CHANGE_REQUEST} on ${HOST}`}</OutLink>
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
