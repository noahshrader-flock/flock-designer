import type { RepositoryReach } from '../shared/contract';

/**
 * Said under a repository picker when the list is only the repositories DSNR's GitHub App is installed on (the app's own
 * GitHub sign-in sees no others), so a repository missing from it is never a mystery, with the way to see every one. The
 * same wherever a repository is chosen (the New modal, the Connect screen).
 */
export const RepositoryReachNote = ({ reach }: { reach: RepositoryReach | null }) =>
	reach === 'app' ? (
		<p className="text-muted-foreground text-xs">
			Only the repositories DSNR’s GitHub App is installed on are listed. To see every one your account can reach, sign in to
			GitHub’s command line as this account (<code>gh auth login</code>), or ask an owner of your organisation to install the
			app on all its repositories.
		</p>
	) : null;
