import type { CommentAnchor, Person, Project, ProjectIteration, ReviewComment } from '../../shared/contract';
import { GitHubError } from './github';
import { asPeople, isBot, mergePeople } from '../../shared/people';
import { asDate, asRoute, firstHeading, newestFirst } from '../../shared/projects';
import { RESOLVED_MARK, addressedAt, addressedIn, composeBody, isResolved, parseAnchor, parsePicture, stripAnchor, withAddressed, withResolved } from '../../shared/anchor';
import { asArray, asRecord } from '../../shared/json';

/**
 * The design repository, read through the API.
 *
 * This is what makes reviewer mode possible: a PM opens the app and sees every
 * project without cloning anything or having git installed. Authors still use a
 * real checkout -- that is the only difference between the two modes.
 *
 * Comments are GitHub issue comments, one issue per iteration. That choice is
 * what keeps a server out of the design: GitHub already stores them, notifies
 * people, and lets someone with only read access comment. Verified against the
 * real API on 2026-10-05.
 */

const ITERATION_LABEL = 'flock-designer:review';

export interface DesignRepoRef {
  owner: string;
  repo: string;
}

/** Where projects and review threads live, for the app and the flkd command alike. */
const env: Record<string, string | undefined> = typeof process === 'undefined' ? {} : process.env;
/** (In a browser, where the published site's comments run this, there is no environment: the page says which.) */
export const DESIGN_REPO: DesignRepoRef = {
  owner: env.FLOCK_DESIGNER_REPO_OWNER ?? 'noahshrader-flock',
  repo: env.FLOCK_DESIGNER_REPO_NAME ?? 'flock-designer',
};

/**
 * All this needs of GitHub: a signed-in call to its API. The app's session is one; so is `gh` on the command line, and a
 * token in a browser on the published site.
 */
export interface GitHubApi {
  api(path: string, init?: { method?: string; body?: unknown }): Promise<unknown>;
}



export class DesignRepo {
  constructor(
    private readonly session: GitHubApi,
    private readonly ref: DesignRepoRef,
  ) {}

  private get base(): string {
    return `/repos/${this.ref.owner}/${this.ref.repo}`;
  }

  /** Every project folder, with its records, branches and open comment count. */
  async listProjects(): Promise<Project[]> {
    const dirs = asArray(await this.session.api(`${this.base}/contents/projects`))
      .map(asRecord)
      .filter((e) => e.type === 'dir' && typeof e.name === 'string' && !String(e.name).startsWith('_'));

    const issues = await this.listReviewIssues();

    return Promise.all(
      dirs.map(async (dir) => {
        const id = String(dir.name);
        const records = asArray(await this.session.api(`${this.base}/contents/projects/${id}`))
          .map(asRecord)
          .filter((f) => f.type === 'file')
          .map((f) => String(f.name))
          .sort();

        const iterations = await this.readIterations(id, records, issues);
        // Alphabetical, so the line does not reshuffle as iterations are added.
        const people = mergePeople(
          iterations.flatMap((it) => it.contributors),
          await this.folderAuthors(id),
        );
        return {
          id,
          title: (await this.readBriefTitle(id, records)) ?? id,
          records,
          iterations,
          people,
          openComments: iterations.reduce((n, it) => n + (issues.get(it.branch)?.openComments ?? 0), 0),
        };
      }),
    );
  }

  /**
   * People who have committed to the project's own folder (brief, review,
   * decisions). Best effort: a failure here must not hide the project list.
   */
  private async folderAuthors(id: string): Promise<Person[]> {
    try {
      const commits = asArray(await this.session.api(`${this.base}/commits?path=projects/${id}&per_page=100`));
      return commits.reverse().flatMap((c): Person[] => {
        const name = String(asRecord(asRecord(asRecord(c).commit).author).name ?? '');
        const account = asRecord(asRecord(c).author); // the GitHub account, when the email is linked to one
        const login = typeof account.login === 'string' && !isBot(account.login) ? account.login : null;
        return name && !isBot(name) ? [{ name, login }] : [];
      });
    } catch {
      return [];
    }
  }

  /** One file from a project's folder, as text. */
  async readRecord(id: string, name: string): Promise<string> {
    const file = asRecord(await this.session.api(`${this.base}/contents/projects/${id}/${name}`));
    if (typeof file.content !== 'string') throw new Error(`${name} could not be read from the design repository.`);
    return Buffer.from(file.content, 'base64').toString('utf8');
  }

