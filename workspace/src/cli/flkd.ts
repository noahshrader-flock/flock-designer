import { execFile } from 'node:child_process';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import type { Iteration, Person } from '../shared/contract';
import { loginFromNoreply } from '../shared/people';
import { firstHeading, iterationLabel, projectPath, prototypePagePath, prototypeSourcePath } from '../shared/projects';
import { DESCRIPTOR_PATH } from '../main/services/descriptor';
import { DESIGN_REPO, DesignRepo, type GitHubApi } from '../main/services/designRepo';
import { recordsRootFor } from '../main/services/discovery';
import { readCheckout, runGit } from '../main/services/git';
import { BUILD_SKILL, cloneStore, prototypeBuildTask } from '../main/services/prototype';
import { shellLine } from '../main/services/prototypeBundle';
import { prototypeWork, whereTheChangeGoes } from '../main/services/prototypeWork';
import { buildSite } from '../site/buildSite';
import { serveSite } from '../site/serveSite';

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
	self: string[];
	/** GitHub, as its own command line is signed in to it, or null: who commented on a prototype is read through it. */
	github: GitHubApi | null;
}

/** GitHub's API through its command line, `gh`, signed in as the person running this. Read-only here. */
export const ghApi = (): GitHubApi => ({
	api: (path) =>
		new Promise((done, fail) =>
			execFile('gh', ['api', path], { maxBuffer: 64 * 1024 * 1024 }, (err, stdout) => {
				if (err) return fail(err);
				try {
					done(JSON.parse(stdout));
				} catch (e) {
					fail(e);
				}
			}),
		),
});

const USAGE = `Usage:
  flkd new-prototype --project <id> --note <what to make> [--title <project title>] [--from <branch>] [--product <dir>]
  flkd change-prototype --project <id> --name <v1-i1> --note <what to change> [--product <dir>]
  flkd save-prototype --project <id> --name <v1-i1> [--product <dir>]
  flkd build-site [--out <dir>] [--serve]

new-prototype records the next version (v1-i1 for a new project, then v2-i1, v3-i1) and prints the task: where to
write the prototype and how to check it builds. change-prototype does the same for a change to one: in its version's
newest iteration, or in the next when others have commented on that. save-prototype builds it and saves page and
source to the design repository. --note-file <path> may stand in for --note. --title is needed only for a new project.
build-site writes the site prototypes are published as, from the design repository, and --serve shows it here.`;

class UsageError extends Error {}

/** The product checkout: the one named, or the repository the agent is working in. */
const productOf = async (cwd: string, named: string | undefined): Promise<string> => {
	let root: string;
	try {
		root = realpathSync(named ? resolve(cwd, named) : (await runGit(cwd, ['rev-parse', '--show-toplevel'])).trim());
	} catch {
		throw new Error(named ? `There is no folder at ${named}.` : 'This is not inside a product repository. Run it from one, or pass --product.');
	}
	if (!existsSync(join(root, DESCRIPTOR_PATH))) throw new Error(`${root} has no ${DESCRIPTOR_PATH}, so Flock Designer cannot build prototypes from it.`);
	return root;
};

/**
 * Who is making it, as git knows them in the design repository, where the record is written. Their GitHub login, which
 * comments are known by, from a noreply address, else from GitHub's command line; records join people by name either way.
 */
const meOf = async (designRoot: string, github: GitHubApi | null): Promise<Person | null> => {
	const read = async (key: string) => (await runGit(designRoot, ['config', key]).catch(() => '')).trim();
	const name = await read('user.name');
	if (!name) return null;
	const login = loginFromNoreply(await read('user.email')) ?? (await github?.api('/user').then((u) => (u as { login?: unknown }).login).catch(() => null));
	return { name, login: typeof login === 'string' ? login : null };
};

const OPTIONS = {
	project: { type: 'string' },
	name: { type: 'string' },
	note: { type: 'string' },
	'note-file': { type: 'string' },
	title: { type: 'string' },
	from: { type: 'string' },
	product: { type: 'string' },
	out: { type: 'string' },
	serve: { type: 'boolean' },
} as const;

/** The options, or a usage error that says which one was wrong. */
const optionsOf = (args: string[]) => {
	try {
		return parseArgs({ args, options: OPTIONS, strict: true }).values;
	} catch (e) {
		throw new UsageError(e instanceof Error ? e.message : String(e));
	}
};

/** The design repository: the one being worked in, or the one beside the product repository being worked in. */
const designOf = async (cwd: string): Promise<string> => {
	let root: string;
	try {
		root = realpathSync((await runGit(cwd, ['rev-parse', '--show-toplevel'])).trim());
	} catch {
		throw new Error('This is not inside a repository. Run it from the design repository, or a product repository beside it.');
	}
	if (existsSync(join(root, 'projects')) && existsSync(join(root, 'skills'))) return root;
	const records = recordsRootFor(root);
	if (records === null) throw new Error(`There is no design repository beside ${root}. Clone flock-designer into the same folder.`);
	return dirname(records);
};

