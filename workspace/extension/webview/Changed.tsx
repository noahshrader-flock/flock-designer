import type { ReactNode } from 'react';
import { plural } from '../../src/shared/plural';
import { labelOf, readsAs } from '../../src/shared/tokens';
import { CHANGE_REQUEST } from '../../src/shared/vocabulary';
import { type Placing, branchButtons } from './branchButtons';
import { useTokenChanges } from './hooks/tokenChanges';
import type { BranchControls } from './hooks/useChangeBranch';
import type { CatalogComponent, TokenEdit } from '../../src/shared/contract';
import { type HandOverControls, useHandOver } from './hooks/useHandOver';
import { HandOverActions } from './HandOverActions';
import { useShowing } from './Showing';
import { ChangeReach } from './ChangeReach';
import { useAgentName } from './AgentInUse';
import { Button, ButtonRow } from '../../src/ui/Button';
import { Icon } from '../../src/ui/Icon';
import { ChangeRow, ValueList, ValueItem } from '../../src/ui/ValueItem';
import { Swatch } from '../../src/ui/Swatch';
import { LinkButton } from '../../src/ui/LinkButton';
import { Message } from '../../src/ui/Message';
import { Heading } from '../../src/ui/Heading';
import type { Marks } from '../../src/ui/marks';

export const BranchActions = <C,>({
	controls,
	handOver,
	placing = 'found',
}: {
	controls: BranchControls<C>;
	handOver: HandOverControls;
	/** Whether DSNR can write the change where it is; a save it was refused is said as that too. */
	placing?: Placing;
}) => {
	const { branch, unsaved, busy, error, save, propose, startOver } = controls;
	const chromatic = branch?.pullRequest?.chromatic;
	// While a hand-over's branch is shown, nothing is saved or handed over (the core refuses): the note at the top says so.
	const showing = useShowing();
	const agent = useAgentName();
	const offered = branchButtons({
		branch,
		unsaved,
		busy: busy ?? (handOver.busy === null ? null : 'handing'),
		placing: error !== null && branch === null ? 'cannot' : placing,
		held: showing !== null,
		agent,
	});
	if (handOver.branch !== null) return <HandOverActions controls={handOver} />;
	const nothing = branch === null && error === null && handOver.error === null && Object.values(offered).every((o) => o === null);
	if (nothing) return null;
	return (
		<div data-branch-actions className="branch-actions">
			{branch && (
				<p className="quiet branch-line">
					<Icon name="git-branch" />
					<code>{branch.branch}</code> · {plural(branch.saves, 'save')}
				</p>
			)}
			{branch?.pullRequest && (
				<p className="branch-line">
					<a href={branch.pullRequest.url}>{`Draft ${CHANGE_REQUEST} #${branch.pullRequest.number}`}</a>
					{chromatic && <a href={chromatic}>Chromatic</a>}
				</p>
			)}
			<Message tone="error">{handOver.error ?? error}</Message>
			<ButtonRow>
				{offered.save && (
					<Button disabled={offered.save.disabled} onPress={save}>
						{offered.save.label}
					</Button>
				)}
				{offered.process && (
					<Button disabled={offered.process.disabled} onPress={handOver.processChanges}>
						{offered.process.label}
					</Button>
				)}
				{offered.propose && (
					<Button disabled={offered.propose.disabled} onPress={propose}>
						{offered.propose.label}
					</Button>
				)}
				{offered.startOver && (
					<Button variant="ghost" disabled={offered.startOver.disabled} onPress={startOver}>
						Start over
					</Button>
				)}
			</ButtonRow>
		</div>
	);
};

export const ChangesGroup = ({
	label,
	title,
	count,
	onReset,
	rows,
	marks,
	children,
}: {
	label: string;
	title: string;
	count: number;
	onReset: () => void;
	rows: ReactNode;
	marks: Marks;
	children?: ReactNode;
}) => (
	<section aria-label={label} className="changed" {...marks}>
		<div className="changed-header">
			<Heading size="set">
				{title}
				{count > 0 && <span className="section-count"> {count}</span>}
			</Heading>
			{count > 0 && <LinkButton onPress={onReset}>Reset</LinkButton>}
		</div>
		{count > 0 && <ValueList>{rows}</ValueList>}
		{children}
	</section>
);

export const TokenChanges = ({ kept = false, children }: { kept?: boolean; children?: ReactNode }) => {
	const { edits, read, byPath, change, clear } = useTokenChanges();
	// A branch kept with none changed is still listed, so it can be proposed or left.
	if (edits.length === 0 && !kept) return null;
	return (
		<ChangesGroup
			label="Token changes"
			title="Tokens"
			count={edits.length}
			onReset={clear}
			marks={{ 'data-changed-tokens': '' }}
			rows={edits.map((e) => {
				const was = read.get(e.path);
				const now = byPath.get(e.path);
				// A token missing from the library (it moved after the change was made): named, and why it is not tried.
				if (!was || !now)
					return (
						<ValueItem key={e.path} marks={{ 'data-change': e.path }}>
							<span className="value-cell">
								<span className="value-label">{e.path}</span>
							</span>
							<span className="value-place quiet">No longer in the design system, so it is not tried.</span>
						</ValueItem>
					);
				return (
					<ChangeRow
						key={e.path}
						marks={{ 'data-change': e.path }}
						name={labelOf(was)}
						start={now.kind === 'color' && <Swatch value={now.value} />}
						from={readsAs(was, read)}
						to={readsAs(now, byPath)}
						onReset={() => change(was, null)}
					/>
				);
			})}
		>
			{children}
		</ChangesGroup>
	);
};

/** The tokens' card: what is changed, where it is tried, its buttons, and what it affects. */
export const Changed = ({
	id,
	controls,
	components,
}: {
	id: string | null;
	controls: BranchControls<TokenEdit[]>;
	components: CatalogComponent[];
}) => {
	const { edits } = useTokenChanges();
	const handOver = useHandOver({ shown: id, file: null, change: { edits }, watch: true });
	return (
		<TokenChanges kept={controls.branch !== null || handOver.branch !== null}>
			<BranchActions controls={controls} handOver={handOver} />
			<ChangeReach edits={edits} components={components} />
		</TokenChanges>
	);
};

export const TryingNote = ({ count }: { count: number }) =>
	count > 0 ? <Message>Showing the change being tried in the panel ({plural(count, 'token')}).</Message> : null;
