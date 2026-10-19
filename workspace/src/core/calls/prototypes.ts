import { arg, handle } from '../handle';
import type { PrototypesArea } from '../areas/prototypes';

/**
 * Prototypes: making one, building it, changing it for a comment, saving, opening, checking and picturing it.
 */
export const registerPrototypes = (area: PrototypesArea): void => {
	handle('prototypeReadiness', [arg.root], area.prototypeReadiness);
	handle('createPrototype', [arg.projectId, arg.name, arg.words, arg.startingPoint, arg.unknown], area.createPrototype);
	handle('assignFolder', [arg.projectId, arg.unknown], area.assignFolder);
	handle('handPrototypeBuild', [arg.root, arg.projectId, arg.prototypeName, arg.words], area.handPrototypeBuild);
	handle('addressPrototype', [arg.projectId, arg.prototypeName, arg.comment, arg.flag], area.addressPrototype);
	handle('saveBuilt', [arg.projectId, arg.prototypeName], area.saveBuilt);
	handle('openPrototype', [arg.projectId, arg.prototypeName], area.openPrototype);
	handle('ensureCovers', [], area.ensureCovers);
	handle('projectCover', [arg.projectId, arg.prototypeName, arg.name], area.projectCover);
};
