import { useCallback, useEffect, useState } from 'react';
import type { ClonePlan, Result } from '../shared/contract';
import { Alert, AlertDescription } from './ui/alert';
import { Button } from './ui/button';
import { Spinner } from './ui/spinner';

/**
 * Cloning a repository from the app: where it would go, changing that, cloning it with progress, and stopping. One
 * piece, used wherever a repository can be cloned (the New modal, the Design System tab's Connect screen), so cloning
 * looks and behaves the same everywhere. What happens once it is cloned is the caller's.
 */

/**
 * The clone of `repository`, or of nothing while it is null: its plan, asked again when the clone folder changes; what
 * it is doing while it runs; and why the last one could not be used. `onProblem` is told when the plan or the folder
 * picker fails, which is the screen's own error, not the clone's.
 */
export const useClone = (repository: string | null, onProblem: (error: string) => void) => {
	const [plan, setPlan] = useState<ClonePlan | null>(null);
	// What the clone is doing, as it is shown, while one runs.
	const [cloning, setCloning] = useState<string | null>(null);
	// Why a clone could not be used, said where the button was.
	const [error, setError] = useState<string | null>(null);

	const askPlan = useCallback(() => {
		if (repository === null) return;
		void window.workspace.clonePlan(repository).then((r) => (r.ok ? setPlan(r.value) : onProblem(r.error)));
	}, [repository]); // eslint-disable-line react-hooks/exhaustive-deps
	useEffect(() => {
		setPlan(null);
		setError(null);
		askPlan();
	}, [askPlan]);
	// Only while one runs: a line arriving after it ended does not bring it back.
	useEffect(
		() =>
			window.workspace.onCloneProgress((p) =>
				setCloning((c) => (c === null ? null : `Cloning ${p.repository.split('/')[1]}: ${p.step}${p.percent === null ? '' : ` ${p.percent}%`}`)),
			),
		[],
	);

	const changeFolder = async () => {
		const r = await window.workspace.chooseCloneFolder();
		if (!r.ok) return onProblem(r.error);
		if (r.value === null) return;
		setError(null);
		askPlan();
	};

	/** Clones with `clone`, the operation that clones and then does what this screen needs. Its result, for the caller. */
	const run = async <T,>(clone: (repository: string) => Promise<Result<T>>): Promise<Result<T> | null> => {
		if (repository === null) return null;
		setCloning(`Cloning ${repository.split('/')[1]}…`);
		const r = await clone(repository);
		setCloning(null);
		if (!r.ok) {
			// Said in place of the button, and where it now is (cloned, most often) asked again.
			setError(r.error);
			askPlan();
		}
		return r;
	};

	return { plan, cloning, error, changeFolder, run, stop: () => void window.workspace.cancelClone() };
};

export type CloneState = ReturnType<typeof useClone>;

/** Where the repository will go (with Change), then Clone, or what is running with Stop, or why it cannot be cloned. */
export const CloneHere = ({ clone, onClone }: { clone: CloneState; onClone: () => void }) => {
	const { plan, cloning, error } = clone;
	if (plan === null) return null;
	const { place, design } = plan;
	const taken = [place, design].find((p) => p?.state === 'taken');
	return (
		<div className="flex flex-col items-start gap-3">
			<p className="text-muted-foreground text-xs">
				{place.state === 'cloned' ? 'Already in ' : 'Into '}
				<code className="break-all">{plan.where}</code>
				{design?.state === 'free' && (
					<>
						, with <code>flock-designer</code> beside it
					</>
				)}
				{' · '}
				<button type="button" className="text-primary underline underline-offset-4" onClick={() => void clone.changeFolder()} disabled={cloning !== null}>
					Change
				</button>
			</p>
			{cloning === null && error !== null && (
				<Alert variant="warning">
					<AlertDescription>{error}</AlertDescription>
				</Alert>
			)}
			{cloning === null && taken?.state === 'taken' && (
				<Alert variant="warning">
					<AlertDescription>{taken.why} Nothing is cloned over it: change where clones go, or move it.</AlertDescription>
				</Alert>
			)}
			{cloning !== null ? (
				<Working text={cloning} onStop={clone.stop} />
			) : (
				// Gone once it is cloned and could not be used: there is nothing to try again. A clone that failed can be.
				!taken &&
				!(error !== null && place.state === 'cloned') && (
					<Button onClick={onClone}>{place.state === 'cloned' ? 'Use repository' : 'Clone repository'}</Button>
				)
			)}
		</div>
	);
};

/** A long job running (a clone, an install): what it is doing now, and a way to stop it. */
export const Working = ({ text, onStop }: { text: string; onStop: () => void }) => (
	<div className="flex w-full items-center gap-2 text-xs">
		<Spinner />
		<span className="min-w-0 grow truncate">{text}</span>
		<Button size="sm" variant="outline" onClick={onStop}>
			Stop
		</Button>
	</div>
);
