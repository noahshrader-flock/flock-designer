import { arg, handle } from '../handle';
import type { PrototypesArea } from '../areas/prototypes';

export const registerPrototypes = (area: PrototypesArea): void => {
	handle('prototypeBehind', [arg.projectId, arg.prototypeName], area.prototypeBehind);
	handle('handPrototypeRefresh', [arg.root, arg.projectId, arg.prototypeName], area.handPrototypeRefresh);
	handle('assignFolder', [arg.projectId, arg.unknown], area.assignFolder);
	handle('renameProject', [arg.projectId, arg.name], area.renameProject);
	handle('deleteProject', [arg.projectId, arg.name], area.deleteProject);
	handle('handPrototypeAddress', [arg.root, arg.projectId, arg.prototypeName, arg.comment, arg.flag], area.handPrototypeAddress);
	handle('saveBuilt', [arg.projectId, arg.prototypeName, arg.optional(arg.prototypeName)], area.saveBuilt);
	handle('openPrototype', [arg.projectId, arg.prototypeName], area.openPrototype);
	handle('ensureCovers', [], area.ensureCovers);
	handle('projectCover', [arg.projectId, arg.prototypeName, arg.name], area.projectCover);
};