  /** Any file in the design repository, as text, or null when there is none. */
  async readFile(path: string): Promise<string | null> {
    try {
      const file = asRecord(await this.session.api(`${this.base}/contents/${path}`));
      // Over 1 MB, the contents API leaves the content out; the blob it names carries it, up to 100 MB.
      if (file.encoding === 'none' && typeof file.sha === 'string') {
        const blob = asRecord(await this.session.api(`${this.base}/git/blobs/${file.sha}`));
        return typeof blob.content === 'string' ? Buffer.from(blob.content, 'base64').toString('utf8') : null;
      }
      return typeof file.content === 'string' ? Buffer.from(file.content, 'base64').toString('utf8') : null;
    } catch (err) {
      if (err instanceof GitHubError && err.status === 404) return null;
      throw err;
    }
  }

  /** Whether a file is in the design repository. Over 1 MB GitHub sends only its details, so this stays cheap. */
  async hasFile(path: string): Promise<boolean> {
    try {
      await this.session.api(`${this.base}/contents/${path}`);
      return true;
    } catch (err) {
      if (err instanceof GitHubError && err.status === 404) return false;
      throw err;
    }
  }

  /**
   * Creates or replaces a file in the design repository, as one commit by the signed-in person. Used
   * only where there is no clone on this machine to write into: one writer per machine.
   */
  async writeFile(path: string, content: string, message: string): Promise<void> {
    const put = async () => {
      let sha: string | undefined;
      try {
        const have = asRecord(await this.session.api(`${this.base}/contents/${path}`));
        sha = typeof have.sha === 'string' ? have.sha : undefined;
      } catch (err) {
        if (!(err instanceof GitHubError && err.status === 404)) throw err;
      }
      await this.session.api(`${this.base}/contents/${path}`, {
        method: 'PUT',
        body: { message, content: Buffer.from(content, 'utf8').toString('base64'), ...(sha ? { sha } : {}) },
      });
    };
    try {
      await put();
    } catch (err) {
      // Someone else changed it between the read and the write: read again and write once more.
      if (err instanceof GitHubError && (err.status === 409 || err.status === 422)) return put();
      if (err instanceof GitHubError && (err.status === 403 || err.status === 404)) {
        throw new Error('Saving needs write access to the design repository. Ask someone who has it to add you.');
      }
      throw err;
    }
  }

  private async readBriefTitle(id: string, records: string[]): Promise<string | null> {
    if (!records.includes('brief.md')) return null;
    const file = asRecord(await this.session.api(`${this.base}/contents/projects/${id}/brief.md`));
    if (typeof file.content !== 'string') return null;
    return firstHeading(Buffer.from(file.content, 'base64').toString('utf8'));
  }

  /**
   * Review threads we created or found this session, by branch.
   *
   * GitHub's issue *listing* lags a new issue by ten seconds or more -- measured
   * 2026-10-05 -- even though fetching the issue by number is immediate. Without
   * this, the first comment on an iteration created a thread nobody could find,
   * so it never appeared, and the next comment created a second thread.
   */
  private readonly known = new Map<string, Set<number>>();

