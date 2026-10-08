import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { parseArgs } from 'node:util';
import type { Person } from '../shared/contract';
import { firstHeading, projectPath, prototypePagePath, prototypeSourcePath } from '../shared/projects';
import { DESCRIPTOR_PATH } from '../main/services/descriptor';
import { recordsRootFor } from '../main/services/discovery';
import { readCheckout, runGit } from '../main/services/git';
import { BUILD_SKILL, cloneStore, prototypeBuildTask } from '../main/services/prototype';
import { prototypeWork } from '../main/services/prototypeWork';

/**
 * `flkd`: making a prototype from Claude Code in VS Code, with no app running.
 *
 * The same service the app calls, given this machine's paths instead of the app's: the product checkout the agent is
 * working in, the design repository's clone beside it, and the app's own prototype folder, so a prototype made here
 * is one the app shows, and one made in the app can be saved from here. It writes to the clone only; the app
 * publishes it the next time it is open, as it does every record.
 */
export interface CliDeps {
	cwd: string;
	out: (text: string) => void;
	err: (text: string) => void;
	/** The app's prototype folder on this machine. */
	prototypesRoot: string;
	/** The bundler's entry point, or null when it is not installed here. */
	esbuild: string | null;
	/** How to run this command again, for the step the agent is told to take next. */
	self: string;
}

const USAGE = `Usage:
  flkd new-prototype --project <id> --note <what to make> [--title <project title>] [--from <branch>] [--product <dir>]
  flkd save-prototype --project <id> --name <v1-i1> [--product <dir>]

new-prototype records the next version (v1-i1 for a new project, then v2-i1, v3-i1) and prints the task: where to
write the prototype and how to check it builds. save-prototype builds it and saves page and source to the design
repository. --note-file <path> may stand in for --note. --title is needed only for a new project.`;

class UsageError extends Error {}

/** The product checkout: the one named, or the repository the agent is working in. */
const productOf = async (cwd: string, named: string | undefined): Promise<string> => {
	let root: string;
	try {
		root = realpathSync(named ?? (await runGit(cwd, ['rev-parse', '--show-toplevel'])).trim());
	} catch {
		throw new Error(named ? `There is no folder at ${named}.` : 'This is not inside a product repository. Run it from one, or pass --product.');
	}
	if (!existsSync(join(root, DESCRIPTOR_PATH))) throw new Error(`${root} has no ${DESCRIPTOR_PATH}, so Flock Designer cannot build prototypes from it.`);
	return root;
};

/** Who is making it, as git knows them here. No GitHub sign-in from the command line, so no login. */
const meOf = async (root: string): Promise<Person | null> => {
	const name = (await runGit(root, ['config', 'user.name']).catch(() => '')).trim();
	return name ? { name, login: null } : null;
};

export const main = async (argv: string[], deps: CliDeps): Promise<number> => {
	try {
		const [command, ...rest] = argv;
		if (command !== 'new-prototype' && command !== 'save-prototype') throw new UsageError(command ? `There is no command called ${command}.` : 'Say which command.');
		let parsed;
		try {
			parsed = parseArgs({
				args: rest,
				options: {
					project: { type: 'string' },
					name: { type: 'string' },
					note: { type: 'string' },
					'note-file': { type: 'string' },
					title: { type: 'string' },
					from: { type: 'string' },
					product: { type: 'string' },
				},
				strict: true,
			});
		} catch (e) {
			throw new UsageError(e instanceof Error ? e.message : String(e));
		}
		const { values } = parsed;
		const projectId = values.project;
		if (!projectId) throw new UsageError('Say which project, with --project.');

		const root = await productOf(deps.cwd, values.product);
		const records = recordsRootFor(root);
		if (records === null) throw new Error(`There is no design repository beside ${root}. Clone flock-designer into the same folder.`);
		const designRoot = dirname(records);
		const store = cloneStore(designRoot, () => undefined);
		const work = prototypeWork({
			prototypesRoot: deps.prototypesRoot,
			productRoot: () => root,
			store: () => store,
			readDesignFile: (path) => store.read(path),
			esbuild: () => deps.esbuild,
		});

		if (command === 'save-prototype') {
			const name = values.name;
			if (!name) throw new UsageError('Say which prototype, with --name.');
			await work.save(projectId, name);
			deps.out(`Saved ${prototypeSourcePath(projectId, name)} and ${prototypePagePath(projectId, name)} in ${designRoot}. Flock Designer shows it now, and publishes it the next time it is open.`);
			return 0;
		}

		const note = values['note-file'] ? readFileSync(values['note-file'], 'utf8') : values.note;
		if (!note?.trim()) throw new UsageError('Say what to make, with --note or --note-file.');
		const brief = await store.read(projectPath(projectId, 'brief.md'));
		const title = values.title ?? (brief === null ? null : firstHeading(brief));
		if (!title) throw new UsageError(`${projectId} is a new project, so it needs a title: --title.`);
		const skill = await store.read(BUILD_SKILL);
		if (skill === null) throw new Error(`The design repository has no ${BUILD_SKILL}. Update it (git pull) and try again.`);
		const branch = values.from ?? (await readCheckout(root)).branch;
		if (!branch) throw new UsageError('This checkout is not on a branch, so say which branch to model it on, with --from.');

		const iteration = await work.start(root, { projectId, title, note, branch, me: await meOf(root) });
		const { build, sources } = work.buildPlan(projectId, iteration.name, await work.sources(projectId, iteration.name));
		const save = `${deps.self} save-prototype --project ${projectId} --name ${iteration.name} --product ${JSON.stringify(root)}`;
		deps.out(
			[
				`Recorded ${projectId} ${iteration.name}, modelled on ${branch}. Your task follows.`,
				'',
				prototypeBuildTask({ skill, build, sources, request: note }),
				'',
				'## When it builds',
				'',
				`Save it, with exactly: \`${save}\``,
				'Then say what you made, as the skill says, and that it is in Flock Designer.',
			].join('\n'),
		);
		return 0;
	} catch (err) {
		deps.err(err instanceof UsageError ? `${err.message}\n\n${USAGE}` : `flkd: ${err instanceof Error ? err.message : String(err)}`);
		return err instanceof UsageError ? 2 : 1;
	}
};
