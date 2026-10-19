import type { Ports } from './ports';
import { locateClaude } from './services/agent/agent';
import { findEditor, openFolder, openPrompt, openSession } from './services/agent/editor';
import { ghApi } from './services/platform/ghCli';
import { realShareTools } from './services/codebase/shareTools';

/**
 * What every shell's ports share: the person's own tools on this machine, reached the same way from any shell (an address
 * checked over the network, their editor, Claude Code, their own `gh`, and git for a pull request). A shell adds only what
 * is its own: its dialogs, links, clipboard and drawing out of sight.
 */
export const toolPorts = (): Pick<Ports, 'httpStatus' | 'editor' | 'claude' | 'shareTools'> => {
	// The person's own command line, which opens their pull requests.
	const person = ghApi();
	return {
		httpStatus: async (url) => {
			const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(6000) });
			await res.body?.cancel();
			return res.status;
		},
		editor: { find: () => findEditor(), openFolder, openPrompt, openSession },
		claude: () => locateClaude(),
		shareTools: (root) => realShareTools(root, person),
	};
};
