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
		publishedPage: (prototypeId: string, name: string) => deploys.status(prototypeId, name),
		publishPage: async (prototypeId: string, name: string): Promise<PageStatus> => {
			if (github.state().state !== 'signedIn') throw new Error(`Sign in to ${HOST} to publish.`);
			deploys.page(prototypeId, name);
			return deploys.status(prototypeId, name);
		},
	};
};

export type PublishingArea = ReturnType<typeof publishingArea>;
