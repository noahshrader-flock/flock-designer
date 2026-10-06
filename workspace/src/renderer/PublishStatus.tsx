import { Alert, AlertDescription, AlertTitle } from './ui/alert';
import { Button } from './ui/button';
import { useEffect, useRef, useState } from 'react';
import type { PublishStatus as Status } from '../shared/contract';

/**
 * Whether the person's work is synced, said where they will see it. Syncing happens by itself, so this
 * only reports: a line in the top bar on every screen, and, if something could not be published, a banner
 * that names what and why and clears itself on the next run that gets through.
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
 * What the banner shows: what was held at the last sync, kept through the next run. The app syncs by itself
 * every few minutes, and hiding the banner for each run made it flicker for as long as something stayed held.
 * It goes only when a sync ends without the problem.
 */
export const bannerStatus = (current: Status, lastHeld: Status | null): Status =>
	current.state === 'working' && lastHeld?.state === 'held' ? lastHeld : current;

export const PublishBanner = ({ status: current, onChange }: { status: Status; onChange: (s: Status) => void }) => {
	const lastHeld = useRef<Status | null>(null);
	const status = bannerStatus(current, lastHeld.current);
	if (current.state !== 'working') lastHeld.current = current.state === 'held' ? current : null;
	if (status.state === 'held') {
		return (
			<Alert variant="warning">
				<AlertTitle>Some of your work is not synced yet</AlertTitle>
				<AlertDescription>
					<ul className="m-0 list-disc pl-5">
						{status.problems.map((p) => (
							<li key={`${p.what}:${p.why}`} className="text-sm">
								<b className="text-foreground">{p.what}:</b> {p.why}
							</li>
						))}
					</ul>
					<Button
						variant="secondary"
						size="sm"
						className="mt-2 shrink-0"
						onClick={() => void window.workspace.publishNow().then((r) => r.ok && onChange(r.value))}
					>
						Try again
					</Button>
				</AlertDescription>
			</Alert>
		);
	}
	return null;
};

/**
 * The small always-there line: where syncing is, in a few words. One word for it everywhere (this line, the
 * Sync button, the banner), so what the button starts is what the line says is happening. Nothing to say when there is
 * nothing to publish from here.
 *
 * When something is held back, it names it. "Some work is not published" followed a person across
 * every screen without saying which work or what to do about it, so it read as nagging about
 * something they could not act on -- while the banner that does explain appears only on the project
 * list. One held thing is named outright; several are counted, and the reason for each is there to
 * hover without leaving the screen.
 */
export const publishLineText = (status: Status): string | null => {
	if (status.state === 'working') return 'Syncing…';
	if (status.state === 'shared') return 'Everything is synced';
	if (status.state !== 'held') return null;
	const held = status.problems;
	if (held.length === 1) return `Not synced: ${held[0]?.what}`;
	return held.length > 1 ? `${held.length} things are not synced` : null;
};

export const PublishLine = ({ status }: { status: Status }) => {
	const held = status.state === 'held' ? status.problems : [];
	const text = publishLineText(status);
	if (text === null) return null;
	return (
		<span
			className={`text-xs ${status.state === 'held' ? 'text-warning' : 'text-muted-foreground'}`}
			title={held.map((p) => `${p.what}: ${p.why}`).join('\n') || undefined}
		>
			{text}
		</span>
	);
};
