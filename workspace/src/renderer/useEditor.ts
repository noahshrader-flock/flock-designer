import { useEffect, useState } from 'react';
import type { Checkout, ProjectIteration } from '../shared/contract';

/**
 * Handing codebase work to the person: the checkout in VS Code, or the agent's own conversation continued
 * there with everything it knew. Asked again whenever `when` changes, since a run that has just started
 * is what makes a conversation to continue.
 */
export const useEditor = (checkout: Checkout | null, iteration: ProjectIteration, when: unknown, onError: (message: string) => void) => {
	const [state, setState] = useState({ editor: false, session: false });
	const root = checkout?.root ?? null;

	useEffect(() => {
		if (root === null) return;
		let current = true;
		void window.workspace.editorState(root, iteration.branch).then((r) => current && r.ok && setState(r.value));
		return () => {
			current = false;
		};
	}, [root, iteration.branch, when]);

	/** Says whether it worked, so a screen that changes on success changes only then. */
	const report = (r: { ok: boolean; error?: string }): boolean => {
		if (!r.ok) onError(r.error ?? 'That did not open.');
		return r.ok;
	};
	const none = Promise.resolve(null);
	return {
		available: root !== null,
		...state,
		openInEditor: () => (root === null ? Promise.resolve(false) : window.workspace.openInEditor(root).then(report)),
		/** Where the conversation went on (VS Code, or a copied terminal command), or null if it did not. */
		continueInClaude: () =>
			root === null ? none : window.workspace.continueInClaude(root, iteration.branch).then((r) => (report(r) && r.ok ? r.value : null)),
	};
};
