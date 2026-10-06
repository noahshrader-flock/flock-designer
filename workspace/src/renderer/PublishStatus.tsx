import { FSAlert, FSBox, FSButton, FSStack, FSTypography } from '@flocksafety/flock-react-component-lib';
import { useEffect, useState } from 'react';
import type { PublishStatus as Status } from '../shared/contract';

/**
 * Whether the person's work is published, said where they will see it, and the one question this ever asks.
 *
 * It is a banner in the page, not a dialog: nothing waits on it. Until the person answers, nothing is
 * published and the banner says so; the app carries on. After a yes, everything else is automatic and this
 * only reports. A failure names what could not be published and why, and clears itself when the next run
 * gets through.
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
	const answer = async (allowed: boolean) => {
		const r = await window.workspace.setPublishConsent(allowed);
		if (r.ok) onChange(r.value);
	};

	if (status.state === 'needs-consent') {
		return (
			<FSAlert
				severity="info"
				action={
					<FSStack direction="row" spacing={1} sx={{ flexShrink: 0 }}>
						<FSButton size="md" variant="secondary" sx={{ whiteSpace: 'nowrap' }} onClick={() => void answer(false)}>
							Not now
						</FSButton>
						<FSButton size="md" sx={{ whiteSpace: 'nowrap' }} onClick={() => void answer(true)}>
							Publish automatically
						</FSButton>
					</FSStack>
				}
			>
				Publish your work automatically? Flock Designer would push your prototype and codebase branches, and your project
				notes, so reviewers can see them and nothing is left only on this machine. Until you choose, nothing is published.
			</FSAlert>
		);
	}

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

/** The small always-there line: where publishing is, in a few words. */
export const PublishLine = ({ status, onChange }: { status: Status; onChange: (s: Status) => void }) => {
	const text =
		status.state === 'working'
			? 'Publishing…'
			: status.state === 'shared'
				? 'Everything is published'
				: status.state === 'held'
					? 'Some work is not published'
					: status.state === 'off'
						? 'Automatic publishing is off'
						: null;
	if (text === null) return null;
	return (
		<FSStack direction="row" spacing={1} alignItems="center">
			<FSTypography variant="caption" color={status.state === 'held' ? 'warning.dark' : 'text.secondary'}>
				{text}
			</FSTypography>
			{status.state === 'off' && (
				<FSButton size="sm" variant="ghost" onClick={() => void window.workspace.setPublishConsent(true).then((r) => r.ok && onChange(r.value))}>
					Turn on
				</FSButton>
			)}
		</FSStack>
	);
};
