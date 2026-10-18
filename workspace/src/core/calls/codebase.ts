import { arg, handle } from '../handle';
import type { CodebaseArea } from '../areas/codebase';

/**
 * Codebase work in a product checkout: the agent's runs, handing work to VS Code, Address on a branch, sharing a
 * preview, building a prototype in the codebase, and Handoff.
 */
export const registerCodebase = (area: CodebaseArea): void => {
	handle('startAgent', [area.checkout, arg.projectId, arg.words], area.startAgent);
	handle('agentStatus', [], area.agentStatus);
	// Answered once the run, and every tool it started, has ended.
	handle('stopAgent', [], area.stopAgent);
	handle('agentReadiness', [], area.agentReadiness);
	// One click: read the comments now, write the file from that read, then start the agent. Nothing
	// a reviewer wrote is put in the task; it reaches the agent only through the file.
	// Sharing. The branch comes from this person's own record, never from the window, and
	// the repository's descriptor says what a share is. Starts and returns: it takes minutes.
	handle('shareWork', [area.checkout, arg.projectId, arg.codebaseName], area.shareWork);
	handle('buildInCodebasePlan', [area.checkout, arg.projectId, arg.prototypeName], area.buildInCodebasePlan);
	handle('startHandoff', [area.checkout, arg.projectId], area.startHandoff);
	handle('handoffResult', [area.checkout], area.handoffResult);
	handle('buildInCodebase', [area.checkout, arg.projectId, arg.prototypeName, arg.optional(arg.branch)], area.buildInCodebase);
};
