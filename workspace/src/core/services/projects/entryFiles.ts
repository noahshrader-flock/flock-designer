import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';

/**
 * Pointers, never copies, where each agent looks, as measured: Claude Code reads `.claude/agents` and prefers `CLAUDE.md`
 * to `AGENTS.md`; Codex reads `.agents/skills`; Copilot's command line reads both; VS Code's Chat reads `AGENTS.md`.
 */

/** The definitions in the design repository's `agents/` an agent can run as one of its own. */
export const DEFINITIONS = [
	{
		name: 'dsnr',
		description:
			'Builds Flock product prototypes and codebase work with the real design system, tokens and product patterns. Use to build, prototype, mock up, recreate, critique or polish a product view or UI, including from a screenshot, sketch or Figma reference.',
		readOnly: false,
	},
	{
		name: 'implementation-reviewer',
		description:
			'Reviews the implementation of a prototype or view: architecture, TypeScript, import boundaries and the prototype boundary, apart from visual parity. Use before handing work to engineering. Read-only.',
		readOnly: true,
	},
	{
		name: 'product-parity-reviewer',
		description:
			'Reviews whether a view feels native to the product: its patterns, design system use, layout, interaction and copy, apart from implementation. Read-only.',
		readOnly: true,
	},
] as const;

const SECTION_START = '<!-- dsnr:agents -->';
const SECTION_END = '<!-- /dsnr:agents -->';
const SECTION_HEADING = '## Product UI and prototype work';

/** Where DSNR's part of an `AGENTS.md` is: between its marks, or, as one made by hand before them, under its heading. */
const sectionIn = (text: string): { start: number; end: number; marked: boolean } | null => {
	const start = text.indexOf(SECTION_START);
	const end = text.indexOf(SECTION_END);
	if (start !== -1 && end > start) return { start, end: end + SECTION_END.length, marked: true };
	const heading = text.search(new RegExp(`^${SECTION_HEADING}$`, 'm'));
	if (heading === -1) return null;
	const next = text.slice(heading + SECTION_HEADING.length).search(/^## /m);
	return { start: heading, end: next === -1 ? text.length : heading + SECTION_HEADING.length + next, marked: false };
};

const withFields = (fields: Record<string, string>, body: string) =>
	`---\n${Object.entries(fields)
		.map(([key, value]) => `${key}: ${value}`)
		.join('\n')}\n---\n\n${body}`;

const pointer = (design: string, name: string) =>
	`Read **\`${design}/agents/${name}.md\`** in full, then follow it as your operating instructions. What is true of this repository is in \`.dsnr/\`, which it says how to read.\n\nThat file is the definition; this one is only where this agent looks for it. Do not act before reading it.\n`;

/** `design`: the design repository, as a path from the product's root. */
const agentsSection = (design: string) =>
	[
		SECTION_START,
		SECTION_HEADING,
		'',
		`For any product UI work, read \`${design}/agents/ui-guide.md\` in full first: what to read, the rules, and what to say when you finish. To build, prototype, mock up, recreate, or critique a product view or UI, use the **dsnr** agent where yours runs one of its own (\`${design}/agents/dsnr.md\`, deciding the path first as its "Which path" says, and naming it in what you hand over); otherwise read that definition and follow it directly, saying so. If you cannot read \`${design}\`, say so before building and ask for it to be opened: do not guess at its rules. Wait for whatever you hand to an agent of your own before you finish: never leave it running.`,
		SECTION_END,
	].join('\n');

interface EntryFile {
	path: string;
	text: (existing: string | null) => string;
	/** Whether a file already there is DSNR's own to replace; one that is the product's own is left, with why. */
	ours: (existing: string) => boolean;
	why: string;
}

export const entryFiles = (design: string): EntryFile[] => [
	{
		path: 'AGENTS.md',
		// Only DSNR's section changes: the rest is the product's own.
		text: (existing) => {
			const section = agentsSection(design);
			if (existing === null) return `${section}\n`;
			const at = sectionIn(existing);
			if (at === null) return `${existing.trimEnd()}\n\n${section}\n`;
			// What follows a section made by hand starts at its next heading, so it is kept a blank line apart.
			const after = existing.slice(at.end);
			const kept = at.marked ? after : after ? `\n\n${after}` : '\n';
			return `${existing.slice(0, at.start)}${section}${kept}`;
		},
		// A section by that name that does not send work to the guide is the product's own.
		ours: (existing) => {
			const at = sectionIn(existing);
			return at === null || at.marked || existing.slice(at.start, at.end).includes(`${design}/agents/ui-guide.md`);
		},
		why: `it has a "${SECTION_HEADING.slice(3)}" section of its own, which does not send work to the guide: rename it, or put DSNR's in its place`,
	},
	{
		path: 'CLAUDE.md',
		text: () => '@AGENTS.md\n',
		ours: (existing) => existing.trim() === '@AGENTS.md',
		why: 'it has instructions of its own, which Claude Code reads in place of AGENTS.md: move them into AGENTS.md and make it `@AGENTS.md`',
	},
	...DEFINITIONS.flatMap(({ name, description, readOnly }) => {
		const isPointer = (existing: string) => existing.includes(`${design}/agents/${name}.md`);
		const why = `it is not a pointer at ${design}/agents/${name}.md`;
		return [
			{
				path: `.claude/agents/${name}.md`,
				text: () =>
					withFields(
						{ name, description, tools: readOnly ? 'Read, Grep, Glob, Bash' : 'Read, Grep, Glob, Write, Edit, Bash' },
						pointer(design, name),
					),
				ours: isPointer,
				why,
			},
			{
				path: `.agents/skills/${name}/SKILL.md`,
				text: () => withFields({ name, description }, pointer(design, name)),
				ours: isPointer,
				why,
			},
		];
	}),
];

export interface EntryFilesWritten {
	written: string[];
	unchanged: string[];
	/** Files left as they are, as they are the product's own. */
	left: { path: string; why: string }[];
}

/**
 * Into the product's working tree, never committed: they are the product's files, for the person to review and commit.
 * With `write` false nothing is written, and `written` says what would be: a product's own check that they have not drifted.
 */
export const writeEntryFiles = (productRoot: string, designRoot: string, { write = true }: { write?: boolean } = {}): EntryFilesWritten => {
	const design = relative(productRoot, designRoot).split(sep).join('/');
	const done: EntryFilesWritten = { written: [], unchanged: [], left: [] };
	for (const file of entryFiles(design)) {
		const at = join(productRoot, file.path);
		const existing = existsSync(at) ? readFileSync(at, 'utf8') : null;
		if (existing !== null && !file.ours(existing)) {
			done.left.push({ path: file.path, why: file.why });
			continue;
		}
		const text = file.text(existing);
		if (text === existing) {
			done.unchanged.push(file.path);
			continue;
		}
		if (write) {
			mkdirSync(dirname(at), { recursive: true });
			writeFileSync(at, text);
		}
		done.written.push(file.path);
	}
	return done;
};
