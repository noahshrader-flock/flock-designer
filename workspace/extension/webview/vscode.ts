import type { View } from '../../src/ui/Collection';
/**
 * What VS Code gives the panel's page: its state, kept while the panel lives (across a reload, too), and a way to send the
 * extension a message. Asked for once, as VS Code allows only once per page; asked for when first needed, so a test can
 * stand in for VS Code before then.
 */
import type { PanelMessage } from '../src/messages';

interface VsCodeApi<State> {
	getState(): State | undefined;
	setState(state: State): void;
	postMessage(message: PanelMessage): void;
}

declare function acquireVsCodeApi<State>(): VsCodeApi<State>;

/** The panel's own state: what it was left showing, kept while the panel lives, reloads included. */
interface PanelState {
	tab: Tab;
	view: View;
	/** The design system's part shown, and how its components are seen: kept apart from the projects' view. */
	part?: Part;
	componentsView?: View;
}

export type Tab = 'projects' | 'design-system';
/** The design system's two parts in the panel. */
export type Part = 'components' | 'tokens';

let api: VsCodeApi<PanelState> | undefined;
export const vscode = (): VsCodeApi<PanelState> => (api ??= acquireVsCodeApi<PanelState>());
