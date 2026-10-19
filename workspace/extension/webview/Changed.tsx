import type { ReactNode } from 'react';
import { plural } from '../../src/shared/plural';
import { labelOf, readsAs } from '../../src/shared/tokens';
import { CHANGE_REQUEST } from '../../src/shared/vocabulary';
import { branchButtons } from './branchButtons';
import { useTokenChanges } from './hooks/tokenChanges';
import type { BranchControls } from './hooks/useChangeBranch';
import type { TokenEdit } from '../../src/shared/contract';
import { type HandOverControls, useHandOver } from './hooks/useHandOver';
import { HandOverActions } from './HandOverActions';
import { useShowing } from './Showing';
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
	canSave = true,
}: {
	controls: BranchControls<C>;
	handOver: HandOverControls;
	canSave?: boolean;
}) => {
	const { branch, unsaved, busy, error, save, propose, startOver } = controls;
	const chromatic = branch?.pullRequest?.chromatic;
	// While a hand-over's branch is shown, nothing is saved or handed over (the core refuses): the note at the top says so.
	const showing = useShowing();
	const offered = branchButtons({ branch, unsaved, busy, canSave: canSave && handOver.busy === null && showing === null });
	if (handOver.branch !== null) return <HandOverActions controls={handOver} />;
	const processable = branch === null && unsaved;
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
					{chromatic ? (
						<a href={chromatic}>Chromatic</a>
					) : (
						<span className="quiet">Chromatic’s build is linked here once the design system’s CI has made it.</span>
					)}
				</p>
			)}
			<Message tone="error">{error ?? handOver.error}</Message>
			<ButtonRow>
				{offered.save && (
					<Button disabled={offered.save.disabled} onPress={save}>
						{offered.save.label}
					</Button>
				)}
				{processable && (
					<Button variant="secondary" disabled={busy !== null || handOver.busy !== null || showing !== null} onPress={handOver.processChanges}>
						{handOver.busy === 'handing' ? 'Handing to Claude Code…' : 'Process changes'}
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
	onResetAll,
	empty,
	rows,
	marks,
	children,
}: {
	label: string;
	title: string;
	count: number;
	onResetAll: () => void;
	empty: string;
	rows: ReactNode;
	marks: Marks;
	children?: ReactNode;
}) => (
	<section aria-label={label} className="changed" {...marks}>
		<div className="changed-header">
			<Heading size="set">
				{title} <span className="section-count">{count}</span>
			</Heading>
			{count > 0 && <LinkButton onPress={onResetAll}>Reset all</LinkButton>}
		</div>
		{count === 0 ? <Message>{empty}</Message> : <ValueList>{rows}</ValueList>}
		{children}
	</section>
);

export const TokenChanges = () => {
	const { edits, read, byPath, change, clear } = useTokenChanges();
	return (
		<ChangesGroup
			label="Token changes"
			title="Tokens"
			count={edits.length}
			onResetAll={clear}
			empty="Every token is as the design system has it."
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
		/>
	);
};

/** A branch kept with nothing changed is still listed, so it can be proposed or left. */
export const Changed = ({ id, controls }: { id: string | null; controls: BranchControls<TokenEdit[]> }) => {
	const { edits } = useTokenChanges();
	const handOver = useHandOver({ shown: id, file: null, change: { edits }, watch: true });
	return (
		<>
			<TokenChanges />
			{edits.length > 0 && <Message>Tried in the stories of every component open, and in Primitives.</Message>}
			<BranchActions controls={controls} handOver={handOver} />
		</>
	);
};

export const TryingNote = ({ count }: { count: number }) =>
	count > 0 ? <Message>Showing the change being tried in the panel ({plural(count, 'token')}).</Message> : null;
