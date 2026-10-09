import { useEffect, useState } from 'react';
import { isDesignSystem } from '../shared/catalog';
import type { Repository } from '../shared/contract';
import { CloneHere, useClone } from './Clone';
import { SearchSelect } from './SearchSelect';
import { Alert, AlertDescription } from './ui/alert';
import { Button } from './ui/button';
import { Label } from './ui/label';
import { Tabs, TabsList, TabsTrigger } from './ui/tabs';

type How = 'clone' | 'locate';

/**
 * Connecting the design system, when the tab has none (DESIGN_SYSTEM_PLAN.md, P0): centred like the GitHub sign-in, with
 * two ways in. **Clone** is the New modal's own repository picker and clone panel; only the design system library can be
 * cloned from here, and anything else is said to be something else before a byte is downloaded. **Locate** opens the
 * system's folder picker, and the app checks the folder is a clone of the library before it is kept. Either way the
 * connection is remembered, and `onConnected` is told.
 */
export const ConnectDesignSystem = ({ repository, lost, onConnected }: { repository: string; lost: string | null; onConnected: () => void }) => {
	const [how, setHow] = useState<How>('clone');
	const [repos, setRepos] = useState<Repository[] | null>(null);
	// The repository chosen, by name. Null means the library, when the person's list has it.
	const [picked, setPicked] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		void window.workspace.listRepositories().then((r) => (r.ok ? setRepos(r.value) : setError(r.error)));
	}, []);

	const library = repos?.find((r) => isDesignSystem(r.name))?.name ?? null;
	const chosen = picked ?? library;
	const clone = useClone(chosen !== null && isDesignSystem(chosen) ? chosen : null, setError);

	const cloneIt = async () => {
		setError(null);
		const r = await clone.run(window.workspace.cloneDesignSystem);
		if (r?.ok) onConnected();
	};
	const locate = async () => {
		setError(null);
		const r = await window.workspace.locateDesignSystem();
		if (!r.ok) return setError(r.error);
		if (r.value) onConnected();
	};

	return (
		<div className="mx-auto mt-20 max-w-[460px] text-center">
			<div className="flex flex-col gap-6">
				<h1 className="text-2xl font-semibold">Connect the design system</h1>
				<p className="text-muted-foreground text-sm">
					DSNR reads the component library, {repository}, from a copy on this computer. Clone it, or choose the
					copy you already have.
				</p>
				{lost !== null && (
					<Alert variant="warning">
						<AlertDescription>The folder connected before is no longer the library, or is no longer there: {lost}</AlertDescription>
					</Alert>
				)}
				{/* What went wrong belongs to the tab it went wrong in. */}
				<Tabs
					value={how}
					onValueChange={(v) => {
						setHow(v as How);
						setError(null);
					}}
					className="items-center"
				>
					<TabsList>
						<TabsTrigger value="clone" disabled={clone.cloning !== null}>
							Clone
						</TabsTrigger>
						<TabsTrigger value="locate" disabled={clone.cloning !== null}>
							Locate
						</TabsTrigger>
					</TabsList>
				</Tabs>
				<div className="flex flex-col gap-3 text-left">
					{how === 'clone' ? (
						repos === null ? null : (
							<>
								<Label htmlFor="connect-repo">Repository</Label>
								<SearchSelect
									id="connect-repo"
									items={repos.map((r) => r.name)}
									value={chosen}
									onChange={setPicked}
									placeholder="Choose a repository"
									search="Search repositories…"
									empty="No repository matches."
									disabled={clone.cloning !== null}
								/>
								{chosen === null ? (
									<p className="text-muted-foreground text-sm">
										Your GitHub account cannot see {repository}. Ask for access to it, or use Locate if you have a copy.
									</p>
								) : !isDesignSystem(chosen) ? (
									<p className="text-muted-foreground text-sm">That is not the design system library.</p>
								) : (
									<CloneHere clone={clone} onClone={() => void cloneIt()} />
								)}
							</>
						)
					) : (
						<div className="flex flex-col items-start gap-3">
							<p className="text-muted-foreground text-sm">Choose the folder on this computer where you cloned {repository}.</p>
							<Button onClick={() => void locate()}>Browse…</Button>
						</div>
					)}
					{error && (
						<Alert variant="destructive">
							<AlertDescription>{error}</AlertDescription>
						</Alert>
					)}
				</div>
			</div>
		</div>
	);
};
