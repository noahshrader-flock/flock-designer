import { arg, handle } from '../handle';
import type { CodebaseArea } from '../areas/codebase';

/**
 * Codebase work in a product checkout: the agent's runs, handing work to VS Code, Address on a branch, sharing a
 * preview, building a prototype in the codebase, and Handoff.
 */
export const registerCodebase = (area: CodebaseArea): void => {
	handle('startAgent', [area.checkout, arg.projectId, arg.words], area.startAgent);
	handle('agentStatus', [], area.agentStatus);
	handle('stopAgent', [], area.stopAgent);
	handle('agentReadiness', [], area.agentReadiness);
	handle('shareWork', [area.checkout, arg.projectId, arg.codebaseName], area.shareWork);
	handle('buildInCodebasePlan', [area.checkout, arg.projectId, arg.prototypeName], area.buildInCodebasePlan);
	handle('startHandoff', [area.checkout, arg.projectId], area.startHandoff);
	handle('handoffResult', [area.checkout], area.handoffResult);
	handle('buildInCodebase', [area.checkout, arg.projectId, arg.prototypeName, arg.optional(arg.branch)], area.buildInCodebase);
};
