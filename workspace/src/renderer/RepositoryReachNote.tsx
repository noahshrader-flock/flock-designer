import type { RepositoryReach } from '../shared/contract';
import { CLI, HOST } from '../shared/vocabulary';

/**
 * Said under a repository picker when the list is only the repositories DSNR's GitHub App is installed on (the app's own
 * GitHub sign-in sees no others), so a repository missing from it is never a mystery, with the way to see every one. The
 * same wherever a repository is chosen (the New modal, the Connect screen).
 */
export const RepositoryReachNote = ({ reach }: { reach: RepositoryReach | null }) =>
	reach === 'app' ? (
		<p className="text-muted-foreground text-xs">
			Only the repositories DSNR’s {HOST} App is installed on are listed. To see every one your account can reach, sign in to {HOST}’s command line as
			this account (<code>{CLI} auth login</code>), or ask an owner of your organization to install the app on all its repositories.
		</p>
	) : null;
