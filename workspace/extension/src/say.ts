/** How the extension speaks to the person, kept apart from VS Code so what uses it is tested without it. */

/** The notification has a Stop button only when `onStop` is given. */
export type Progress = (title: string, task: (say: (message: string) => void) => Promise<void>, onStop?: () => void) => Promise<void>;

/** `start` clears the output and shows it. */
export interface OutputLike {
	start: (title: string) => void;
	line: (text: string) => void;
}

export type Tell = (message: string) => void;
/** Resolves to the action pressed, or undefined when dismissed. */
export type Offer = (message: string, actions: string[]) => Promise<string | undefined>;
