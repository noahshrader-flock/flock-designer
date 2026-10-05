import { FSAlert, FSBox, FSButton, FSStack, FSTypography } from '@flocksafety/flock-react-component-lib';
import { useEffect, useState } from 'react';
import type { DeviceCodeStart, SignInState } from '../shared/contract';

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
	const [busy, setBusy] = useState(false);
	const [copied, setCopied] = useState(false);

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
			<FSBox sx={{ maxWidth: 520, mx: 'auto', mt: 8, textAlign: 'center' }}>
				<FSStack spacing={3}>
					<FSTypography variant="h5" component="h1">
						Enter this code on GitHub
					</FSTypography>

					<FSBox
						sx={{
							fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
							fontSize: 40,
							letterSpacing: 6,
							py: 2,
							border: 1,
							borderColor: 'divider',
							borderRadius: 1,
							userSelect: 'all',
						}}
					>
						{start.userCode}
					</FSBox>

					<FSStack direction="row" spacing={2} justifyContent="center">
						<FSButton
							onClick={() => {
								void navigator.clipboard.writeText(start.userCode);
								setCopied(true);
							}}
						>
							{copied ? 'Copied' : 'Copy code'}
						</FSButton>
						{/* Opens in the real browser: the main process denies in-window navigation. */}
						<FSButton variant="secondary" onClick={() => window.open(start.verificationUri, '_blank')}>
							Open GitHub
						</FSButton>
					</FSStack>

					<FSTypography variant="body2" color="text.secondary">
						Waiting for you to approve it. This page continues on its own.
					</FSTypography>
					<FSBox>
						<FSButton variant="secondary" onClick={cancel}>
							Cancel
						</FSButton>
					</FSBox>
				</FSStack>
			</FSBox>
		);
	}

	return (
		<FSBox sx={{ maxWidth: 460, mx: 'auto', mt: 10, textAlign: 'center' }}>
			<FSStack spacing={3}>
				<FSTypography variant="h5" component="h1">
					Flock Designer
				</FSTypography>
				<FSTypography variant="body2" color="text.secondary">
					Sign in with GitHub to browse projects and leave comments. You need read access to the design
					repository — nothing else, and no checkout.
				</FSTypography>
				{error && <FSAlert severity="error">{error}</FSAlert>}
				<FSBox>
					<FSButton onClick={begin} disabled={busy}>
						{busy ? 'Starting…' : 'Sign in with GitHub'}
					</FSButton>
				</FSBox>
			</FSStack>
		</FSBox>
	);
};
