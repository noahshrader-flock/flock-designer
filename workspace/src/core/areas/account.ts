import type { CallsDeps } from '../compose';
/** What the Account calls do, each called by its handler once its arguments are checked (`calls/account.ts`). */
export const accountArea = (d: CallsDeps) => {
	const { github } = d;
	return {
		signInState: () => github.state(),
		signOut: () => {
			github.signOut();
			return null;
		},
	};
};

export type AccountArea = ReturnType<typeof accountArea>;
