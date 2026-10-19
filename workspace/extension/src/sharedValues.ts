import { type HostMessage, type SharedName, type SharedValues, sameShared } from './messages';

/**
 * Kept by the extension rather than any one page, so a page loaded again finds it as it was. `kept` is told each change,
 * for a value kept beyond the session.
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

	message(): HostMessage {
		return { type: 'shared', name: this.name, value: this.value } as HostMessage;
	}
}
