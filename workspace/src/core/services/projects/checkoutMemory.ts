import { FolderMemory } from './folderMemory';

export class CheckoutMemory extends FolderMemory {
	constructor(file: string) {
		super(file, 'root');
	}
}
