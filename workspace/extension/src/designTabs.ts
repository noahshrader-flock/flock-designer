import type * as VsCode from 'vscode';
import type { Panels } from './bridge';
import type { DesignTab } from './messages';

type TabPanel = Pick<VsCode.WebviewPanel, 'reveal' | 'onDidDispose' | 'dispose'> & {
	webview: Pick<VsCode.Webview, 'html' | 'onDidReceiveMessage' | 'postMessage'>;
};

/** What a tab is called: its component's name, or Primitives. */
const titleOf = (tab: DesignTab): string => (tab.kind === 'component' ? tab.name : 'Primitives');
const keyOf = (tab: DesignTab): string => (tab.kind === 'component' ? `component:${tab.id}` : 'primitives');

/**
 * The design system's tabs in VS Code's editor (ELECTRON_MIGRATION_PLAN 6.1): a component's, with its stories live and
 * what it is made from, and Primitives, the design system whole: what needs the room the side bar does not have. Each is
 * DSNR's own page (`page`), told the core's events as the panel is (`panels`), its asks answered as the panel's are
 * (`receive`). One tab each, brought forward when it is opened again.
 */
export class DesignTabs {
	private readonly tabs = new Map<string, TabPanel>();

	constructor(
		private readonly deps: {
			/** A new editor tab with this title, its page allowed to run its script and load from the extension's build. */
			create: (title: string) => TabPanel;
			page: (webview: TabPanel['webview'], tab: DesignTab) => Promise<string>;
			panels: Pick<Panels, 'add'>;
			receive: (webview: TabPanel['webview'], raw: unknown) => Promise<void>;
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
		panel.onDidDispose(() => {
			listening.dispose();
			this.tabs.delete(key);
		});
		panel.webview.html = await this.deps.page(panel.webview, tab);
	}

	/** Closes every component's tab: another design system is shown, and they are of the last one's. */
	closeComponents(): void {
		for (const [key, panel] of this.tabs) if (key.startsWith('component:')) panel.dispose();
	}
}
