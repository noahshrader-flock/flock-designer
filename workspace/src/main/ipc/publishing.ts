import { assertPreviewUrl } from '../../shared/anchor';
import type { PageStatus } from '../../shared/contract';
import { arg, handle } from '../handle';
import type { IpcDeps } from '../ipc';
import { HOST } from '../../shared/vocabulary';

/**
 * Publishing the records and pages, and whether a page is on the site.
 */
export const registerPublishing = (d: IpcDeps): void => {
	const { github, ports, publishInBackground, publishedPage, publisher } = d;

	// Publishing happens by itself; these only report it, and let a person ask for it now.
	handle('publishStatus', [], () => publisher.status());
	handle('publishNow', [], async () => {
		await publisher.publish(true);
		return publisher.status();
	});
	handle('publishedPage', [arg.projectId, arg.prototypeName], (projectId, name) => publishedPage(projectId, name));
	handle('openPublishedPage', [arg.projectId, arg.prototypeName], async (projectId, name): Promise<null> => {
		const status = await publishedPage(projectId, name);
		if (status.state !== 'published') throw new Error('This iteration is not on its page yet.');
		await ports.openExternal(assertPreviewUrl(status.url));
		return null;
	});
	handle('publishPage', [arg.projectId, arg.prototypeName], async (projectId, name): Promise<PageStatus> => {
		if (github.state().state !== 'signedIn') throw new Error(`Sign in to ${HOST} to publish.`);
		publishInBackground(projectId, name);
		return publishedPage(projectId, name);
	});
};
