import { arg, handle } from '../handle';
import type { PrototypesArea } from '../areas/prototypes';

export const registerPrototypes = (area: PrototypesArea): void => {
	handle('prototypeBehind', [arg.prototypeId, arg.versionName], area.prototypeBehind);
	handle('handPrototypeRefresh', [arg.root, arg.prototypeId, arg.versionName], area.handPrototypeRefresh);
	handle('assignFolder', [arg.prototypeId, arg.unknown], area.assignFolder);
	handle('renamePrototype', [arg.prototypeId, arg.name], area.renamePrototype);
	handle('deletePrototype', [arg.prototypeId, arg.name], area.deletePrototype);
	handle('handPrototypeAddress', [arg.root, arg.prototypeId, arg.versionName, arg.comment, arg.flag], area.handPrototypeAddress);
	handle('saveBuilt', [arg.prototypeId, arg.versionName, arg.optional(arg.versionName)], area.saveBuilt);
	handle('openPrototype', [arg.prototypeId, arg.versionName], area.openPrototype);
	handle('ensureCovers', [], area.ensureCovers);
	handle('prototypeCover', [arg.prototypeId, arg.versionName, arg.name], area.prototypeCover);
};
