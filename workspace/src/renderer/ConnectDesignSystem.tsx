import { useState } from 'react';
import type { FoundDesignSystem } from '../shared/contract';
import { plural } from '../shared/plural';
import { CancelButton } from './CancelButton';
import { useClone } from './Clone';
import { Button } from './ui/button';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';
import { repoName } from '../shared/repoRef';
import { ErrorAlert } from './ErrorAlert';
import { closeUnlessBusy } from './dialogClose';
import { useRepositories } from './useWorkspace';
import { RepositoryField } from './RepositoryField';

/**
 * Connecting a design system (P4 of the design system plan), centered in the window like the GitHub sign-in: one of the
 * person's repositories, from the clone's own picker, and **Connect**, which clones it (or uses it where it already is)
 * and looks in it. **Any repository** (decision 23): it is accepted when a design system is found in it, Storybook
 * stories or tokens (decision 25), refused in words when none is, and when a monorepo has several the person chooses
 * one. **The first one is this screen; another, when one is connected already, is a modal over what is shown** (`onCancel`,
 * which is there only then, closes it): the same choosing and connecting, in a dialog instead of a page of its own.
 */
const WHAT_FOR = 'Choose the repository your design system is in. DSNR finds its components and tokens, in any package of a monorepo too.';

export const ConnectDesignSystem = ({ onConnected, onCancel }: { onConnected: () => void; onCancel?: () => void }) => {
	const listed = useRepositories();
	const [picked, setPicked] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	// A repository with several design systems in it, until one is chosen.
	const [choosing, setChoosing] = useState<{ repository: string; found: FoundDesignSystem[] } | null>(null);

	const clone = useClone(picked, setError, true);
	const connect = async () => {
		setError(null);
		const name = picked ? repoName(picked) : '';
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

	const form = (
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
			) : listed.loading || listed.value !== null ? (
				<RepositoryField
					id="connect-repo"
					names={listed.value?.repositories.map((r) => r.name) ?? []}
					reach={listed.value?.reach ?? null}
					loading={listed.loading}
					value={picked}
					onChange={setPicked}
					disabled={clone.cloning !== null}
					clone={picked !== null ? { state: clone, onClone: () => void connect(), action: 'Connect' } : undefined}
				/>
			) : null}
			{(error ?? listed.error) && <ErrorAlert error={error ?? listed.error} />}
		</div>
	);

	// Another, over what is shown: closed by Cancel or the dialog's own close, and not while it is cloning.
	if (onCancel)
		return (
			<Dialog open onOpenChange={closeUnlessBusy(onCancel, clone.cloning !== null)}>
				<DialogContent className="sm:max-w-md" showCloseButton={clone.cloning === null}>
					<DialogHeader>
						<DialogTitle>Connect a design system</DialogTitle>
						<DialogDescription>{WHAT_FOR}</DialogDescription>
					</DialogHeader>
					<DialogBody>{form}</DialogBody>
					<DialogFooter>{clone.cloning === null && <CancelButton onClick={onCancel} />}</DialogFooter>
				</DialogContent>
			</Dialog>
		);
	return (
		<div className="flex min-h-[calc(100dvh-var(--nav-height))] items-center justify-center p-6 pb-(--nav-height)">
			<div className="flex w-full max-w-[460px] flex-col gap-6 text-center">
				<h1 className="text-2xl font-semibold">Connect your design system</h1>
				<p className="text-muted-foreground text-sm">{WHAT_FOR}</p>
				{form}
			</div>
		</div>
	);
};
