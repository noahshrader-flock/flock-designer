import { type HostMessage, type SharedName, type SharedValues, sameShared } from './messages';

/**
 * A value every DSNR page shows the same (`SharedValues`), kept by the extension rather than any one page: told to every
 * page whenever it changes (`post`), and to a page once it listens (`message`, `Panels.ready`), so a page loaded again finds
 * it as it was. A change that is the same as what is kept (`sameShared`) tells nobody. `kept` is told each change, for a
 * value kept beyond the session (the mode, in VS Code's state).
 */
export class Shared<K extends SharedName> {
	constructor(
		readonly name: K,
		private value: SharedValues[K],
		private readonly post: (message: HostMessage) => void,
		private readonly kept?: (value: SharedValues[K]) => void,
	) {}

	current(): SharedValues[K] {
		return this.value;
	}

	set(value: SharedValues[K]): void {
		if (sameShared(this.name, value, this.value)) return;
		this.value = value;
		this.kept?.(value);
		this.post(this.message());
	}

	/** What a page is told of it. */
	message(): HostMessage {
		return { type: 'shared', name: this.name, value: this.value } as HostMessage;
	}
}
