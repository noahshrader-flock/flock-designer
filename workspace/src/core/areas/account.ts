import type { CallsDeps } from '../compose';
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