/** Builds the site from the design repository, with each iteration's comment count when GitHub can be asked. */
const site = async (deps: CliDeps, out: string | undefined, serve: boolean): Promise<number> => {
	const designRoot = await designOf(deps.cwd);
	const outDir = out ? resolve(deps.cwd, out) : join(deps.prototypesRoot, '_site');
	const comments = deps.github ? await new DesignRepo(deps.github, DESIGN_REPO).commentCounts().catch(() => undefined) : undefined;
	const built = buildSite({ designRoot, outDir, comments });
	const pages = built.projects.reduce((n, p) => n + p.pages, 0);
	deps.out(`Built ${pages} ${pages === 1 ? 'page' : 'pages'} in ${built.projects.length} ${built.projects.length === 1 ? 'project' : 'projects'} at ${outDir}.${comments ? '' : ' Comment counts are left out: GitHub could not be asked (is gh signed in?).'}`);
	if (serve) {
		const { url } = await serveSite(outDir);
		deps.out(`Serving it at ${url} on this machine only. Stop with Ctrl-C.`);
	}
	return 0;
};

/** What the agent is told: the skill and this run, then how to save it. */
const taskText = (lead: string, task: string, save: string): string =>
	[
		lead,
		'',
		task,
		'',
		'## When it builds',
		'',
		`Save it, with exactly: \`${save}\``,
		'Then say what you made, as the skill says, and that it is in Flock Designer.',
	].join('\n');

export const main = async (argv: string[], deps: CliDeps): Promise<number> => {
	try {
		const [command, ...rest] = argv;
		if (command !== 'new-prototype' && command !== 'change-prototype' && command !== 'save-prototype' && command !== 'build-site') {
			throw new UsageError(command ? `There is no command called ${command}.` : 'Say which command.');
		}
		const values = optionsOf(rest);
		if (command === 'build-site') return await site(deps, values.out, values.serve === true);
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
		const saveCommand = (name: string) => shellLine([...deps.self, 'save-prototype', '--project', projectId, '--name', name, '--product', root]);
		/** The build skill and this run: where to write, and how to check it builds. */
		const buildTask = async (skill: string, name: string, modelledOn: string, request: string): Promise<string> => {
			const { build, sources } = work.buildPlan(projectId, name, await work.sources(projectId, modelledOn));
			return prototypeBuildTask({ skill, build, sources, request });
		};

		if (command === 'save-prototype') {
			const name = values.name;
			if (!name) throw new UsageError('Say which prototype, with --name.');
			const change = await work.resumeChange(projectId, name);
			if (change === null) {
				await work.save(projectId, name);
			} else {
				const { version } = await work.finishChange(projectId, change, await meOf(designRoot, deps.github), `A change to ${iterationLabel(change.from)}`);
				if (version === null) {
					deps.out(`Nothing in ${name} changed from ${change.from.name}, so nothing was made or saved.`);
					return 0;
				}
			}
			deps.out(
				`Saved ${prototypeSourcePath(projectId, name)} and ${prototypePagePath(projectId, name)} in ${designRoot}. It is in Flock Designer (press Sync if the app is already open), which publishes it the next time it is open.`,
			);
			return 0;
		}

		const note = values['note-file'] ? readFileSync(resolve(deps.cwd, values['note-file']), 'utf8') : values.note;
		if (!note?.trim()) throw new UsageError(command === 'change-prototype' ? 'Say what to change, with --note or --note-file.' : 'Say what to make, with --note or --note-file.');
		// Read before anything is recorded: only an out-of-date design repository lacks it.
		const skill = await work.skill(BUILD_SKILL);

		if (command === 'change-prototype') {
			const name = values.name;
			if (!name) throw new UsageError('Say which prototype, with --name.');
			// Who has commented, read through GitHub's command line; not known (null) when it is missing or signed out.
			const repo = deps.github ? new DesignRepo(deps.github, DESIGN_REPO) : null;
			const authorsOf = async (it: Iteration): Promise<string[] | null> =>
				repo ? (await repo.readComments(projectId, it.branch).catch(() => null))?.map((c) => c.author) ?? null : null;
			const change = await work.startChange(projectId, name, authorsOf);
			const text = await buildTask(skill, change.target, change.from.name, note);
			const where = whereTheChangeGoes(change, name) ?? `The change is made in ${change.target}: change it, rather than starting again.`;
			const unsaved = change.fresh ? ` ${change.target} is recorded when it is saved.` : '';
			const signIn = change.unread ? ' (GitHub\'s command line, gh, is missing or not signed in.)' : '';
			deps.out(taskText(`${where}${signIn}${unsaved} Your task follows.`, text, saveCommand(change.target)));
			return 0;
		}

		const brief = await store.read(projectPath(projectId, 'brief.md'));
		const title = values.title ?? (brief === null ? null : firstHeading(brief));
		if (!title) throw new UsageError(`${projectId} is a new project, so it needs a title: --title.`);
		const branch = values.from ?? (await readCheckout(root)).branch;
		if (!branch) throw new UsageError('This checkout is not on a branch, so say which branch to model it on, with --from.');

		const iteration = await work.start(root, { projectId, title, note, branch, me: await meOf(designRoot, deps.github) });
		const text = await buildTask(skill, iteration.name, iteration.name, note);
		deps.out(taskText(`Recorded ${projectId} ${iteration.name}, modelled on ${branch}. Your task follows.`, text, saveCommand(iteration.name)));
		return 0;
	} catch (err) {
		deps.err(err instanceof UsageError ? `${err.message}\n\n${USAGE}` : `flkd: ${err instanceof Error ? err.message : String(err)}`);
		return err instanceof UsageError ? 2 : 1;
	}
};
