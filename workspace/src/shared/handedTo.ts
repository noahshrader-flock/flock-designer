/** `what` is what was handed, as a sentence starts it ("Alert history"). */
export const handedTo = ({ agent, editor }: { agent: string; editor: boolean }, what: string): string =>
	editor
		? `${what} is in ${agent} in this window now: a new conversation there has the task typed in. Press Enter there to start it.`
		: `${agent} is not in this VS Code, so the command that starts ${what.charAt(0).toLowerCase()}${what.slice(1)} in a terminal is on your clipboard.`;
