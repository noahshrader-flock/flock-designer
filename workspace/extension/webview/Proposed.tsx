import type { Divergence, SplitProposal } from '../../src/shared/contract';
import { plural } from '../../src/shared/plural';
import { CHANGE_REQUEST } from '../../src/shared/vocabulary';
import { Button, ButtonRow } from '../../src/ui/Button';
import { Heading } from '../../src/ui/Heading';
import { Message } from '../../src/ui/Message';
import { ValueItem, ValueList } from '../../src/ui/ValueItem';
import type { ProposalControls } from './hooks/useSplitPreview';

/** What a draft has that DSNR did not put there; nothing when it is as DSNR made it. */
const diverged = (d: Divergence | null): string | null => {
	if (d === null || d.state === 'same') return null;
	if (d.state === 'unread') return `Not read: ${d.why}`;
	if (d.state === 'added') return `It has ${plural(d.commits, 'commit')} your branch does not, by ${d.by.join(', ')}: ${d.files.join(', ')}.`;
	return d.sameChange
		? 'Rewritten on GitHub since DSNR opened it, with the same change.'
		: `Rewritten on GitHub since DSNR opened it, and its change is not yours now: ${d.files.join(', ')}.`;
};

/** Each draft opened, what it stands on, and what each has that the person's branch does not; read from git, never written. */
export const Proposed = ({ proposal, controls }: { proposal: SplitProposal; controls: ProposalControls }) => {
	const { parts, baseBranch, opened, seen } = proposal;
	return (
		<div className="value-group" data-split-proposed>
			<Heading size="group">
				<span>{`Proposed: ${plural(parts.length, CHANGE_REQUEST)}`}</span>
				<span className="value-group-note">{`against ${baseBranch}`}</span>
			</Heading>
			<ValueList>
				{parts.map((p, i) => {
					const drifted = diverged(p.divergence);
					return (
						<ValueItem key={p.branch} marks={{ 'data-split-part': p.branch }}>
							<span className="value-cell">
								<span className="value-label">{`${i + 1}. ${p.name}`}</span>
							</span>
							<span className="value-place quiet">
								{p.pullRequest ? <a href={p.pullRequest.url}>{`Draft ${CHANGE_REQUEST} #${p.pullRequest.number}`}</a> : 'Not opened yet'}
								{` · on ${p.on === null ? baseBranch : parts[p.on]!.name}`}
							</span>
							{drifted && (
								<Message tone="warning" marks={{ 'data-split-diverged': p.branch }}>
									{drifted}
								</Message>
							)}
						</ValueItem>
					);
				})}
			</ValueList>
			<Message tone="error">{controls.error}</Message>
			<ButtonRow>
				{opened < parts.length && (
					<Button busy={controls.busy} onPress={() => controls.propose(seen, false)}>
						{controls.busy ? 'Opening…' : 'Continue'}
					</Button>
				)}
				<Button variant="ghost" disabled={controls.busy} onPress={controls.startOver}>
					Start over
				</Button>
			</ButtonRow>
		</div>
	);
};
