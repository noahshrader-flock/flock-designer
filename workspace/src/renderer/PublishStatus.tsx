import { FSAlert, FSBox, FSButton, FSTypography } from '@flocksafety/flock-react-component-lib';
import { useEffect, useState } from 'react';
import type { PublishStatus as Status } from '../shared/contract';

/**
 * Whether the person's work is published, said where they will see it. Publishing happens by itself, so this
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

export const PublishBanner = ({ status, onChange }: { status: Status; onChange: (s: Status) => void }) => {
	if (status.state === 'held') {
		return (
			<FSAlert
				severity="warning"
				action={
					<FSButton
						size="md"
						variant="secondary"
						sx={{ whiteSpace: 'nowrap', flexShrink: 0 }}
						onClick={() => void window.workspace.publishNow().then((r) => r.ok && onChange(r.value))}
					>
						Try again
					</FSButton>
				}
			>
				<FSTypography variant="body2" sx={{ fontWeight: 600 }}>
					Some of your work is not published yet
				</FSTypography>
				<FSBox component="ul" sx={{ m: 0, mt: 0.5, pl: 2.5 }}>
					{status.problems.map((p) => (
						<li key={`${p.what}:${p.why}`}>
							<FSTypography variant="body2">
								<b>{p.what}:</b> {p.why}
							</FSTypography>
						</li>
					))}
				</FSBox>
			</FSAlert>
		);
	}
	return null;
};

/** The small always-there line: where publishing is, in a few words. Nothing to say when there is nothing to publish from here. */
export const PublishLine = ({ status }: { status: Status }) => {
	const text =
		status.state === 'working'
			? 'Publishing…'
			: status.state === 'shared'
				? 'Everything is published'
				: status.state === 'held'
					? 'Some work is not published'
					: null;
	if (text === null) return null;
	return (
		<FSTypography variant="caption" color={status.state === 'held' ? 'warning.dark' : 'text.secondary'}>
			{text}
		</FSTypography>
	);
};
