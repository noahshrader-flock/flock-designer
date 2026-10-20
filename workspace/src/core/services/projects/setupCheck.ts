import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { A11Y_COMMAND, declaredTarget, readManifest } from '../accessibility/accessibilityBrief';
import { INSTALL_COMMAND } from '../codebase/install';
import { readJsonObject } from '../platform/jsonFile';
import { DESIGN_MODE_COMMAND, HANDOFF_COMMAND, LIGHT_CHECK_COMMAND } from '../../../shared/work';
import { errorText } from '../../../shared/result';
import { capitalize } from '../../../shared/titleCase';
import { DESCRIPTOR_PATH, type WorkspaceCommand, readDescriptor } from './descriptor';
import { type DesignRepositoryClones, designRepositoryMissing, recordsRootFor } from './discovery';
import { writeEntryFiles } from './entryFiles';
import { type SourceAnswers, productDesignSystem } from './productDesignSystem';

/** The commands DSNR runs or hands to an agent, by id, with what each is for: one a product does not declare is said. */
const USED: [id: string, forWhat: string][] = [
	[INSTALL_COMMAND, 'installs its packages when they are missing'],
	[DESIGN_MODE_COMMAND, 'runs the real product on mock data, for codebase work and its accessibility check'],
	[LIGHT_CHECK_COMMAND, 'runs the light check after every step of codebase work'],
	[HANDOFF_COMMAND, 'runs the gate that says codebase work is fit for engineering'],
	[A11Y_COMMAND, 'runs the accessibility scan the reviewers use'],
	['typecheck', 'runs the typecheck the reviewers use'],
	['lint', 'runs the lint the reviewers use'],
];

/** What every agent reads of the product before building (`agents/ui-guide.md`, "What to read"), in its context folder: without one, it stops. */
const GUIDANCE = ['README.md', 'manifest.md', 'standards/non-negotiables.md'];

/** DSNR runs a product's commands through these, and nothing else. */
const RUNNERS = ['npm', 'npx', 'node'];

/** The `package.json` script a command runs, when it runs one: `npm run x`, or `npm test`, `npm start`. */
const scriptOf = (argv: string[]): string | null => {
	if (argv[0] !== 'npm') return null;
	if (argv[1] === 'run' || argv[1] === 'run-script') return argv[2] ?? null;
	return argv[1] === 'test' || argv[1] === 'start' ? argv[1] : null;
};

export interface SetupCheck {
	/** What must be fixed before DSNR can use the product: a workspace file it cannot read, a command that runs what is not there. */
	problems: string[];
	/** What the product does not have that DSNR would use, each with what it is for: to act on, not a failure. */
	missing: string[];
	/** What the workspace file says DSNR may run, for the person to see before any is run. */
	commands: WorkspaceCommand[];
}

/**
 * How far the product at `root` is set up for DSNR, read the same way everything else reads it: its workspace file as DSNR
 * parses it, its scripts, its design system and design repository as found, and its agent files against what DSNR writes.
 * The app shows it after setup, and `dsnr check-setup` gives the agent doing the setup the same answer.
 */
export const setupCheck = async (
	root: string,
	{ answers, clones }: { answers: Pick<SourceAnswers, 'of'>; clones: Pick<DesignRepositoryClones, 'at'> },
): Promise<SetupCheck> => {
	let commands: WorkspaceCommand[];
	let pkg: string;
	let contextDir: string;
	let name: string;
	try {
		({
			product: name,
			commands,
			contextDir,
			designSystem: { package: pkg },
		} = readDescriptor(root));
	} catch (err) {
		return { problems: [errorText(err)], missing: [], commands: [] };
	}
	const problems: string[] = [];
	const scripts = readJsonObject(join(root, 'package.json'))?.scripts;
	const has = (script: string) => typeof scripts === 'object' && scripts !== null && script in scripts;
	for (const { id, argv } of commands) {
		if (!RUNNERS.includes(argv[0] ?? '')) problems.push(`${id} runs ${argv[0]}: DSNR runs commands through ${RUNNERS.join(', ')} only.`);
		const script = scriptOf(argv);
		if (script !== null && !has(script)) problems.push(`${id} runs the script ${script}, which package.json does not have.`);
	}
	const guidance = join(root, contextDir);
	for (const file of GUIDANCE)
		if (!existsSync(join(guidance, file))) problems.push(`There is no ${contextDir}/${file}, which every agent reads before building.`);
	const missing = USED.filter(([id]) => !commands.some((c) => c.id === id)).map(([id, forWhat]) => `No ${id} command: it ${forWhat}.`);
	const target = declaredTarget(readManifest(guidance), name);
	if (!target.declared)
		missing.push(`${capitalize(target.why)}: the conformance level is the team's to decide, and every accessibility check needs it.`);
	const found = await productDesignSystem(root, answers);
	if (found.state === 'none') missing.push(`No design system was found for ${pkg}, the package ${DESCRIPTOR_PATH} names.`);
	if (found.state === 'refused') missing.push(found.why);
	if (found.state === 'ask') missing.push(`Whether ${found.root} is ${pkg}'s source is asked in the app: ${found.why}.`);
	const records = recordsRootFor(root, { clones });
	if (records === null) missing.push(designRepositoryMissing(root));
	else {
		const files = writeEntryFiles(root, dirname(records), { write: false });
		if (files.written.length > 0) problems.push(`Its agent files are not as DSNR writes them (${files.written.join(', ')}): run dsnr agent-files.`);
		missing.push(...files.left.map(({ path, why }) => `${path} is left as it is, since ${why}.`));
	}
	return { problems, missing, commands };
};
