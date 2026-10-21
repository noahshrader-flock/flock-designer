/**
 * A split, made: a branch DSNR names for each pull request, from the person's change as it was checked, each on the one it
 * stands on, and a draft for each. The person's own branch and checkout are never written to, nothing is checked out, and
 * nothing is pushed by force: a branch someone else moved since is refused by git, and said.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ConnectedDesignSystem, Divergence, SplitProposal } from '../../../shared/contract';
import { asArray, asRecord } from '../../../shared/json';
import { errorText } from '../../../shared/result';
import { isObjectId } from '../../../shared/sha';
import type { ShareTools } from '../../ports';
import { fetchRemoteCopy } from '../platform/fetch';
import { commitOnto, git, isAncestor, refTip } from '../platform/git';
import { dsnrBranchPattern, newDsnrBranch } from './dsnrBranch';
import { ScopedRecords } from './scopedRecords';

const WORD = 'split';
const PATTERN = dsnrBranchPattern(WORD);
const FETCH_TIMEOUT_MS = 30_000;

/** A part as kept: `commit` is the one DSNR made, `parent` what it was made on (the tip, or the part it stands on). */
interface KeptPart {
	name: string;
	branch: string;
	on: number | null;
	parent: string;
	commit: string;
	pullRequest: { number: number; url: string } | null;
	title: string;
	body: string;
}

/** `seen` is the split the person checked and proposed; `from` their branch, said in each pull request. */
interface KeptSplit {
	seen: string;
	baseBranch: string;
	parts: KeptPart[];
}

/** What a part is made of: its files on the tip (bytes, or null for one gone), and the words its pull request says. */
export interface PartToMake {
	name: string;
	on: number | null;
	files: Map<string, Buffer | null>;
	title: string;
	body: string;
}

const partOf = (raw: unknown): KeptPart | null => {
	const p = asRecord(raw);
	const pr = asRecord(p.pullRequest);
	const strings = [p.name, p.title, p.body].every((v) => typeof v === 'string');
	if (!strings || typeof p.branch !== 'string' || !PATTERN.test(p.branch) || !isObjectId(p.parent) || !isObjectId(p.commit)) return null;
	if (p.on !== null && typeof p.on !== 'number') return null;
	return {
		name: p.name as string,
		branch: p.branch,
		on: p.on as number | null,
		parent: p.parent as string,
		commit: p.commit as string,
		pullRequest: typeof pr.number === 'number' && typeof pr.url === 'string' ? { number: pr.number, url: pr.url } : null,
		title: p.title as string,
		body: p.body as string,
	};
};

/** Only a whole record of DSNR's own branches is kept; anything else in the file is left out. */
const parse = (raw: unknown): Record<string, KeptSplit> =>
	Object.fromEntries(
		Object.entries(asRecord(raw)).flatMap(([key, value]) => {
			const k = asRecord(value);
			const parts = asArray(k.parts).map(partOf);
			const whole = typeof k.seen === 'string' && typeof k.baseBranch === 'string' && parts.length > 0 && parts.every((p) => p !== null);
			return whole ? [[key, { seen: k.seen as string, baseBranch: k.baseBranch as string, parts: parts as KeptPart[] }]] : [];
		}),
	);

