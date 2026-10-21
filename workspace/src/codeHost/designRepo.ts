import type { Work, Person, Project } from '../shared/contract';
import { fromBrief } from '../shared/brief';
import { projectDir, projectPath, WORK_FILE, workPath } from '../shared/designPaths';
import { isBot, mergePeople } from '../shared/people';
import { workOrder, latestDate } from '../shared/projectList';
import { asRecord } from '../shared/json';
import { parseWork, toProjectWork } from '../shared/workRecords';
import { type RepoRef, formatRepo } from '../shared/repoRef';
import type { GitHubApi } from './github';
import { RepoFiles } from './repoFiles';
import { ReviewThreads } from './reviewThreads';

/** Read through the API so a reviewer sees every project without cloning anything or having git installed. */

type Activity = { people: Person[]; updatedAt: string | null };

/** Everything `listProjects` shows of a folder but the review threads, which are read every time. */
interface FolderReading {
	records: string[];
	work: Work[];
	brief: ReturnType<typeof fromBrief>;
	activity: Activity;
}

export class DesignRepo {
	readonly files: RepoFiles;
	readonly threads: ReviewThreads;
	/** A folder whose sha has not moved has not changed, so it is not read again. */
	private readonly folders = new Map<string, FolderReading & { sha: string }>();

	constructor(
		session: GitHubApi,
		readonly ref: RepoRef,
	) {
		this.files = new RepoFiles(session, ref);
		this.threads = new ReviewThreads(session, ref);
	}

	async listProjects(): Promise<Project[]> {
		const dirs = (await this.files.list('projects')).filter((e) => e.type === 'dir' && !e.name.startsWith('_'));
		const issues = await this.threads.byBranch({ counting: true });

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

	/** Null on failure: it must not hide the project list. */
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

	async readRecord(id: string, name: string): Promise<string> {
		const text = await this.files.readFile(projectPath(id, name));
		if (text === null) throw new Error(`${name} could not be read from the design repository.`);
		return text;
	}

	private async readBrief(id: string, records: string[]): Promise<{ title: string; folder: string | null }> {
		return fromBrief(id, records.includes('brief.md') ? await this.files.readFile(projectPath(id, 'brief.md')) : null);
	}

	/**
	 * From `work.json`, not from branches: those live in the product repository, which this is deliberately unable to see.
	 * A missing or unreadable record means no work, never an error: a project folder exists before its first record does.
	 */
	private async readWork(id: string, records: string[]): Promise<Work[]> {
		if (!records.includes(WORK_FILE)) return [];
		const text = await this.files.readFile(workPath(id));
		return parseWork(text ?? '') ?? [];
	}
}

/**
 * One `DesignRepo` for each design repository, made when first asked for, so each keeps its own caches and threads; `now` is
 * the one the open product belongs to, asked each time, so nothing outlives a change of product.
 */
export class DesignRepos {
	private readonly made = new Map<string, DesignRepo>();

	/** `make`: how one is made for a repository (a `DesignRepo` over the account's API, unless a test gives its own). */
	constructor(
		private readonly make: (ref: RepoRef) => DesignRepo,
		private readonly current: () => RepoRef,
	) {}

	now(): DesignRepo {
		const ref = this.current();
		const key = formatRepo(ref).toLowerCase();
		const known = this.made.get(key);
		if (known) return known;
		const made = this.make(ref);
		this.made.set(key, made);
		return made;
	}
}
