import type { Handed } from './domain/projects';

/** `what` is what was handed, as a sentence starts it ("Alert history"). */
export const handedTo = ({ agent, opened }: Pick<Handed, 'agent' | 'opened'>, what: string): string =>
	opened === 'typed'
		? `${what} is in ${agent} in this window now: a new conversation there has the task typed in. Press Enter there to start it.`
		: opened === 'started'
			? `${what} is with ${agent} now, in a terminal in this window, where it has started: answer it there as it goes.`
			: `${agent} is not in this VS Code, so the command that starts ${what.charAt(0).toLowerCase()}${what.slice(1)} in a terminal is on your clipboard.`;
