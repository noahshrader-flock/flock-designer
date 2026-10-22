import { arg, handle } from '../handle';
import type { CodebaseArea } from '../areas/codebase';

export const registerCodebase = (area: CodebaseArea): void => {
	handle('shareWork', [area.checkout, arg.prototypeId, arg.codebaseName], area.shareWork);
	handle('buildInCodebasePlan', [area.checkout, arg.prototypeId, arg.versionName], area.buildInCodebasePlan);
	handle('chooseAgent', [], area.chooseAgent);
	handle('agentShown', [], area.agentShown);
	handle('handOff', [area.checkout, arg.prototypeId], area.handOff);
	handle('codebaseAgainstBase', [area.checkout, arg.prototypeId], area.codebaseAgainstBase);
	handle('handCodebaseUpdate', [area.checkout, arg.prototypeId], area.handCodebaseUpdate);
	handle('handoffResult', [area.checkout, arg.prototypeId], area.handoffResult);
	handle('runLocally', [area.checkout, arg.prototypeId, arg.codebaseName], area.runLocally);
	handle('buildInCodebase', [area.checkout, arg.prototypeId, arg.versionName, arg.optional(arg.branch)], area.buildInCodebase);
};
