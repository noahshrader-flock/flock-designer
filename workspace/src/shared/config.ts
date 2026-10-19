import type { RepoRef } from './repoRef';

/** None of these is a secret: they are read in the published page as well as the core. */

/** In a browser, where the published site's comments run, there is no environment: the page says which repository. */
const env: Record<string, string | undefined> = typeof process === 'undefined' ? {} : process.env;

export const DESIGN_REPO: RepoRef = {
	owner: env.DSNR_REPO_OWNER ?? 'noahshrader-flock',
	repo: env.DSNR_REPO_NAME ?? 'flock-designer',
};

/**
 * Neither is a secret: the client ID is in every sign-in address, and the function (`functions/sign-in`) answers only the
 * site's origin. An empty client ID turns signing in off.
 */
export const PAGES_SIGN_IN = {
	clientId: env.DSNR_PAGES_CLIENT_ID ?? 'Iv23liexeTaJVsGleROl',
	exchange: env.DSNR_PAGES_EXCHANGE ?? 'https://dsnr-auth.vercel.app/api/exchange',
};

/** Flock's library's, a default for that repository only: any other design system's is asked for once, and kept with it. */
export const HOSTED_STORYBOOKS: Readonly<Record<string, string>> = {
	'flocksafety/flock-react-component-lib': 'https://develop--6617f3c579abb5c5e780fddc.chromatic.com/',
};

/** Relative to the home folder. */
export const CODE_FOLDERS = ['Documents/GitHub', 'GitHub', 'github', 'code', 'dev', 'src', 'repos', 'projects', 'workspace', 'Developer'];
/** For when none of the code folders is there yet; relative to the home folder, and the clone makes it. */
export const DEFAULT_CLONE_FOLDER = 'Documents/GitHub';