  /** Review issues keyed by the branch they carry comments for. */
  private async listReviewIssues(): Promise<Map<string, { number: number; numbers: number[]; openComments: number }>> {
    const issues = (await this.allPages(`${this.base}/issues?state=all&labels=${encodeURIComponent(ITERATION_LABEL)}`, 10)).map(asRecord);

    // More than one thread can exist for a branch (the listing lag above made
    // some). All of them are read, the oldest is written to, and none is lost.
    const byBranch = new Map<string, { number: number; numbers: number[]; openComments: number }>();
    for (const issue of issues) {
      const branch = /branch:\s*`([^`]+)`/.exec(String(issue.body ?? ''))?.[1];
      if (branch && typeof issue.number === 'number') {
        const have = byBranch.get(branch);
        const numbers = [...(have?.numbers ?? []), issue.number];
        byBranch.set(branch, {
          number: Math.min(...numbers),
          numbers,
          openComments: (have?.openComments ?? 0) + Number(issue.comments ?? 0),
        });
      }
    }
    for (const [branch, known] of this.known) {
      const have = byBranch.get(branch);
      const numbers = [...new Set([...(have?.numbers ?? []), ...known])];
      byBranch.set(branch, { number: Math.min(...numbers), numbers, openComments: have?.openComments ?? 0 });
    }
    return byBranch;
  }

  /**
   * A project's iterations, from `projects/<id>/iterations.json`.
   *
   * **Not from branches.** Iteration branches live in the product repository,
   * which this app is deliberately unable to see -- that is what keeps a PM out
   * of the product's source. The record is written into the project folder when
   * an iteration is created, so it is readable here with no extra access. The
   * first version of this looked for branches in the design repo and listed
   * "No branches yet" for every project.
   *
   * A missing or unreadable record means "no iterations recorded", never an
   * error: a project folder exists before its first iteration does.
   */
  private async readIterations(
    id: string,
    records: string[],
    issues: Map<string, { number: number }>,
  ): Promise<ProjectIteration[]> {
    if (!records.includes('iterations.json')) return [];
    const file = asRecord(await this.session.api(`${this.base}/contents/projects/${id}/iterations.json`));
    if (typeof file.content !== 'string') return [];

    let parsed: unknown;
    try {
      parsed = JSON.parse(Buffer.from(file.content, 'base64').toString('utf8'));
    } catch {
      return [];
    }

    return asArray(parsed)
      .map(asRecord)
      .filter((it) => typeof it.branch === 'string' && typeof it.name === 'string')
      .map((it) => ({
        name: String(it.name),
        branch: String(it.branch),
        issueNumber: issues.get(String(it.branch))?.number ?? null,
        previewUrl: typeof it.previewUrl === 'string' ? it.previewUrl : null,
        contributors: asPeople(it.contributors),
        commit: typeof it.commit === 'string' ? it.commit : null,
        createdAt: asDate(it.createdAt),
        route: asRoute(it.route),
      }))
      .sort(newestFirst);
  }

  /** The issue carrying an iteration's comments, created on first use. */
  async ensureIssue(projectId: string, branch: string): Promise<number> {
    const existing = (await this.listReviewIssues()).get(branch);
    if (existing) return existing.number;
    // Listings lag, so a thread made seconds ago may not be in `existing`.

    const created = asRecord(
      await this.session.api(`${this.base}/issues`, {
        method: 'POST',
        body: {
          title: `Review — ${projectId} (${branch})`,
          body: [
            `Review thread for **${projectId}**, branch: \`${branch}\`.`,
            '',
            'Comments here are written by Flock Designer and exported to the project record.',
            'Do not change the branch line above — the app finds this issue by it.',
          ].join('\n'),
          labels: [ITERATION_LABEL],
        },
      }),
    );
    if (typeof created.number !== 'number') {
      throw new Error(`Could not create a review thread for ${branch}.`);
    }
    this.known.set(branch, new Set([...(this.known.get(branch) ?? []), created.number]));
    return created.number;
  }

  /**
   * Every item of a list GitHub pages, 100 at a time. The first version read one page and stopped,
   * so the 101st comment on a thread (or the 101st review thread) silently never appeared. A limit
   * stops a runaway list; reaching it is said aloud rather than hidden.
   */
  private async allPages(path: string, maxPages: number): Promise<unknown[]> {
    const items: unknown[] = [];
    for (let page = 1; page <= maxPages; page++) {
      const batch = asArray(await this.session.api(`${path}${path.includes('?') ? '&' : '?'}per_page=100&page=${page}`));
      items.push(...batch);
      if (batch.length < 100) return items;
    }
    throw new Error(`There are more than ${maxPages * 100} of these on GitHub, which is more than this app reads.`);
  }

  /** One GitHub comment as the app knows it. The one place a comment's body is taken apart. */
  private toComment(raw: Record<string, unknown>): ReviewComment {
    const body = String(raw.body ?? '');
    const user = asRecord(raw.user);
    return {
      id: Number(raw.id),
      author: String(user.login ?? 'unknown'),
      authorAvatarUrl: typeof user.avatar_url === 'string' ? user.avatar_url : null,
      body: stripAnchor(body.replace(RESOLVED_MARK, '').trim()),
      createdAt: String(raw.created_at ?? ''),
      resolved: isResolved(body),
      addressedAt: addressedAt(body),
      addressedIn: addressedIn(body),
      anchor: parseAnchor(body),
      picture: parsePicture(body),
    };
  }

  /** How many comments each iteration's thread has, by the iteration's key: what the published site shows. */
  async commentCounts(): Promise<Map<string, number>> {
    return new Map([...(await this.listReviewIssues())].map(([branch, thread]) => [branch, thread.openComments]));
  }

  async readComments(projectId: string, branch: string): Promise<ReviewComment[]> {
    const issue = (await this.listReviewIssues()).get(branch);
    if (!issue) return [];
    const threads = await Promise.all(issue.numbers.map((n) => this.allPages(`${this.base}/issues/${n}/comments`, 20)));
    return threads
      .flat()
      .map(asRecord)
      .sort((a, b) => String(a.created_at ?? '').localeCompare(String(b.created_at ?? '')))
      .map((c) => this.toComment(c));
  }

  /**
   * Moves a comment's pin by rewriting the anchor inside its body. GitHub lets
   * a person edit their own comment and refuses anyone else, which is exactly
   * the rule wanted: you can move your own pins, not someone else's.
   */
  async moveComment(commentId: number, anchor: CommentAnchor): Promise<ReviewComment> {
    const path = `${this.base}/issues/comments/${commentId}`;
    const current = asRecord(await this.session.api(path));
    const body = String(current.body ?? '');
    const old = parseAnchor(body);
    const text = stripAnchor(body.replace(RESOLVED_MARK, '').trim());
    // The commit is when the comment was made, not when it was moved.
    // The picture is of where the comment was first placed, so it goes with the comment, not with the pin.
    const next = composeBody(text, { ...anchor, commit: old?.commit ?? anchor.commit }, parsePicture(body));
    return this.toComment(
      asRecord(await this.session.api(path, { method: 'PATCH', body: { body: withResolved(next, isResolved(body)) } })),
    );
  }

  /**
   * Marks a comment resolved, or open again. GitHub decides who may: the comment's author,
   * or anyone who can write to the repository, so nothing is enforced here.
   *
   * Reopening also clears the agent's mark: a comment reopened is one whose change was not what was meant, so it is
   * open as any other, with its pin, and Address can be run on it again.
   */
  async setResolved(commentId: number, resolved: boolean): Promise<ReviewComment> {
    const path = `${this.base}/issues/comments/${commentId}`;
    const current = asRecord(await this.session.api(path));
    const body = String(current.body ?? '');
    const next = resolved ? withResolved(body, true) : withAddressed(withResolved(body, false), null);
    if (isResolved(next) === isResolved(body) && addressedAt(next) === addressedAt(body)) return this.toComment(current);
    const updated = await this.session.api(path, { method: 'PATCH', body: { body: next } });
    return this.toComment(asRecord(updated));
  }

  /**
   * Records that the agent acted on a comment, with the commit it made (on a prototype, the hash of its source, and
   * the iteration it is in), and resolves it in the same write: its pin leaves the page, where it would otherwise point
   * at what the agent just changed or removed. The person can still reopen it, and the mark stays to say what was done.
   *
   * Clears the mark when the commit is null, which is what re-addressing a comment that changed nothing should do. That
   * leaves the comment open or resolved as the person had it.
   */
  async setAddressed(commentId: number, commit: string | null, iteration: string | null = null): Promise<ReviewComment> {
    const path = `${this.base}/issues/comments/${commentId}`;
    const current = asRecord(await this.session.api(path));
    const body = String(current.body ?? '');
    const addressed = withAddressed(body, commit, iteration);
    // Resolved only when a change was recorded: `withAddressed` writes only a real commit.
    const marked = addressedAt(addressed) === null ? addressed : withResolved(addressed, true);
    // Judged by what the marks say, not by the text: rewriting them can reorder a body that already says it.
    const same = addressedAt(marked) === addressedAt(body) && addressedIn(marked) === addressedIn(body) && isResolved(marked) === isResolved(body);
    if (same) return this.toComment(current);
    const updated = await this.session.api(path, { method: 'PATCH', body: { body: marked } });
    return this.toComment(asRecord(updated));
  }

  /**
   * Deletes a comment for good: GitHub keeps no copy. GitHub decides who may (the comment's author, or
   * anyone who can write to the repository), and its refusal is put in words a person can act on.
   * A comment that is already gone counts as deleted: someone else got there first.
   */
  async deleteComment(commentId: number): Promise<void> {
    try {
      await this.session.api(`${this.base}/issues/comments/${commentId}`, { method: 'DELETE' });
    } catch (err) {
      if (err instanceof GitHubError && err.status === 404) return;
      if (err instanceof GitHubError && err.status === 403) {
        throw new GitHubError("Only a comment's author, or someone who can write to the design repository, can delete it.", 403);
      }
      throw err;
    }
  }

  async postComment(
    projectId: string,
    branch: string,
    body: string,
    anchor: CommentAnchor | null = null,
    picture: string | null = null,
  ): Promise<ReviewComment> {
    const number = await this.ensureIssue(projectId, branch);
    const created = asRecord(
      await this.session.api(`${this.base}/issues/${number}/comments`, {
        method: 'POST',
        body: { body: composeBody(body, anchor, picture) },
      }),
    );
    // Read back from what GitHub stored, so what the window shows is what was saved.
    return this.toComment(created);
  }
}
