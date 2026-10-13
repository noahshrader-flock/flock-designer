import { foldersOf, sameFolder } from '../../src/shared/brief';
import type { Project, WorkspaceApi } from '../../src/shared/contract';
import { valueOf } from '../../src/shared/result';
import { PROJECT_ID } from '../../src/shared/validate';
import type { Ask } from './ask';

const NEW_FOLDER = '$(add) New folder…';

/**
 * A folder for a project, as VS Code's quick pick offers it: one there is, none, or a new one named in an input box.
 * Undefined when the person dismisses it. The same for a new prototype and for one already made.
 */
export const pickFolder = async (
	ask: Ask,
	projects: Project[],
	{ title, placeholder }: { title: string; placeholder: string },
): Promise<string | null | undefined> => {
	const picked = await ask.pick<string | null | typeof NEW_FOLDER>({
		title,
		placeholder,
		items: [
			{ label: 'No folder', value: null },
			...foldersOf(projects).map((f) => ({ label: f, value: f })),
			{ label: NEW_FOLDER, value: NEW_FOLDER },
		],
	});
	if (picked !== NEW_FOLDER) return picked;
	const named = await ask.text({ title, prompt: 'Name the folder', validate: (v) => (v.trim() ? null : 'Name the folder.') });
	return named === undefined ? undefined : named.trim();
};

/** The project a command was given, from a row's right-click menu (its `data-vscode-context`), or null. */
export const readProjectArg = (raw: unknown): string | null => {
	const id = typeof raw === 'object' && raw !== null ? (raw as { projectId?: unknown }).projectId : undefined;
	return typeof id === 'string' && PROJECT_ID.test(id) ? id : null;
};

/**
 * Puts a project in a folder, or takes it out of one (ELECTRON_MIGRATION_PLAN 4.5): the folder chosen (`pickFolder`),
 * saying which it is in now, kept in its brief by the core, and the projects told they changed. Nothing when the choice
 * is dismissed, or is the folder it is in.
 */
export const assignFolder = async (
	{ api, ask, onChanged }: { api: Pick<WorkspaceApi, 'listProjects' | 'assignFolder'>; ask: Ask; onChanged: () => void },
	projectId: string,
): Promise<void> => {
	const projects = valueOf(await api.listProjects());
	const project = projects.find((p) => p.id === projectId);
	if (!project) throw new Error(`There is no project ${projectId} here.`);
	const folder = await pickFolder(ask, projects, {
		title: `Assign ${project.title}'s folder`,
		placeholder: project.folder ? `${project.title} is in ${project.folder}` : `${project.title} is in no folder`,
	});
	if (folder === undefined) return;
	if (folder === null ? project.folder === null : project.folder !== null && sameFolder(folder, project.folder)) return;
	valueOf(await api.assignFolder(projectId, folder));
	onChanged();
};
