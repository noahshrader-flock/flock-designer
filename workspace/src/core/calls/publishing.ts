import { arg, handle } from '../handle';
import type { PublishingArea } from '../areas/publishing';

export const registerPublishing = (area: PublishingArea): void => {
	handle('publishStatus', [], area.publishStatus);
	handle('publishNow', [], area.publishNow);
	handle('publishedPage', [arg.projectId, arg.versionName], area.publishedPage);
	handle('publishPage', [arg.projectId, arg.versionName], area.publishPage);
};
