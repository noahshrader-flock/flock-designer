/** Putting work in front of people: sharing a preview, and publishing the site. */

/** Where sharing a version has got to. One at a time: it is a push, a pull request and a build. */
export type ShareStatus =
	| { state: 'idle' }
	| { state: 'running'; projectId: string; name: string; step: ShareStep; detail?: string }
	| { state: 'ready'; projectId: string; name: string; url: string; prUrl: string }
	| { state: 'failed'; projectId: string; name: string; message: string };

export type ShareStep = 'pushing' | 'opening' | 'building';

/** Something that could not be published, and why, in words a person can act on. */
export interface PublishProblem {
	what: string;
	why: string;
	/** The files it is about, when there are any, as a list a person can read: a path to each, never run into the sentence. */
	files?: string[];
}

/**
 * Whether the person's work is published, which is the app's job and nobody else's to remember:
 * their work branches in the product repository, and their project records in the design repository.
 * It happens by itself, so this only reports.
 */
export type PublishStatus =
	/** Nothing to publish from here: no product repository, or no design repository beside it. */
	{ state: 'unavailable' } | { state: 'working' } | { state: 'shared'; at: string } | { state: 'held'; problems: PublishProblem[]; at: string };
