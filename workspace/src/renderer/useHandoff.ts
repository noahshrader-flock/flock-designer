import { useEffect, useState } from 'react';
import type { Checkout, ProjectIteration } from '../shared/contract';

/**
 * Handing codebase work to the person: the checkout in VS Code, or the agent's own conversation continued
 * there with everything it knew. Asked again whenever `when` changes, since a run that has just started
 * is what makes a conversation to continue.
 */
export const useHandoff = (checkout: Checkout | null, iteration: ProjectIteration, when: unknown, onError: (message: string) => void) => {
	const [state, setState] = useState({ editor: false, session: false });
	const root = checkout?.root ?? null;

	useEffect(() => {
		if (root === null) return;
		let current = true;
		void window.workspace.handoffState(root, iteration.branch).then((r) => current && r.ok && setState(r.value));
		return () => {
			current = false;
		};
	}, [root, iteration.branch, when]);

	/** Says whether it worked, so a screen that changes on success changes only then. */
	const report = (r: { ok: boolean; error?: string }): boolean => {
		if (!r.ok) onError(r.error ?? 'That did not open.');
		return r.ok;
	};
	return {
		available: root !== null,
		...state,
		openInEditor: () => (root === null ? Promise.resolve(false) : window.workspace.openInEditor(root).then(report)),
		continueInClaude: () => (root === null ? Promise.resolve(false) : window.workspace.continueInClaude(root, iteration.branch).then(report)),
	};
};
