import { useEffect, useRef, useState } from 'react';
import type { PublishStatus as Status } from '../shared/contract';
import { ProblemsDialog } from './ProblemsDialog';

/**
 * Whether the person's work is synced, said where they will see it. Syncing happens by itself, so this only reports: when
 * something could not be published, a button beside Sync (`PublishProblems`) that says so and, pressed, names what and why.
 */
export const usePublishStatus = (): [Status, (s: Status) => void] => {
	const [status, setStatus] = useState<Status>({ state: 'unavailable' });
	useEffect(() => {
		void window.workspace.publishStatus().then((r) => r.ok && setStatus(r.value));
		return window.workspace.onPublishStatus(setStatus);
	}, []);
	return [status, setStatus];
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
export const PublishProblems = ({ status: current }: { status: Status }) => {
	const lastHeld = useRef<Status | null>(null);
	const status = shownStatus(current, lastHeld.current);
	if (current.state !== 'working') lastHeld.current = current.state === 'held' ? current : null;
	if (status.state !== 'held' || status.problems.length === 0) return null;
	return (
		<ProblemsDialog
			label="Some work isn’t synced"
			description="This was held back, and goes up on the next sync once what is in the way is cleared."
		>
			<ul className="flex flex-col gap-4">
				{status.problems.map((p) => (
					<li key={`${p.what}:${p.why}`} className="flex flex-col gap-1 text-sm">
						<span className="font-medium">{p.what}</span>
						<span className="text-muted-foreground">{p.why}</span>
						{p.files && p.files.length > 0 && (
							<ul className="bg-muted mt-1 flex flex-col gap-1 rounded-md p-3 font-mono text-xs break-all">
								{p.files.map((file) => (
									<li key={file}>{file}</li>
								))}
							</ul>
						)}
					</li>
				))}
			</ul>
		</ProblemsDialog>
	);
};
