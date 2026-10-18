import { FolderMemory } from './folderMemory';

/**
 * Remembers which product checkout a person chose, so they choose it once.
 *
 * It goes through the same "opened" gate as a fresh pick, so a stale or edited file can reopen nothing the person could
 * not have opened themselves.
 */
export class CheckoutMemory extends FolderMemory {
	constructor(file: string) {
		super(file, 'root');
	}
}
