import { arg, handle } from '../handle';
import type { CodebaseArea } from '../areas/codebase';

export const registerCodebase = (area: CodebaseArea): void => {
	handle('stopAgent', [], area.stopAgent);
	handle('agentReadiness', [], area.agentReadiness);
	handle('shareWork', [area.checkout, arg.projectId, arg.codebaseName], area.shareWork);
	handle('buildInCodebasePlan', [area.checkout, arg.projectId, arg.prototypeName], area.buildInCodebasePlan);
	handle('handOff', [area.checkout, arg.projectId], area.handOff);
	handle('handoffResult', [area.checkout, arg.projectId], area.handoffResult);
	handle('runLocally', [area.checkout, arg.projectId, arg.codebaseName], area.runLocally);
	handle('buildInCodebase', [area.checkout, arg.projectId, arg.prototypeName, arg.optional(arg.branch)], area.buildInCodebase);
};
