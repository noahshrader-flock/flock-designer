import type { DesignToken } from '../../src/shared/contract';
import { plural } from '../../src/shared/plural';
import { labelOf, readsAs } from '../../src/shared/tokens';
import { CHANGE_REQUEST } from '../../src/shared/vocabulary';
import { branchButtons } from '../../src/shared/branchButtons';
import { useTokenChanges } from '../../src/renderer/tokenChanges';
import type { BranchControls } from '../../src/renderer/useChangeBranch';
import type { TokenBranchControls } from '../../src/renderer/useTokenBranch';
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
 * on GitHub with any pull request.
 */
export const BranchActions = <C,>({ controls, canSave = true }: { controls: BranchControls<C>; canSave?: boolean }) => {
	const { branch, unsaved, busy, error, save, propose, startOver } = controls;
	const chromatic = branch?.pullRequest?.chromatic;
	const offered = branchButtons({ branch, unsaved, busy, canSave });
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
			<ErrorLine error={error} />
			<div className="branch-buttons">
				{offered.save && (
					<Button disabled={offered.save.disabled} onClick={save}>
						{offered.save.label}
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
 * What has been changed (6.2), at the top of the Design System tab while there is a change or a branch: each change, from
 * what the design system has to what it is now, with a reset for each and for all, then what can be done with it. It
 * stays while a branch is kept, even with nothing changed, so a branch can still be proposed or left.
 */
export const Changed = ({ controls }: { controls: TokenBranchControls }) => {
	const { edits, read, byPath, change, clear } = useTokenChanges();
	if (edits.length === 0 && controls.branch === null) return null;
	return (
		<section aria-label="Changed" data-changed-tokens className="changed">
			<div className="changed-header">
				<span className="changed-title">
					Changed <span className="section-count">{edits.length}</span>
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
				<>
					<ul className="tokens">
						{edits.map((e) => {
							const was = read.get(e.path) as DesignToken;
							const now = byPath.get(e.path) as DesignToken;
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
					<p className="quiet">Tried in the stories of every component open, and in Primitives.</p>
				</>
			)}
			<BranchActions controls={controls} />
		</section>
	);
};

/** Said on a design system tab while a change is being tried in the panel: what it shows is as changed. */
export const TryingNote = ({ count }: { count: number }) =>
	count > 0 ? <p className="quiet">Showing the change being tried in the panel ({plural(count, 'token')}).</p> : null;
