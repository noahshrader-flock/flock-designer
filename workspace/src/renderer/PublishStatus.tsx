import { useEffect, useState } from 'react';
import type { PublishStatus as Status } from '../shared/contract';
import { ProblemList, ProblemsDialog } from './ProblemsDialog';

/**
 * Whether the person's work is synced, said where they will see it. Syncing happens by itself, so this only reports: when
 * something could not be published, a button beside Sync (`PublishProblems`) that says so and, pressed, names what and why.
 * What it gives is what is shown (`shownStatus`): what was held is kept here through the next run, as state, so nothing
 * is written while the button is drawn.
 */
export const usePublishStatus = (): [Status, (s: Status) => void] => {
	const [{ current, lastHeld }, setSeen] = useState<{ current: Status; lastHeld: Status | null }>({
		current: { state: 'unavailable' },
		lastHeld: null,
	});
	const set = (next: Status) =>
		setSeen((seen) => ({ current: next, lastHeld: next.state === 'working' ? seen.lastHeld : next.state === 'held' ? next : null }));
	useEffect(() => {
		void window.workspace.publishStatus().then((r) => r.ok && set(r.value));
		return window.workspace.onPublishStatus(set);
	}, []);
	return [shownStatus(current, lastHeld), set];
};

/**
 * What is shown of the problems: what was held at the last sync, kept through the next run. The app syncs by itself every
 * few minutes, and hiding the button for each run made it flicker for as long as something stayed held. It goes only when a
 * sync ends without the problem.
 */
export const shownStatus = (current: Status, lastHeld: Status | null): Status =>
	current.state === 'working' && lastHeld?.state === 'held' ? lastHeld : current;

/**
 * What is held back from syncing, as a small ghost button beside Sync that opens a dialog naming each thing, why, and the
 * files it is about, one to a line. Nothing at all when everything is synced, or there is nothing to sync from here.
 */
export const PublishProblems = ({ status }: { status: Status }) => {
	if (status.state !== 'held' || status.problems.length === 0) return null;
	return (
		<ProblemsDialog label="Some work isn’t synced" description="This was held back, and goes up on the next sync once what is in the way is cleared.">
			<ProblemList items={status.problems.map((p) => ({ title: p.what, detail: p.why, files: p.files }))} />
		</ProblemsDialog>
	);
};
