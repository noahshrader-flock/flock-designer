/** One at a time: it is a push, a pull request and a build. */
export type ShareStatus =
	| { state: 'idle' }
	| { state: 'running'; prototypeId: string; name: string; step: ShareStep; detail?: string }
	| { state: 'ready'; prototypeId: string; name: string; url: string; prUrl: string }
	| { state: 'failed'; prototypeId: string; name: string; message: string };

export type ShareStep = 'pushing' | 'opening' | 'building';

export interface PublishProblem {
	what: string;
	why: string;
	/** A path to each, listed apart, never run into the sentence. */
	files?: string[];
}

/** Publishing happens by itself, so this only reports. */
export type PublishStatus =
	/** Nothing to publish from here: no product repository, or no design repository beside it. */
	{ state: 'unavailable' } | { state: 'working' } | { state: 'shared'; at: string } | { state: 'held'; problems: PublishProblem[]; at: string };
