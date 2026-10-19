import type { Ports } from './ports';
import { ghApi } from './services/platform/ghCli';
import { realShareTools } from './services/codebase/shareTools';

export const toolPorts = (): Pick<Ports, 'httpStatus' | 'shareTools'> => {
	// The person's own command line, which opens their pull requests.
	const person = ghApi();
	return {
		httpStatus: async (url) => {
			const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(6000) });
			await res.body?.cancel();
			return res.status;
		},
		shareTools: (root) => realShareTools(root, person),
	};
};
