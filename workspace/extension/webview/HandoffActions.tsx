import { useState } from 'react';
import type { BranchReview } from '../../src/shared/contract';
import type { HandoffControls } from '../../src/renderer/useHandoff';
import { plural } from '../../src/shared/plural';
import { LARGE, flagged } from '../../src/shared/processChanges';
import { CHANGE_REQUEST } from '../../src/shared/vocabulary';
import { Button } from './ui/Button';
import { ErrorLine } from './ui/Dialog';
import { Icon } from './ui/Icon';

/** What a hand-over's branch is, as DSNR read it from git: not made yet, made with nothing committed, made from the wrong base, or its size. */
const ReviewLine = ({ review }: { review: BranchReview }) => {
	switch (review.state) {
		case 'missing':
			return (
				<p className="quiet">
					Claude Code makes this branch, by the name its prompt gives, and commits its work there. DSNR reads it from git as it does.
				</p>
			);
		case 'empty':
			return <p className="quiet">The branch is made, and nothing is committed on it yet: Claude Code commits its work there.</p>;
		case 'off-base':
			return (
				<p className="warning-text">
					This branch was not made from the library’s base branch, so it is not proposed. Start over, and process the changes again.
				</p>
			);
		case 'ready':
			return (
				<>
					<p className="quiet">
						{plural(review.files.length, 'file')} changed, {plural(review.lines, 'line')}
					</p>
					{review.large && (
						<p className="warning-text">
							More than {LARGE.files} files or {LARGE.lines} lines: more than one sitting’s review.
						</p>
					)}
				</>
			);
	}
};

/**
 * A unit handed to Claude Code (Process changes), in place of Save while it is in play: its branch, what DSNR read of it from
 * git (each file it changed, with what the rules keep out flagged), its draft pull request once proposed, then Propose, once
 * it is ready, and Start over. A flagged branch is proposed only when the person says so a second time; its pull request then
 * says what was flagged. Start over forgets the hand-over; the branch stays, with any pull request.
 */
export const HandoffActions = ({ controls }: { controls: HandoffControls }) => {
	const { handoff, handed, busy, error, propose, startOver } = controls;
	const [confirming, setConfirming] = useState(false);
	if (handoff === null) return null;
	const { review, pullRequest } = handoff;
	const ready = review.state === 'ready' ? review : null;
	return (
		<div data-handoff className="branch-actions">
			<p className="quiet branch-line">
				<Icon name="git-branch" />
				<code>{handoff.branch}</code>
				{ready && ` · ${plural(ready.commits, 'commit')}`}
			</p>
			{handed && review.state === 'missing' && <p className="quiet">{handed}</p>}
			<ReviewLine review={review} />
			{ready && (
				<ul data-handoff-files className="branch-files">
					{ready.files.map((f) => (
						<li key={f.path} data-out={f.out ?? undefined}>
							<code>{f.path}</code>{' '}
							<span className="quiet">
								+{f.added} −{f.removed}
							</span>
							{f.out && <span className="warning-text"> {`${f.out.charAt(0).toUpperCase()}${f.out.slice(1)}, which the rules keep out`}</span>}
						</li>
					))}
				</ul>
			)}
			{pullRequest && (
				<p className="branch-line">
					<a href={pullRequest.url}>{`Draft ${CHANGE_REQUEST} #${pullRequest.number}`}</a>
				</p>
			)}
			<ErrorLine error={error} />
			{confirming ? (
				<>
					<p className="warning-text">It changes what the rules keep out, or more than one sitting’s review. Its {CHANGE_REQUEST} says so.</p>
					<div className="branch-buttons">
						<Button
							onClick={() => {
								setConfirming(false);
								propose(true);
							}}
						>
							Propose anyway
						</Button>
						<Button variant="ghost" onClick={() => setConfirming(false)}>
							Cancel
						</Button>
					</div>
				</>
			) : (
				<div className="branch-buttons">
					{ready && !pullRequest && (
						<Button disabled={busy !== null} onClick={() => (flagged(ready) ? setConfirming(true) : propose(false))}>
							{busy === 'proposing' ? `Opening a draft ${CHANGE_REQUEST}…` : 'Propose'}
						</Button>
					)}
					<Button variant="ghost" disabled={busy !== null} onClick={startOver}>
						Start over
					</Button>
				</div>
			)}
		</div>
	);
};
