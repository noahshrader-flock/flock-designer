import { useEffect, useRef, useState } from 'react';
import type { Checkout, CommentRef, Project, ProjectIteration } from '../../shared/contract';
import { toProjectIteration } from '../../shared/iterationRecords';
import { type AddressPhase, runAddress, runPrototypeAddress } from '../address';
import type { useComments } from '../comments/useComments';

/**
 * Asking the agent to act on one comment, from that comment's own button: never for a batch. It is one agent: not while
 * it is building this iteration. Says where the run has got to (`address`), the agent's last lines (`log`), which comment
 * it is for (`addressing`), and, when a prototype's change went into another iteration, which (`changedElsewhere`).
 */
export const useAddress = ({
	checkout,
	prototype,
	project,
	iteration,
	siblings,
	comments,
	retry,
	onOpen,
}: {
	checkout: Checkout | null;
	prototype: boolean;
	project: Project;
	iteration: ProjectIteration;
	/** The other iterations of the same kind of work. */
	siblings: ProjectIteration[];
	comments: ReturnType<typeof useComments>;
	/** Builds the page again, when the change was made in the one on screen. */
	retry: () => void;
	onOpen: (project: Project, iteration: ProjectIteration) => void;
}) => {
	const [address, setAddress] = useState<AddressPhase>({ kind: 'idle' });
	const [log, setLog] = useState<string[]>([]);
	// Which comment this run is for, so its own button says so.
	const [addressing, setAddressing] = useState<number | null>(null);
	const live = useRef(true);
	useEffect(() => {
		live.current = true;
		return () => void (live.current = false);
	}, []);
	useEffect(() => {
		if (address.kind !== 'running') return;
		// Enough that the summary at the end survives the tool lines that came before it.
		return window.workspace.onAgentLog((l) => setLog((prev) => [...prev, l.text.replace(/\n$/, '')].slice(-80)));
	}, [address.kind]);

	const addressComment = async (comment: CommentRef) => {
		if (!checkout) return;
		setLog([]);
		setAddressing(comment.id);
		// Typed wider than it is assigned: the compiler cannot see that the callback below runs.
		let outcome = { kind: 'idle' } as AddressPhase;
		const isLive = () => live.current;
		const onPhase = (p: AddressPhase) => {
			outcome = p;
			if (live.current) setAddress(p);
		};
		if (prototype) {
			// A prototype has no branch. The main process says where the change went (this iteration, or its next one when
			// others had commented on this), builds and saves it, and marks the comment with where it is.
			await runPrototypeAddress({ api: window.workspace, projectId: project.id, name: iteration.name, comment, isLive, onPhase });
			if (!live.current) return;
			if (outcome.kind === 'done' && outcome.prototype) {
				comments.showChanged(outcome.prototype.comment);
				// Changed here: what is on screen, and what reviewers open, is the changed page.
				if (outcome.changed && outcome.prototype.iteration === iteration.name) retry();
			}
			return void comments.load(true);
		}
		await runAddress({ api: window.workspace, root: checkout.root, projectId: project.id, name: iteration.name, comment, isLive, onPhase });
		if (!live.current) return;
		// A change was made. Marked on the comment itself, and resolved with it, so it survives the app closing, whoever wrote
		// the comment can see it was acted on, and its pin does not stay behind pointing at what was just changed. The person
		// can reopen it if the change is not what they meant.
		if (outcome.kind === 'done') {
			// Either way: a later run that changed nothing clears the mark an earlier one left, so a card never shows a change
			// waiting that is no longer there.
			const marked = await window.workspace.markAddressed(comment, outcome.changed ? outcome.commit : null);
			if (marked.ok) comments.showChanged(marked.value);
		}
		// The agent may have changed the code, and a reviewer may have written meanwhile.
		void comments.load(true);
	};

	/** Where an Address run on this prototype put its change, when that is another iteration than this one. */
	const changedElsewhere =
		address.kind === 'done' && address.changed && address.prototype && address.prototype.iteration !== iteration.name ? address.prototype : null;
	const openChanged = () => {
		if (!changedElsewhere) return;
		const known = siblings.find((i) => i.name === changedElsewhere.iteration);
		if (known) return onOpen(project, known);
		// Just made: the list this screen was opened from has not got it yet.
		if (changedElsewhere.made) {
			const made = toProjectIteration(changedElsewhere.made);
			onOpen({ ...project, iterations: [...project.iterations, made] }, made);
		}
	};

	return { address, log, addressing, addressComment, changedElsewhere, openChanged };
};

export type AddressState = ReturnType<typeof useAddress>;
