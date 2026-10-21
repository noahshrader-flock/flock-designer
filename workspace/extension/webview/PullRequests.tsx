import type { CatalogComponent, SplitCheck, SplitPreview, SplitUnit } from '../../src/shared/contract';
import { plural } from '../../src/shared/plural';
import { CHANGE_REQUEST } from '../../src/shared/vocabulary';
import { unitName } from '../../src/shared/valueNames';
import { MOST_SPLIT } from '../../src/shared/processChanges';
import { Button, ButtonRow } from '../../src/ui/Button';
import { Heading } from '../../src/ui/Heading';
import { Message } from '../../src/ui/Message';
import { ValueItem, ValueList } from '../../src/ui/ValueItem';
import type { ProposalControls, SplitControls } from './hooks/useSplitPreview';
import { FileRow } from './FileRow';

type Ready = Extract<SplitPreview, { state: 'ready' }>;

/** In merge order once checked, each with what it stands on; before that, as they were found, and what each stands on unknown. */
const ordered = (preview: Ready): { unit: SplitUnit; on?: SplitUnit | null }[] =>
	preview.check.state === 'built'
		? preview.check.stacks.map((s) => ({ unit: preview.units[s.unit]!, on: s.on === null ? null : preview.units[s.on]! }))
		: preview.units.map((unit) => ({ unit }));

/** Sent on purpose where it is not shown to build, or a part is past one sitting's review: the hand-over's flagged pattern. */
const Propose = ({ preview, proposing, unproven }: { preview: Ready; proposing: ProposalControls; unproven: boolean }) => {
	const flagged = unproven || preview.units.some((u) => u.large);
	return (
		<ButtonRow>
			<Button busy={proposing.busy} onPress={() => proposing.propose(preview.seen, flagged)}>
				{proposing.busy ? 'Opening…' : flagged ? 'Propose anyway' : `Propose ${plural(preview.units.length, CHANGE_REQUEST)}`}
			</Button>
		</ButtonRow>
	);
};

const Checked = ({
	check,
	preview,
	names,
	controls,
	proposing,
}: {
	check: SplitCheck;
	preview: Ready;
	names: ReadonlyMap<string, string>;
	controls: SplitControls;
	proposing: ProposalControls;
}) => {
	switch (check.state) {
		case 'not-checked':
			return (
				<ButtonRow>
					<Button onPress={controls.check}>Check that they build</Button>
				</ButtonRow>
			);
		case 'checking':
			return (
				<>
					<Message waiting marks={{ 'data-split-checking': '' }}>{`Checking ${check.doing}… (${plural(check.done, 'check')} done)`}</Message>
					<ButtonRow>
						<Button variant="ghost" onPress={controls.stop}>
							Stop
						</Button>
					</ButtonRow>
				</>
			);
		case 'built':
			return (
				<>
					<Message marks={{ 'data-split-built': '' }}>{`Each builds on what it stands on, checked by ${check.by} in ${check.seconds} s.`}</Message>
					<Propose preview={preview} proposing={proposing} unproven={false} />
				</>
			);
		case 'cycle':
			return (
				<Message tone="warning" marks={{ 'data-split-refused': '' }}>
					{`${check.units.map((i) => unitName(preview.units[i]!, names)).join(' and ')} each need the other, so they are not split. Propose the whole change as one ${CHANGE_REQUEST} yourself, or split the work so one stands alone.`}
				</Message>
			);
		case 'unproven':
			return (
				<>
					<Message tone="warning" marks={{ 'data-split-unproven': '' }}>
						{`Not checked: ${check.why}`}
					</Message>
					<Propose preview={preview} proposing={proposing} unproven />
				</>
			);
		default:
			return (
				<>
					<Message tone={check.state === 'fails' ? 'error' : 'warning'} marks={{ 'data-split-said': check.state }}>
						{check.why}
					</Message>
					<ButtonRow>
						<Button variant="secondary" onPress={controls.check}>
							Check again
						</Button>
					</ButtonRow>
				</>
			);
	}
};

/** What a split would make, before anything is: nothing here writes to a repository. */
export const PullRequests = ({
	branch,
	components,
	controls,
	proposing,
}: {
	branch: string;
	components: CatalogComponent[];
	controls: SplitControls;
	proposing: ProposalControls;
}) => {
	const { preview, error } = controls;
	const names = new Map(components.map((c) => [c.id, c.name]));
	if (error !== null && preview === null) return <Message tone="error">{error}</Message>;
	if (preview === null) return <Message waiting>Reading what a split would make…</Message>;
	if (preview.state === 'none') return null;
	if (preview.state === 'not-split')
		return (
			<Message tone="warning" marks={{ 'data-split-not-split': '' }}>
				{`This would be ${preview.parts} ${CHANGE_REQUEST}s, one for each component and shared file it changes. DSNR splits a change into at most ${MOST_SPLIT}, as past that it cannot show it is one edit in each: propose it as one ${CHANGE_REQUEST} yourself.`}
			</Message>
		);
	return (
		<div className="value-group" data-split>
			<Heading size="group">
				<span>{plural(preview.units.length, CHANGE_REQUEST)}</span>
				<span className="value-group-note">{`against ${branch}`}</span>
			</Heading>
			<ValueList>
				{ordered(preview).map(({ unit, on }, i) => (
					<ValueItem key={unit.file ?? unit.files[0]?.path} marks={{ 'data-split-unit': unit.file ?? unit.files[0]?.path ?? '' }}>
						<span className="value-cell">
							<span className="value-label">{`${i + 1}. ${unitName(unit, names)}`}</span>
						</span>
						<span className="value-place quiet">
							{[
								`${plural(unit.files.length, 'file')}, ${plural(unit.lines, 'line')}`,
								on === null && `on ${branch}`,
								on && `on ${unitName(on, names)}: it does not build without it`,
								unit.large && 'more than is read in one sitting',
							]
								.filter(Boolean)
								.join(' · ')}
						</span>
					</ValueItem>
				))}
			</ValueList>
			{preview.stays.length > 0 && (
				<>
					<Message>Stays in your branch:</Message>
					<ValueList>
						{preview.stays.map(({ file, why }) => (
							<FileRow key={file.path} path={file.path} said={why} marks={{ 'data-split-stays': file.path }} />
						))}
					</ValueList>
				</>
			)}
			<Message tone="error">{error ?? proposing.error}</Message>
			<Checked check={preview.check} preview={preview} names={names} controls={controls} proposing={proposing} />
		</div>
	);
};
