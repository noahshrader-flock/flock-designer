import type { Work, Person, Project } from '../shared/contract';
import { fromBrief } from '../shared/brief';
import { projectDir, projectPath, WORK_FILE, workPath } from '../shared/designPaths';
import { isBot, mergePeople } from '../shared/people';
import { workOrder, latestDate } from '../shared/projectList';
import { asRecord } from '../shared/json';
import { parseWork, toProjectWork } from '../shared/workRecords';
import type { RepoRef } from '../shared/repoRef';
import type { GitHubApi } from './github';
import { RepoFiles } from './repoFiles';
import { ReviewThreads } from './reviewThreads';

/**
 * The design repository, read through the API: its files (`RepoFiles`) and its review threads (`ReviewThreads`), and
 * what needs both, the project list.
 *
 * This is what makes reviewer mode possible: a PM opens the app and sees every project without cloning anything or
 * having git installed. Authors still use a real checkout -- that is the only difference between the two modes.
 */

/** Who has committed to a project's folder, and when it last changed. */
type Activity = { people: Person[]; updatedAt: string | null };

/** A project folder's own files, as last read: everything `listProjects` shows of it but the review threads, read every time. */
interface FolderReading {
	records: string[];
	work: Work[];
	brief: ReturnType<typeof fromBrief>;
	activity: Activity;
}

export class DesignRepo {
	readonly files: RepoFiles;
	readonly threads: ReviewThreads;
	/**
	 * Each project folder as last read, with its sha: a folder whose sha has not moved has not changed, so it is not read
	 * again. A refresh with nothing changed asks for the folder list and the threads only, not four reads a project.
	 */
	private readonly folders = new Map<string, FolderReading & { sha: string }>();

	constructor(session: GitHubApi, ref: RepoRef) {
		this.files = new RepoFiles(session, ref);
		this.threads = new ReviewThreads(session, ref);
	}

	/** Every project folder, with its records, branches and open comment count. */
	async listProjects(): Promise<Project[]> {
		const dirs = (await this.files.list('projects')).filter((e) => e.type === 'dir' && !e.name.startsWith('_'));
		const issues = await this.threads.byBranch();

		return Promise.all(
			dirs.map(async ({ name: id, sha }) => {
				const { records, brief, activity: folder, ...read } = await this.readFolder(id, sha);
				const work = read.work.map((it) => toProjectWork(it, issues.get(it.branch))).sort(workOrder);
				// Alphabetical, so the line does not reshuffle as versions are added.
				const people = mergePeople(
					work.flatMap((it) => it.contributors),
					folder.people,
				);
				return {
					id,
					...brief,
					records,
					work,
					people,
					// A change to the folder, or a comment on a review thread (GitHub dates a thread by its latest).
					updatedAt: latestDate([folder.updatedAt, ...work.map((it) => issues.get(it.branch)?.updatedAt)]),
				};
			}),
		);
	}

	/** A project folder, read again only when its sha has moved (`folders`), or the host gave none. */
	private async readFolder(id: string, sha: string | null): Promise<FolderReading> {
		const kept = sha === null ? undefined : this.folders.get(id);
		if (kept && kept.sha === sha) return kept;
		const records = (await this.files.list(projectDir(id)))
			.filter((f) => f.type === 'file')
			.map((f) => f.name)
			.sort();
		const activity = await this.folderActivity(id);
		const reading: FolderReading = {
			records,
			work: await this.readWork(id, records),
			brief: await this.readBrief(id, records),
			activity: activity ?? { people: [], updatedAt: null },
		};
		// Kept only when all of it was read: activity that could not be (a limit reached) is asked for again next time.
		if (sha === null || activity === null) this.folders.delete(id);
		else this.folders.set(id, { sha, ...reading });
		return reading;
	}

	/**
	 * Who has committed to the project's own folder (brief, review, decisions), and when it last changed. Best effort:
	 * a failure here must not hide the project list, and is null.
	 */
	private async folderActivity(id: string): Promise<Activity | null> {
		try {
			// Newest first, as GitHub lists them.
			const commits = await this.files.commits(projectDir(id));
			const people = [...commits].reverse().flatMap((c): Person[] => {
				const name = String(asRecord(asRecord(c.commit).author).name ?? '');
				const account = asRecord(c.author); // the GitHub account, when the email is linked to one
				const login = typeof account.login === 'string' && !isBot(account.login) ? account.login : null;
				return name && !isBot(name) ? [{ name, login }] : [];
			});
			return { people, updatedAt: latestDate(commits.map((c) => asRecord(asRecord(c.commit).committer).date)) };
		} catch {
			return null;
		}
	}

	/** One file from a project's folder, as text. */
	async readRecord(id: string, name: string): Promise<string> {
		const text = await this.files.readFile(projectPath(id, name));
		if (text === null) throw new Error(`${name} could not be read from the design repository.`);
		return text;
	}

	/** A project's title (its brief's heading, or its id) and its folder, from one read of its brief. */
	private async readBrief(id: string, records: string[]): Promise<{ title: string; folder: string | null }> {
		return fromBrief(id, records.includes('brief.md') ? await this.files.readFile(projectPath(id, 'brief.md')) : null);
	}

	/**
	 * A project's work, from `projects/<id>/work.json`.
	 *
	 * **Not from branches.** Work branches live in the product repository,
	 * which this app is deliberately unable to see -- that is what keeps a PM out
	 * of the product's source. The record is written into the project folder when
	 * a piece of work is recorded, so it is readable here with no extra access. The
	 * first version of this looked for branches in the design repo and listed
	 * "No branches yet" for every project.
	 *
	 * A missing or unreadable record means "no work recorded", never an
	 * error: a project folder exists before its first record does.
	 */
	private async readWork(id: string, records: string[]): Promise<Work[]> {
		if (!records.includes(WORK_FILE)) return [];
		const text = await this.files.readFile(workPath(id));
		// One that cannot be read is no work recorded, as a missing one is: the project is still listed.
		return parseWork(text ?? '') ?? [];
	}
}