/** As `git add` would store it, the repository's filters for its path included (a file kept by Git LFS stays a pointer). */
const blobOf = async (root: string, path: string, bytes: Buffer): Promise<string> => {
	const dir = mkdtempSync(join(tmpdir(), 'dsnr-blob-'));
	try {
		writeFileSync(join(dir, 'blob'), bytes);
		return await git(root, ['hash-object', '-w', `--path=${path}`, join(dir, 'blob')]);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
};

const patchId = async (root: string, from: string, to: string): Promise<string> => {
	const diff = await git(root, ['diff', from, to], { trim: false });
	return diff === '' ? '' : ((await git(root, ['patch-id', '--stable'], { input: diff })).split(' ')[0] ?? '');
};

export class SplitBranches {
	private readonly records: ScopedRecords<KeptSplit>;

	constructor(
		private readonly deps: { system: () => ConnectedDesignSystem | null; file: string; tools: (root: string) => ShareTools; now?: () => Date },
	) {
		this.records = new ScopedRecords(deps.system, deps.file, parse);
	}

	/** Which split is proposed here, if one is: by what was checked. */
	proposed(): string | null {
		return this.records.read('')?.kept.seen ?? null;
	}

	/**
	 * Every branch is made here before any is pushed, and recorded as it is made; then each is pushed and opened in turn,
	 * recorded as it is. A failure partway leaves every branch named in the record, for `open` to go on with.
	 */
	async make(seen: string, tip: string, parts: PartToMake[]): Promise<SplitProposal> {
		const system = this.records.system();
		if (this.records.read('') !== null) throw new Error('A split is proposed here already: open the rest of it, or start it over.');
		const made: KeptPart[] = [];
		for (const part of parts) {
			const parent = part.on === null ? tip : made[part.on]!.commit;
			const blobs = new Map<string, string | null>();
			for (const [path, bytes] of part.files) blobs.set(path, bytes === null ? null : await blobOf(system.root, path, bytes));
			const commit = await commitOnto(system.root, parent, parent, blobs, `${part.title}\n\nSplit by DSNR.`);
			if (commit === null) throw new Error(`${part.name} changes nothing on ${system.branch}: it has the same already. Nothing was made.`);
			// Its own files and no other: what the check checked is what is proposed.
			const changed = (await git(system.root, ['diff', '--name-only', '-z', parent, commit], { trim: false })).split('\0').filter(Boolean);
			const outside = changed.filter((p) => !part.files.has(p));
			if (outside.length > 0) throw new Error(`${part.name}'s branch would change ${outside.join(', ')}, which is not its own. Nothing was made.`);
			made.push({ name: part.name, branch: '', on: part.on, parent, commit, pullRequest: null, title: part.title, body: part.body });
		}
		// Named and made only once every commit is: a name never left over from one that failed partway.
		for (const part of made) {
			part.branch = await this.newBranch(system, part.commit);
			this.records.keep(system, '', { seen, baseBranch: system.branch, parts: made.filter((p) => p.branch !== '') });
		}
		return this.open();
	}

	/** Each part not opened yet, in order, from the commits recorded: what was checked, whatever has been edited since. */
	async open(): Promise<SplitProposal> {
		const at = this.records.read('');
		if (at === null) throw new Error('There is no split proposed here to open.');
		const { system, kept } = at;
		const tools = this.deps.tools(system.root);
		const parts = [...kept.parts];
		for (const [i, part] of parts.entries()) {
			if (part.pullRequest !== null) continue;
			try {
				await tools.push(part.branch);
				const base = part.on === null ? kept.baseBranch : parts[part.on]!.branch;
				const pr = (await tools.findPr(part.branch)) ?? (await tools.createDraftPr(part.branch, part.title, part.body, base));
				parts[i] = { ...part, pullRequest: { number: pr.number, url: pr.url } };
				this.records.keep(system, '', { ...kept, parts });
			} catch (err) {
				const opened = parts.filter((p) => p.pullRequest !== null).length;
				throw new Error(`${opened} of ${parts.length} opened. ${part.name}: ${errorText(err)} Continue opens the rest.`);
			}
		}
		return this.shown({ ...kept, parts }, null);
	}

	/** What is proposed, and what each opened one has that DSNR did not put there; forgotten once none is open. */
	async current(): Promise<SplitProposal | null> {
		const at = this.records.read('');
		if (at === null) return null;
		const { system, kept } = at;
		const tools = this.deps.tools(system.root);
		const opened = kept.parts.filter((p) => p.pullRequest !== null);
		const open = await Promise.all(opened.map((p) => tools.isOpen(p.pullRequest!.number).catch(() => true)));
		if (opened.length === kept.parts.length && open.every((o) => !o)) {
			this.records.forget('');
			return null;
		}
		const divergence: (Divergence | null)[] = [];
		for (const part of kept.parts) divergence.push(part.pullRequest === null ? null : await this.diverged(system, kept, part));
		return this.shown(kept, divergence);
	}

	/** Forgotten here; a branch never pushed is removed only where it is still the commit DSNR made. What is on GitHub stays. */
	async startOver(): Promise<void> {
		const at = this.records.read('');
		if (at === null) return;
		for (const part of at.kept.parts.filter((p) => p.pullRequest === null))
			await git(at.system.root, ['update-ref', '-d', `refs/heads/${part.branch}`, part.commit]).catch(() => undefined);
		this.records.forget('');
	}

	private shown({ seen, baseBranch, parts }: KeptSplit, divergence: (Divergence | null)[] | null): SplitProposal {
		return {
			seen,
			baseBranch,
			parts: parts.map((p, i) => ({ name: p.name, branch: p.branch, on: p.on, pullRequest: p.pullRequest, divergence: divergence?.[i] ?? null })),
			opened: parts.filter((p) => p.pullRequest !== null).length,
		};
	}

	/** A name of DSNR's that no branch has, made at `commit`: never over a branch of that name. */
	private async newBranch(system: ConnectedDesignSystem, commit: string): Promise<string> {
		for (let tries = 0; tries < 8; tries++) {
			const branch = newDsnrBranch(WORD, this.deps.now?.() ?? new Date());
			const made = await git(system.root, ['update-ref', '-m', 'DSNR: a split', `refs/heads/${branch}`, commit, '']).then(
				() => true,
				() => false,
			);
			if (made) return branch;
		}
		throw new Error('No new branch name could be made for the split. Nothing was pushed.');
	}

	/** Test 18's reading: the commit DSNR made still on it, or not; and if not, whether its change is the same. */
	private async diverged(system: ConnectedDesignSystem, kept: KeptSplit, part: KeptPart): Promise<Divergence> {
		const tracking = `refs/remotes/origin/${part.branch}`;
		const failed = await fetchRemoteCopy(
			system.root,
			{ remote: 'origin', remoteRef: `refs/heads/${part.branch}`, trackingRef: tracking },
			{ timeoutMs: FETCH_TIMEOUT_MS, what: 'the pull request', branch: part.branch },
		);
		if (failed !== null) return { state: 'unread', why: failed };
		const now = await refTip(system.root, tracking);
		if (now === null) return { state: 'unread', why: `${part.branch} is no longer on GitHub.` };
		if (now === part.commit) return { state: 'same' };
		const files = (await git(system.root, ['diff', '--name-only', '-z', part.commit, now], { trim: false })).split('\0').filter(Boolean);
		if (await isAncestor(system.root, part.commit, now)) {
			const by = (await git(system.root, ['log', '--format=%an', `${part.commit}..${now}`])).split('\n').filter(Boolean);
			return { state: 'added', commits: by.length, by: [...new Set(by)], files };
		}
		// Rewritten: its own change is read from where it now leaves what it stands on.
		const under = part.on === null ? `refs/remotes/origin/${kept.baseBranch}` : `refs/remotes/origin/${kept.parts[part.on]!.branch}`;
		const fork = await git(system.root, ['merge-base', now, under]).catch(() => null);
		const sameChange = fork !== null && (await patchId(system.root, part.parent, part.commit)) === (await patchId(system.root, fork, now));
		return { state: 'rewritten', sameChange, files };
	}
}
