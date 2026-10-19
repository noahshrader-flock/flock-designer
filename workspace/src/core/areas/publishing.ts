import type { CallsDeps } from '../compose';
import type { PageStatus } from '../../shared/contract';
import { HOST } from '../../shared/vocabulary';

/** What the Publishing calls do, each called by its handler once its arguments are checked (`calls/publishing.ts`). */
export const publishingArea = (d: CallsDeps) => {
	const { deploys, github, publisher } = d;
	return {
		// Publishing happens by itself; these only report it, and let a person ask for it now.
		publishStatus: () => publisher.status(),
		publishNow: async () => {
			await publisher.publish(true);
			return publisher.status();
		},
		publishedPage: (projectId: string, name: string) => deploys.status(projectId, name),
		publishPage: async (projectId: string, name: string): Promise<PageStatus> => {
			if (github.state().state !== 'signedIn') throw new Error(`Sign in to ${HOST} to publish.`);
			deploys.page(projectId, name);
			return deploys.status(projectId, name);
		},
	};
};

export type PublishingArea = ReturnType<typeof publishingArea>;
