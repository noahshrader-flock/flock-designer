import type { CallsDeps } from '../compose';
import type { PageStatus } from '../../shared/contract';
import { HOST } from '../../shared/vocabulary';

export const publishingArea = (d: CallsDeps) => {
	const { deploys, github, publisher } = d;
	return {
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
