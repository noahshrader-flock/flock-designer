import { arg, handle } from '../handle';
import type { CodebaseArea } from '../areas/codebase';

/**
 * Codebase work in a product checkout: the agent's runs, sharing a preview, running it locally, building a prototype in
 * the codebase, and Handoff.
 */
export const registerCodebase = (area: CodebaseArea): void => {
	handle('agentStatus', [], area.agentStatus);
	handle('stopAgent', [], area.stopAgent);
	handle('agentReadiness', [], area.agentReadiness);
	handle('shareWork', [area.checkout, arg.projectId, arg.codebaseName], area.shareWork);
	handle('buildInCodebasePlan', [area.checkout, arg.projectId, arg.prototypeName], area.buildInCodebasePlan);
	handle('handOff', [area.checkout, arg.projectId], area.handOff);
	handle('runLocally', [area.checkout, arg.projectId, arg.codebaseName], area.runLocally);
	handle('buildInCodebase', [area.checkout, arg.projectId, arg.prototypeName, arg.optional(arg.branch)], area.buildInCodebase);
};
