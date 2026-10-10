import { useEffect, useState } from 'react';
import type { FoundDesignSystem, Repository, RepositoryReach } from '../shared/contract';
import { plural } from '../shared/plural';
import { CancelButton } from './CancelButton';
import { CloneHere, useClone } from './Clone';
import { RepositoryReachNote } from './RepositoryReachNote';
import { SearchSelect } from './SearchSelect';
import { Alert, AlertDescription } from './ui/alert';
import { Button } from './ui/button';
import { Label } from './ui/label';
import { Skeleton } from './ui/skeleton';
import { SkeletonStatus } from './Skeletons';

/**
 * Connecting a design system (P4 of the design system plan), centered in the window like the GitHub sign-in: one of the
 * person's repositories, from the clone's own picker, and **Connect**, which clones it (or uses it where it already is)
 * and looks in it. **Any repository** (decision 23): it is accepted when a design system is found in it, Storybook
 * stories or tokens (decision 25), refused in words when none is, and when a monorepo has several the person chooses
 * one. `onCancel`, when there is one connected already, goes back to it.
 */
export const ConnectDesignSystem = ({ onConnected, onCancel }: { onConnected: () => void; onCancel?: () => void }) => {
	const [repos, setRepos] = useState<Repository[] | null>(null);
	const [reach, setReach] = useState<RepositoryReach | null>(null);
	const [picked, setPicked] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	// A repository with several design systems in it, until one is chosen.
	const [choosing, setChoosing] = useState<{ repository: string; found: FoundDesignSystem[] } | null>(null);

	useEffect(() => {
		void window.workspace.listRepositories().then((r) => {
			if (!r.ok) return setError(r.error);
			setRepos(r.value.repositories);
			setReach(r.value.reach);
		});
	}, []);

	const clone = useClone(picked, setError, true);
	const connect = async () => {
		setError(null);
		const name = picked?.split('/')[1] ?? '';
		const r = await clone.run(window.workspace.connectDesignSystem, clone.plan?.place.state === 'cloned' ? `Looking in ${name}…` : undefined);
		if (!r?.ok) return;
		if (r.value.state === 'connected') onConnected();
		else setChoosing(r.value);
	};
	const choose = async (folder: string) => {
		if (choosing === null) return;
		setError(null);
		const r = await window.workspace.chooseDesignSystem(choosing.repository, folder);
		if (r.ok) onConnected();
		else setError(r.error);
	};

	return (
		<div className="flex min-h-[calc(100dvh-var(--nav-height))] items-center justify-center p-6 pb-(--nav-height)">
			<div className="flex w-full max-w-[460px] flex-col gap-6 text-center">
				<h1 className="text-2xl font-semibold">Connect your design system</h1>
				<p className="text-muted-foreground text-sm">
					Choose the repository your design system is in. DSNR finds its components and tokens, in any package of a monorepo too.
				</p>
				<div className="flex flex-col gap-3 text-left">
					{choosing !== null ? (
						<>
							<p className="text-sm">
								{choosing.repository} has {plural(choosing.found.length, 'design system')} in it. Choose one:
							</p>
							{choosing.found.map((f) => (
								<Button key={f.folder} variant="outline" className="h-auto justify-start py-2 text-left" onClick={() => void choose(f.folder)}>
									<span className="flex flex-col gap-0.5">
										<span className="font-medium">{f.name}</span>
										<span className="text-muted-foreground text-xs font-normal">
											{f.folder === '' ? 'The whole repository' : f.folder} · {plural(f.components, 'component')} · {plural(f.tokens, 'token')}
										</span>
									</span>
								</Button>
							))}
						</>
					) : repos === null ? (
						// The repository field, until the list it chooses from is read.
						<SkeletonStatus label="Loading your repositories…" className="flex flex-col gap-2">
							<Skeleton className="h-4 w-20" />
							<Skeleton className="h-9 w-full" />
						</SkeletonStatus>
					) : (
						<>
							<Label htmlFor="connect-repo">Repository</Label>
							<SearchSelect
								id="connect-repo"
								items={repos.map((r) => r.name)}
								value={picked}
								onChange={setPicked}
								placeholder="Choose a repository"
								search="Search repositories…"
								empty="No repository matches."
								disabled={clone.cloning !== null}
							/>
							<RepositoryReachNote reach={reach} />
							{picked !== null && <CloneHere clone={clone} onClone={() => void connect()} action="Connect" />}
						</>
					)}
					{error && (
						<Alert variant="destructive">
							<AlertDescription>{error}</AlertDescription>
						</Alert>
					)}
					{onCancel && clone.cloning === null && (
						<div>
							<CancelButton onClick={onCancel} />
						</div>
					)}
				</div>
			</div>
		</div>
	);
};
