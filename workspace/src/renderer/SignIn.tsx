import { useEffect, useState } from 'react';
import type { DeviceCodeStart, SignInState } from '../shared/contract';
import { CancelButton } from './CancelButton';
import { Button } from './ui/button';
import { HOST } from '../shared/vocabulary';
import { ErrorAlert } from './ErrorAlert';
import { useCopy } from './useCopy';

/**
 * Sign-in, which for a desktop app means device flow: GitHub shows a code here,
 * the person types it on github.com, and no client secret exists anywhere.
 *
 * The code is the whole screen while it is live, because a person who cannot
 * find it is stuck. Everything else stays out of the way.
 */
export const SignIn = ({ state, onChanged }: { state: SignInState; onChanged: () => void }) => {
	const [start, setStart] = useState<DeviceCodeStart | null>(null);
	const [error, setError] = useState<string | null>(null);
	const { copied, copy: copyCode } = useCopy(setError, 'The code is shown above: type it in.');
	const [busy, setBusy] = useState(false);

	useEffect(() => {
		if (state.state === 'signedIn' || state.state === 'signedOut') {
			setStart(null);
		}
	}, [state.state]);

	const begin = async () => {
		setBusy(true);
		setError(null);
		const result = await window.workspace.signInStart();
		setBusy(false);
		if (result.ok) {
			setStart(result.value);
		} else {
			setError(result.error);
		}
	};

	const cancel = async () => {
		await window.workspace.signInCancel();
		setStart(null);
		onChanged();
	};

	if (state.state === 'awaitingDevice' && start) {
		return (
			<div className="w-full max-w-lg text-center">
				<div className="flex flex-col gap-6">
					<h1 className="text-2xl font-semibold">Enter this code on {HOST}</h1>

					<div className="rounded-lg border py-4 font-mono text-4xl tracking-[0.3em] select-all">{start.userCode}</div>

					<div className="flex flex-row justify-center gap-4">
						<Button onClick={() => void copyCode(start.userCode)}>{copied ? 'Copied' : 'Copy code'}</Button>
						{/* Opens in the real browser: the main process denies in-window navigation. */}
						<Button variant="secondary" onClick={() => window.open(start.verificationUri, '_blank')}>
							Open {HOST}
						</Button>
					</div>

					<p className="text-muted-foreground text-sm">Waiting for you to approve it. This page continues on its own.</p>
					<div>
						<CancelButton onClick={cancel} />
					</div>
				</div>
			</div>
		);
	}

	return (
		<div className="w-full max-w-md text-center">
			<div className="flex flex-col gap-6">
				<h1 className="text-2xl font-semibold">DSNR</h1>
				<p className="text-muted-foreground text-sm">
					Sign in with {HOST} to browse projects and leave comments. You need read access to the design repository — nothing else, and no checkout.
				</p>
				{error && <ErrorAlert error={error} />}
				<div>
					<Button onClick={begin} disabled={busy}>
						{busy ? 'Starting…' : `Sign in with ${HOST}`}
					</Button>
				</div>
			</div>
		</div>
	);
};
