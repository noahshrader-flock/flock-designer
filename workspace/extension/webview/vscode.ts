import type { View } from '../../src/ui/Collection';
/** Asked for once, as VS Code allows only once per page, and only when first needed, so a test can stand in for VS Code before then. */
import type { PanelMessage } from '../src/messages';

interface VsCodeApi<State> {
	getState(): State | undefined;
	setState(state: State): void;
	postMessage(message: PanelMessage): void;
}

declare function acquireVsCodeApi<State>(): VsCodeApi<State>;

interface PanelState {
	tab: Tab;
	view: View;
	part?: Part;
	componentsView?: View;
}

export type Tab = 'prototypes' | 'design-system';
export type Part = 'components' | 'tokens';

let api: VsCodeApi<PanelState> | undefined;
export const vscode = (): VsCodeApi<PanelState> => (api ??= acquireVsCodeApi<PanelState>());
