import { useEffect, useState } from 'react';

/**
 * Whether the agent is busy with something, read when a dialog that would start new work opens, so it can say
 * so rather than offer a button that will be refused. Only a hint: the main process refuses a second run anyway.
 */
export const useAgentBusy = (open: boolean): boolean => {
	const [busy, setBusy] = useState(false);
	useEffect(() => {
		if (!open) return;
		let current = true;
		void window.workspace.agentStatus().then((r) => current && setBusy(r.ok && r.value.state === 'running'));
		return () => {
			current = false;
		};
	}, [open]);
	return busy;
};
