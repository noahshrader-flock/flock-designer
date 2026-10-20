import { type Check, arg, handle } from '../handle';

const buildFrom = ((v) => {
	if (v !== 'installed' && v !== 'clone') throw new Error("A version is built from the design system's 'clone' or its 'installed' package.");
	return v;
}) as Check<'installed' | 'clone'>;
import type { PrototypesArea } from '../areas/prototypes';

export const registerPrototypes = (area: PrototypesArea): void => {
	handle('prototypeReadiness', [arg.root], area.prototypeReadiness);
	handle('createPrototype', [arg.projectId, arg.name, arg.words, arg.startingPoint, arg.unknown], area.createPrototype);
	handle('warmPrototypeBase', [arg.root], area.warmPrototypeBase);
	handle('prototypeBehind', [arg.projectId, arg.prototypeName], area.prototypeBehind);
	handle('handPrototypeRefresh', [arg.root, arg.projectId, arg.prototypeName], area.handPrototypeRefresh);
	handle('prototypeDesignSystem', [arg.projectId, arg.prototypeName], area.prototypeDesignSystem);
	handle('setPrototypeDesignSystem', [arg.root, arg.projectId, arg.prototypeName, buildFrom], area.setPrototypeDesignSystem);
	handle('assignFolder', [arg.projectId, arg.unknown], area.assignFolder);
	handle('handPrototypeBuild', [arg.root, arg.projectId, arg.prototypeName, arg.words], area.handPrototypeBuild);
	handle('handPrototypeAddress', [arg.root, arg.projectId, arg.prototypeName, arg.comment, arg.flag], area.handPrototypeAddress);
	handle('saveBuilt', [arg.projectId, arg.prototypeName, arg.optional(arg.prototypeName)], area.saveBuilt);
	handle('openPrototype', [arg.projectId, arg.prototypeName], area.openPrototype);
	handle('ensureCovers', [], area.ensureCovers);
	handle('projectCover', [arg.projectId, arg.prototypeName, arg.name], area.projectCover);
};
