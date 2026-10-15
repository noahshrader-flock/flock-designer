import type { RepoRef } from './repoRef';

/**
 * The app's settings, in one place: what it is pointed at (the design repository, the sign-in app), and what it assumes
 * about where people keep things. Each can be overridden by the environment where that is useful in development; none is
 * a secret. Read in the main process, the command line, the window and the published page alike.
 */

/** In a browser, where the published site's comments run, there is no environment: the page says which repository. */
const env: Record<string, string | undefined> = typeof process === 'undefined' ? {} : process.env;

/** Where projects and review threads live, for the app and the dsnr command alike. */
export const DESIGN_REPO: RepoRef = {
	owner: env.DSNR_REPO_OWNER ?? 'noahshrader-flock',
	repo: env.DSNR_REPO_NAME ?? 'flock-designer',
};

/**
 * The GitHub App the app signs in through.
 *
 * A client ID is not a secret -- the device flow exists precisely so a desktop app needs no client secret -- so it is
 * committed rather than configured. The environment variable is for pointing a development build at another app.
 *
 * The matching app must have device flow enabled and Issues write permission, and must be installed on the design
 * repository. A token it issues cannot see a repository the app is not installed on; verified 2026-10-05.
 */
export const CLIENT_ID = env.DSNR_CLIENT_ID ?? 'Iv23li2z9ayhXhGdFXCm';

/**
 * Signing in to comment on the published site (PUBLISHED_COMMENTS_PLAN, Phase 3): the GitHub App the page signs people in
 * through, and the function that trades the one-time code it gets for a token (`functions/sign-in`). Neither is a secret: the
 * client ID is in every sign-in address, and the function answers only the site's own origin. An empty client ID turns
 * signing in on the site off. The App's redirect address is the site's own (`pagesSiteUrl`).
 */
export const PAGES_SIGN_IN = {
	clientId: env.DSNR_PAGES_CLIENT_ID ?? 'Iv23li0GrlmvH5bs6nZy',
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
