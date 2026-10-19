import type { RepoRef } from './repoRef';

/**
 * The app's settings, in one place: what it is pointed at (the design repository, the published site's sign-in), and what it assumes
 * about where people keep things. Each can be overridden by the environment where that is useful in development; none is
 * a secret. Read in the core, the command line, the panel and the published page alike.
 */

/** In a browser, where the published site's comments run, there is no environment: the page says which repository. */
const env: Record<string, string | undefined> = typeof process === 'undefined' ? {} : process.env;

/** Where projects and review threads live, for the app and the dsnr command alike. */
export const DESIGN_REPO: RepoRef = {
	owner: env.DSNR_REPO_OWNER ?? 'noahshrader-flock',
	repo: env.DSNR_REPO_NAME ?? 'flock-designer',
};

/**
 * Signing in to comment on the published site: the GitHub App it signs people in through (redirecting to `pagesSiteUrl`),
 * and the function that trades its one-time code for a token (`functions/sign-in`). Neither is a secret: the client ID is
 * in every sign-in address, and the function answers only the site's origin. An empty client ID turns signing in off.
 */
export const PAGES_SIGN_IN = {
	clientId: env.DSNR_PAGES_CLIENT_ID ?? 'Iv23liexeTaJVsGleROl',
	exchange: env.DSNR_PAGES_EXCHANGE ?? 'https://dsnr-auth.vercel.app/api/exchange',
};

/**
 * Where a repository's Storybook is hosted, for the ones the app knows: a hint, since a library does not say it in its
 * files. Any other design system has no Storybook links, and is read the same in every other way.
 */
export const HOSTED_STORYBOOKS: Readonly<Record<string, string>> = {
	'flocksafety/flock-react-component-lib': 'https://develop--6617f3c579abb5c5e780fddc.chromatic.com/',
};

/** Folders, relative to the home folder, that hold nothing but code. Where a clone goes when none is chosen. */
export const CODE_FOLDERS = ['Documents/GitHub', 'GitHub', 'github', 'code', 'dev', 'src', 'repos', 'projects', 'workspace', 'Developer'];
/** Where a clone goes when none of the code folders is there yet, relative to the home folder: the clone makes it. */
export const DEFAULT_CLONE_FOLDER = 'Documents/GitHub';
