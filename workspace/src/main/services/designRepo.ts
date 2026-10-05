import type { Project, ProjectIteration, ReviewComment } from '../../shared/contract';
import type { GitHubSession } from './githubSession';

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
/** Marks the body of a resolved comment. Simple, and visible to someone reading on GitHub. */
const RESOLVED_MARK = '<!-- resolved -->';

export interface DesignRepoRef {
  owner: string;
  repo: string;
}

const asRecord = (v: unknown): Record<string, unknown> => (typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : {});
const asArray = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

/** `# Title` from a brief, or null. The id is used when there is none. */
const firstHeading = (markdown: string): string | null => {
  for (const line of markdown.split('\n')) {
    const m = /^#\s+(.+?)\s*$/.exec(line);
    if (m?.[1]) return m[1];
  }
  return null;
};

export class DesignRepo {
  constructor(
    private readonly session: GitHubSession,
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
        return {
          id,
          title: (await this.readBriefTitle(id, records)) ?? id,
          records,
          iterations,
          openComments: iterations.reduce((n, it) => n + (issues.get(it.branch)?.openComments ?? 0), 0),
        };
      }),
    );
  }

  private async readBriefTitle(id: string, records: string[]): Promise<string | null> {
    if (!records.includes('brief.md')) return null;
    const file = asRecord(await this.session.api(`${this.base}/contents/projects/${id}/brief.md`));
    if (typeof file.content !== 'string') return null;
    return firstHeading(Buffer.from(file.content, 'base64').toString('utf8'));
  }

  /** Review issues keyed by the branch they carry comments for. */
  private async listReviewIssues(): Promise<Map<string, { number: number; openComments: number }>> {
    const issues = asArray(
      await this.session.api(`${this.base}/issues?state=all&labels=${encodeURIComponent(ITERATION_LABEL)}&per_page=100`),
    ).map(asRecord);

    const byBranch = new Map<string, { number: number; openComments: number }>();
    for (const issue of issues) {
      const branch = /branch:\s*`([^`]+)`/.exec(String(issue.body ?? ''))?.[1];
      if (branch && typeof issue.number === 'number') {
        byBranch.set(branch, { number: issue.number, openComments: Number(issue.comments ?? 0) });
      }
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
      }))
      .sort((a, b) => {
        // Prototype iterations newest first, then the codebase branch.
        const codebase = (x: { branch: string }) => (x.branch.startsWith('fd/') ? 0 : 1);
        return codebase(a) - codebase(b) || b.name.localeCompare(a.name, undefined, { numeric: true });
      });
  }

  /** The issue carrying an iteration's comments, created on first use. */
  async ensureIssue(projectId: string, branch: string): Promise<number> {
    const existing = (await this.listReviewIssues()).get(branch);
    if (existing) return existing.number;

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
    return created.number;
  }

  async readComments(projectId: string, branch: string): Promise<ReviewComment[]> {
    const issue = (await this.listReviewIssues()).get(branch);
    if (!issue) return [];
    return asArray(await this.session.api(`${this.base}/issues/${issue.number}/comments?per_page=100`))
      .map(asRecord)
      .map((c) => {
        const body = String(c.body ?? '');
        const user = asRecord(c.user);
        return {
          id: Number(c.id),
          author: String(user.login ?? 'unknown'),
          authorAvatarUrl: typeof user.avatar_url === 'string' ? user.avatar_url : null,
          body: body.replace(RESOLVED_MARK, '').trim(),
          createdAt: String(c.created_at ?? ''),
          resolved: body.includes(RESOLVED_MARK),
          anchor: null,
        };
      });
  }

  async postComment(projectId: string, branch: string, body: string): Promise<ReviewComment> {
    const number = await this.ensureIssue(projectId, branch);
    const created = asRecord(
      await this.session.api(`${this.base}/issues/${number}/comments`, { method: 'POST', body: { body } }),
    );
    const user = asRecord(created.user);
    return {
      id: Number(created.id),
      author: String(user.login ?? 'unknown'),
      authorAvatarUrl: typeof user.avatar_url === 'string' ? user.avatar_url : null,
      body: String(created.body ?? ''),
      createdAt: String(created.created_at ?? ''),
      resolved: false,
      anchor: null,
    };
  }
}
