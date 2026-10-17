import { plural } from '../../src/shared/plural';
import { labelOf, readsAs } from '../../src/shared/tokens';
import { CHANGE_REQUEST } from '../../src/shared/vocabulary';
import { branchButtons } from '../../src/shared/branchButtons';
import { useTokenChanges } from '../../src/renderer/tokenChanges';
import type { BranchControls } from '../../src/renderer/useChangeBranch';
import type { TokenBranchControls } from '../../src/renderer/useTokenBranch';
import { type HandoffControls, useHandoff } from '../../src/renderer/useHandoff';
import { HandoffActions } from './HandoffActions';
import { useShowing } from './Showing';
import { Button } from './ui/Button';
import { ErrorLine } from './ui/Dialog';
import { Icon } from './ui/Icon';
import { IconButton } from './ui/IconButton';
import { Swatch } from './ui/Swatch';

/**
 * What can be done with a change once it is tried (6.2, the app's T4 and T5; a component's values, Phase 4): its branch and
 * how many saves, its draft pull request once proposed, with Chromatic's build when the design system's CI has linked one,
 * what went wrong, then Save (to a branch, the first time), Propose and Start over, as the app offers them
 * (`branchButtons`); Save also waits on what must be settled first (`canSave`). Start over forgets the branch, which stays
 * on GitHub with any pull request. With nothing kept yet, Process changes beside Save hands the change to Claude Code
 * instead (PROCESS_CHANGES_PLAN); a change has one branch in play, so once handed over its hand-off is shown in Save's
 * place (`HandoffActions`), and with a branch saved, Process changes is not offered, each until it is started over.
 */
export const BranchActions = <C,>({
	controls,
	handoff,
	canSave = true,
}: {
	controls: BranchControls<C>;
	handoff: HandoffControls;
	canSave?: boolean;
}) => {
	const { branch, unsaved, busy, error, save, propose, startOver } = controls;
	const chromatic = branch?.pullRequest?.chromatic;
	// While a hand-over's branch is shown, nothing is saved or handed over (the core refuses): the note at the top says so.
	const showing = useShowing();
	const offered = branchButtons({ branch, unsaved, busy, canSave: canSave && handoff.busy === null && showing === null });
	if (handoff.handoff !== null) return <HandoffActions controls={handoff} />;
	// Nothing kept, and something changed: what Save would be offered for.
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
			<ErrorLine error={error ?? handoff.error} />
			<div className="branch-buttons">
				{offered.save && (
					<Button disabled={offered.save.disabled} onClick={save}>
						{offered.save.label}
					</Button>
				)}
				{processable && (
					<Button variant="secondary" disabled={busy !== null || handoff.busy !== null || showing !== null} onClick={handoff.processChanges}>
						{handoff.busy === 'handing' ? 'Handing to Claude Code…' : 'Process changes'}
					</Button>
				)}
				{offered.propose && (
					<Button disabled={offered.propose.disabled} onClick={propose}>
						{offered.propose.label}
					</Button>
				)}
				{offered.startOver && (
					<Button variant="ghost" disabled={offered.startOver.disabled} onClick={startOver}>
						Start over
					</Button>
				)}
			</div>
		</div>
	);
};

/**
 * The token changes being tried (6.2), as the Tokens group of a Changes dialog, in the panel and in a component's tab: each
 * change, from what the design system has to what it is now, with a reset for each and for all.
 */
export const TokenChanges = () => {
	const { edits, read, byPath, change, clear } = useTokenChanges();
	return (
		<section aria-label="Token changes" data-changed-tokens className="changed">
			<div className="changed-header">
				<span className="changed-title">
					Tokens <span className="section-count">{edits.length}</span>
				</span>
				{edits.length > 0 && (
					<button type="button" className="link" onClick={clear}>
						Reset all
					</button>
				)}
			</div>
			{edits.length === 0 ? (
				<p className="quiet">Every token is as the design system has it.</p>
			) : (
				<ul className="tokens">
					{edits.map((e) => {
						const was = read.get(e.path);
						const now = byPath.get(e.path);
						// A token the library no longer has (it moved since the change was made): named, and nothing else said of it.
						if (!was || !now)
							return (
								<li key={e.path} data-change={e.path} className="token">
									<span className="token-name">{e.path}</span>
									<span className="change-values">No longer in the design system, so it is not tried.</span>
								</li>
							);
						return (
							<li key={e.path} data-change={e.path} className="token">
								<span className="token-line">
									{now.kind === 'color' && <Swatch value={now.value} />}
									<span className="token-name">{labelOf(was)}</span>
								</span>
								{/* Under its name, so a long name and its values each have the row's width. */}
								<span className="change-values">
									{readsAs(was, read)} → {readsAs(now, byPath)}
								</span>
								<span className="item-actions">
									<IconButton size="small" icon="discard" label={`Reset ${labelOf(was)}`} onClick={() => change(was, null)} />
								</span>
							</li>
						);
					})}
				</ul>
			)}
		</section>
	);
};

/**
 * What has been changed (6.2), in the panel's Changes dialog: the token changes, where they are tried, then what can be done
 * with them on their branch. A branch kept with nothing changed is still here, so it can be proposed or left.
 */
export const Changed = ({ id, controls }: { id: string | null; controls: TokenBranchControls }) => {
	const { edits } = useTokenChanges();
	const handoff = useHandoff({ shown: id, file: null, change: { edits }, watch: true });
	return (
		<>
			<TokenChanges />
			{edits.length > 0 && <p className="quiet">Tried in the stories of every component open, and in Primitives.</p>}
			<BranchActions controls={controls} handoff={handoff} />
		</>
	);
};

/** Said on a design system tab while a change is being tried in the panel: what it shows is as changed. */
export const TryingNote = ({ count }: { count: number }) =>
	count > 0 ? <p className="quiet">Showing the change being tried in the panel ({plural(count, 'token')}).</p> : null;
