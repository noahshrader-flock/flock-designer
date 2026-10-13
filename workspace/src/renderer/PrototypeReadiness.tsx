import { useEffect, useState } from 'react';
import type { AgentReadiness, PrototypeReadiness } from '../shared/contract';
import { Working } from './Clone';
import { Alert, AlertDescription, AlertTitle } from './ui/alert';
import { Button } from './ui/button';
import { useWorkspace } from './useWorkspace';
import { OutLink } from './Links';

/**
 * Whether a repository can build a prototype on this machine: asked as soon as there is one to ask about (`root`), and
 * again once its packages are installed from here, with the command the repository declares (`install`), whose last line
 * is said while it runs (`installing`). A failed install is told to `onError`, as New's other failures are.
 */
export const usePrototypeReadiness = (root: string | null, enabled: boolean, onError: (error: string | null) => void) => {
	const readying = useWorkspace(() => window.workspace.prototypeReadiness(root ?? ''), [root], { enabled: enabled && root !== null });
	const [installing, setInstalling] = useState<string | null>(null);
	useEffect(() => window.workspace.onInstallLine((line) => setInstalling((now) => (now === null ? null : line))), []);
	const install = async () => {
		if (root === null) return;
		onError(null);
		setInstalling('Starting…');
		const r = await window.workspace.installPackages(root);
		setInstalling(null);
		if (!r.ok) return onError(r.error);
		readying.reload();
	};
	return { prototype: readying.value, error: readying.error, installing, install };
};

/**
 * What stands in the way of building a prototype here, said where it can be acted on: the repository's packages not
 * installed (with Install packages, when it says how), the page builder missing, and Claude Code not installed or not
 * signed in. Nothing when nothing does.
 */
export const ReadinessAlerts = ({
	prototype,
	installing,
	onInstall,
	agent,
}: {
	prototype: PrototypeReadiness | null;
	installing: string | null;
	onInstall: () => void;
	agent: AgentReadiness;
}) => (
	<>
		{prototype && !prototype.ready && (
			<Alert variant="warning">
				<AlertTitle>{prototype.why === 'not-installed' ? "The real components aren't installed here" : 'The page builder is missing'}</AlertTitle>
				<AlertDescription>
					{prototype.why === 'not-installed' && prototype.canInstall ? (
						<div className="flex flex-col items-start gap-3">
							<span>
								A prototype is built from {prototype.designSystem}, and {prototype.repository}'s packages are not installed on this machine yet.
							</span>
							{installing === null ? (
								<Button onClick={onInstall}>Install packages</Button>
							) : (
								<Working text={installing} onStop={() => void window.workspace.cancelInstall()} />
							)}
						</div>
					) : prototype.why === 'not-installed' ? (
						<>
							A prototype is built from {prototype.designSystem}, and it is not installed in {prototype.repository} on this machine. Run{' '}
							<code>npm ci</code> in it (this needs access to the private packages), then open this again.
						</>
					) : (
						'DSNR cannot build pages on this machine. Reinstall the app and try again.'
					)}
				</AlertDescription>
			</Alert>
		)}
		{agent.state === 'missing' && (
			<Alert variant="warning">
				<AlertTitle>Claude Code is not installed</AlertTitle>
				<AlertDescription>
					New work is built by Claude Code on this machine. Install it from{' '}
					<OutLink href="https://claude.com/claude-code">claude.com/claude-code</OutLink>, sign in, then open this again.
				</AlertDescription>
			</Alert>
		)}
		{agent.state === 'signedOut' && (
			<Alert variant="warning">
				<AlertTitle>Claude Code is not signed in</AlertTitle>
				<AlertDescription>
					Sign in with your Claude account, in your editor's Claude panel or by running <code>claude</code> in a terminal. Then open this again.
				</AlertDescription>
			</Alert>
		)}
	</>
);
