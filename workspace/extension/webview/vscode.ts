/**
 * What VS Code gives the panel's page: its state, kept while the panel lives (across a reload, too), and a way to send the
 * extension a message. Asked for once, as VS Code allows only once per page; asked for when first needed, so a test can
 * stand in for VS Code before then.
 */
interface VsCodeApi<State> {
	getState(): State | undefined;
	setState(state: State): void;
	postMessage(message: unknown): void;
}

declare function acquireVsCodeApi<State>(): VsCodeApi<State>;

/** The panel's own state. */
export interface PanelState {
	tab: Tab;
}

export type Tab = 'projects' | 'design-system';

let api: VsCodeApi<PanelState> | undefined;
export const vscode = (): VsCodeApi<PanelState> => (api ??= acquireVsCodeApi<PanelState>());
