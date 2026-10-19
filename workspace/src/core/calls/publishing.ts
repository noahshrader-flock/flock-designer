import { arg, handle } from '../handle';
import type { PublishingArea } from '../areas/publishing';

/**
 * Publishing the records and pages, and whether a page is on the site.
 */
export const registerPublishing = (area: PublishingArea): void => {
	handle('publishStatus', [], area.publishStatus);
	handle('publishNow', [], area.publishNow);
	handle('publishedPage', [arg.projectId, arg.prototypeName], area.publishedPage);
	handle('publishPage', [arg.projectId, arg.prototypeName], area.publishPage);
};
