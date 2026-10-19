import type * as VsCode from 'vscode';
import type { Panels } from './bridge';
import type { DesignTab } from './messages';

type TabPanel = Pick<VsCode.WebviewPanel, 'visible' | 'reveal' | 'onDidChangeViewState' | 'onDidDispose' | 'dispose'> & {
	webview: Pick<VsCode.Webview, 'html' | 'onDidReceiveMessage' | 'postMessage'>;
};

const titleOf = (tab: DesignTab): string => (tab.kind === 'component' ? tab.name : 'Primitives');
const COMPONENT = 'component:';
const keyOf = (tab: DesignTab): string => (tab.kind === 'component' ? `${COMPONENT}${tab.id}` : 'primitives');

export class DesignTabs {
	private readonly tabs = new Map<string, TabPanel>();

	constructor(
		private readonly deps: {
			/** Its page must be allowed to run its script and load from the extension's build. */
			create: (title: string) => TabPanel;
			page: (webview: TabPanel['webview'], tab: DesignTab) => Promise<string>;
			panels: Pick<Panels, 'add'>;
			receive: (webview: TabPanel['webview'], raw: unknown) => Promise<void>;
			/** Told when a tab opens, closes, or is brought in front or covered (`shownComponents`). */
			onShown?: () => void;
		},
	) {}

	async open(tab: DesignTab): Promise<void> {
		const key = keyOf(tab);
		const open = this.tabs.get(key);
		if (open) return open.reveal();
		const panel = this.deps.create(titleOf(tab));
		this.tabs.set(key, panel);
		const listening = this.deps.panels.add(panel.webview as VsCode.Webview);
		panel.webview.onDidReceiveMessage((raw: unknown) => void this.deps.receive(panel.webview, raw));
		panel.onDidChangeViewState(() => this.deps.onShown?.());
		panel.onDidDispose(() => {
			listening.dispose();
			this.tabs.delete(key);
			this.deps.onShown?.();
		});
		this.deps.onShown?.();
		panel.webview.html = await this.deps.page(panel.webview, tab);
	}

	shownComponents(): string[] {
		return [...this.tabs].filter(([key, panel]) => key.startsWith(COMPONENT) && panel.visible).map(([key]) => key.slice(COMPONENT.length));
	}

	/** For when another design system is shown: these tabs are of the last one. */
	closeComponents(): void {
		for (const [key, panel] of this.tabs) if (key.startsWith(COMPONENT)) panel.dispose();
	}
}
