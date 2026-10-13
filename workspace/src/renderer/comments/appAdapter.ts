import type { Checkout, WorkspaceApi } from '../../shared/contract';
import type { CommentStore, PageSurface } from './surfaces';
import { commentRef } from '../../shared/comments';

/**
 * The comments experience in the app: GitHub through the main process, and the native preview. What the review screen
 * did before the comments were taken out of it, unchanged.
 */

/** One iteration's comments. `commit` is the recorded one, the fallback when the checkout cannot say where it is. */
export const appComments = (
	api: WorkspaceApi,
	{
		projectId,
		branch,
		name,
		commit,
		checkout,
	}: { projectId: string; branch: string; name: string; commit: string | null; checkout: Checkout | null },
): CommentStore => ({
	read: () => api.readComments(projectId, branch),
	post: (body, anchor, picture) => api.postComment(projectId, branch, body, anchor, picture),
	resolve: (comment, resolved) => api.resolveComment(commentRef(comment), resolved),
	remove: (comment) => api.deleteComment(commentRef(comment)),
	move: (comment, anchor) => api.moveComment(commentRef(comment), anchor),
	viewer: async () => {
		const r = await api.signInState();
		return r.ok && r.value.state === 'signedIn' ? r.value.user.login : null;
	},
	// What the branch is at *now*, so a comment says which version it was made against. The recorded one can be stale;
	// it is only the fallback, and all a reviewer without the checkout has.
	version: async () => {
		const live = checkout ? await api.iterationCommit(checkout.root, projectId, name) : null;
		return (live?.ok && live.value) || commit || '';
	},
});

/** The native preview. */
export const appPage = (api: WorkspaceApi): PageSurface => ({
	pick: () => api.pagePick(),
	cancelPick: () => api.pageCancelPick(),
	showMarkers: (items) => api.pageShowMarkers(items),
	focusMarker: (id) => api.pageFocusMarker(id),
	onPinEvent: (listener) => api.onPinEvent(listener),
});
