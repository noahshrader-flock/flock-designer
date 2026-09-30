import type { WorkspaceApi } from '../shared/contract';

declare global {
	interface Window {
		/** Exposed by the preload bridge. The only way out of the renderer. */
		readonly workspace: WorkspaceApi;
	}
}
