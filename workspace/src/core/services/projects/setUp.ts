import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { basename, dirname, join } from 'node:path';
import type { Handed } from '../../../shared/contract';
import { DESIGN_REPO } from '../../../shared/config';
import { formatRepo, repoRefOf } from '../../../shared/repoRef';
import { claimedRepository, git } from '../platform/git';
import { DESCRIPTOR_PATH } from './descriptor';
import { type DesignRepositoryClones, isDesignRepository, notADesignRepository } from './discovery';
import { type SetupCheck, setupCheck } from './setupCheck';
import type { SourceAnswers } from './productDesignSystem';

/** The shared note an agent follows to set a product up, in the design repository as every skill is. */
export const SET_UP_SKILL = 'skills/set-up-a-product.md';

/**
 * Where the setup of the product open here stands: `not-set-up` for a repository with no workspace file (and not a
 * design repository); `review` for a product whose workspace file is not committed yet, with what DSNR reads of it, for
 * the person to look at before committing; null once it is committed, or with nothing to set up.
 */
export type SetupState = { state: 'not-set-up'; root: string } | { state: 'review'; root: string; check: SetupCheck } | null;

export const setupState = async (
	folders: string[],
	product: string | null,
	deps: { answers: Pick<SourceAnswers, 'of'>; clones: Pick<DesignRepositoryClones, 'at'> },
): Promise<SetupState> => {
	if (product === null) {
		const root = folders.find((f) => existsSync(join(f, '.git')) && !existsSync(join(f, DESCRIPTOR_PATH)) && !isDesignRepository(f));
		return root === undefined ? null : { state: 'not-set-up', root };
	}
	const uncommitted = await git(product, ['status', '--porcelain', '--untracked-files=normal', '--', DESCRIPTOR_PATH]).catch(() => '');
	return uncommitted === '' ? null : { state: 'review', root: product, check: await setupCheck(product, deps) };
};

/**
 * What changes as a setup moves on (the agent writing its files, the person committing them): the repository's status, one
 * git call, so a setup waiting hours for its review is read again only when it moved.
 */
export const setupMoved = (root: string): Promise<string> => git(root, ['status', '--porcelain', '--untracked-files=normal']).catch(() => '');

/**
 * The design repository a product is set up with: Flock's clone where the person keeps it, or beside the product under its
 * name; else the folder the person picks, kept for its repository as Phase 1's are. Null when they pick none.
 */
export const designRepositoryForSetup = async (
	root: string,
	{ clones, choose }: { clones: Pick<DesignRepositoryClones, 'at' | 'set'>; choose: () => Promise<string | null> },
): Promise<{ design: string; repository: string } | null> => {
	const flock = formatRepo(DESIGN_REPO);
	const known = [clones.at(flock), join(dirname(root), DESIGN_REPO.repo)].find((d): d is string => d !== null && isDesignRepository(d));
	const design = known ?? (await choose());
	if (design === null) return null;
	if (!isDesignRepository(design)) throw new Error(notADesignRepository(design));
	const claimed = await claimedRepository(design);
	// One found as Flock's is Flock's; one picked is named by its origin, never guessed to be Flock's.
	if (claimed === null && known === undefined)
		throw new Error(`${design} has no GitHub origin, so which design repository it is cannot be told: clone it from GitHub, then set up again.`);
	const repository = claimed ?? flock;
	// Found again once the workspace file names it: beside the product under its name, or kept as a clone picked for it.
	if (known === undefined && design !== join(dirname(root), repoRefOf(repository).repo)) clones.set(repository, design);
	return { design, repository };
};

/** The task for the agent: where things are and the exact commands, then the shared note itself. */
export const setUpTask = ({ root, design, repository, note }: { root: string; design: string; repository: string; note: string }): string => {
	const dsnr = (args: string) => `\`node "${join(design, 'workspace', 'bin', 'dsnr.mjs')}" ${args} --product "${root}"\``;
	const named =
		repository === formatRepo(DESIGN_REPO)
			? `(\`${repository}\`, Flock's: leave \`designRepository\` out)`
			: `(\`${repository}\`, not Flock's: write \`"designRepository": "${repository}"\`)`;
	return [
		'# Your task',
		'',
		`Set up the product in ${root} for DSNR, as the note below says. Nothing is committed for you.`,
		'',
		`- **The product:** ${root}`,
		`- **Its design repository:** ${design} ${named}`,
		`- **Write the agent files with:** ${dsnr('agent-files')}`,
		`- **Check with:** ${dsnr('check-setup')}`,
		'',
		note,
	].join('\n');
};

/** What the task file is called, in the app's own folder: beside the prototypes, never in a project's folder. */
export const setUpTaskFile = (prototypesRoot: string, root: string): string => join(prototypesRoot, '_set-up', `${basename(root)}.md`);

/** The `dsnr` command the task runs is built from the design repository's own workspace, so it must be installed there. */
export const assertCommandLineReady = (design: string): void => {
	const workspace = join(design, 'workspace');
	try {
		// As `bin/dsnr.mjs` finds it, so this says no exactly when that would.
		createRequire(join(workspace, 'package.json')).resolve('esbuild');
	} catch {
		throw new Error(`The dsnr command the setup runs is built from ${workspace}: run npm ci there first.`);
	}
};

/**
 * Hands the product at `root` to the person's agent to set up: its design repository found or picked, the task written
 * beside the prototypes, and the agent started as for every hand-off. DSNR runs nothing in the product itself.
 */
export const handSetUp = async ({
	root,
	clones,
	prototypesRoot,
	choose,
	hand,
}: {
	root: string;
	clones: Pick<DesignRepositoryClones, 'at' | 'set'>;
	prototypesRoot: string;
	choose: () => Promise<string | null>;
	hand: (prepare: () => Promise<{ root: string; what: string; taskFile: string; task: string }>) => Promise<Handed>;
}): Promise<Handed | null> => {
	if (existsSync(join(root, DESCRIPTOR_PATH))) throw new Error(`${basename(root)} is set up already: it has ${DESCRIPTOR_PATH}.`);
	const found = await designRepositoryForSetup(root, { clones, choose });
	if (found === null) return null;
	assertCommandLineReady(found.design);
	const note = readFileSync(join(found.design, SET_UP_SKILL), 'utf8');
	return hand(async () => ({
		root,
		what: `Set up ${basename(root)} for DSNR.`,
		taskFile: setUpTaskFile(prototypesRoot, root),
		task: setUpTask({ root, ...found, note }),
	}));
};
