import { appendFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { findChrome } from '../src/core/services/browser/chromeHeadless';
import type { DrawnIndex } from '../src/core/services/designSystem/componentTokens';
import { editedFiles } from '../src/core/services/designSystem/tokenEdits';
import type { ConnectedDesignSystem, DesignToken } from '../src/shared/contract';
import { lengthParts } from '../src/shared/tokens';
import { settledAnswer } from './fixtures';
import { EVERY_LIBRARY } from './realCheckouts';
import { describeLibrary, onRealLibrary } from './realLibrary';

/**
 * Every component a token's Values name (tagging) must move when it changes (`reachWith`) and be listed in its control
 * (`users`). The other way is only said, not failed: a component may move in a part its Values do not read.
 *
 * Long (a build and every component drawn twice, per token), so run only when asked: `DSNR_REACH=1`, with `REACH_TOKENS` (how
 * many tokens Values name, most named first), `REACH_UNNAMED` (how many no Values name), `REACH_LIBS` and `REACH_OUT`.
 */
const ASKED = process.env.DSNR_REACH === '1';
const NAMED = Number(process.env.REACH_TOKENS ?? 6);
const UNNAMED = Number(process.env.REACH_UNNAMED ?? 2);
const say = (line: string) => (process.env.REACH_OUT ? appendFileSync(process.env.REACH_OUT, `${line}\n`) : console.log(line));

/** A value of its kind the token does not have, or null for a kind that cannot be changed here. */
const changedValue = (t: DesignToken): string | null => {
	if (t.kind === 'color') return t.value.toUpperCase() === '#E01E5A' ? '#1EE05A' : '#E01E5A';
	const parts = lengthParts(t.value);
	if (parts?.unit === 'px') return `${parts.number + 5}px`;
	if (parts?.unit === 'rem') return `${(parts.number * 16 + 5) / 16}rem`;
	return null;
};

const namedBy = (index: DrawnIndex, path: string): Set<string> => {
	const named = new Set<string>();
	for (const [file, values] of index.built.values) {
		if (values.state !== 'read') continue;
		for (const rows of [values.rows.light, values.rows.dark]) if (rows?.some((r) => r.cells.some((c) => c.tokens.includes(path)))) named.add(file);
	}
	return named;
};

const seconds = (since: number) => `${Math.round((Date.now() - since) / 1000)}s`;

const check = (system: ConnectedDesignSystem) => async () => {
	await onRealLibrary(system, async ({ tokens }) => {
		const started = Date.now();
		const index = await settledAnswer(
			() => tokens.drawn(),
			(x) => x.state === 'building',
			{ within: 240_000, every: 1000 },
		);
		if (index.state !== 'ready') throw new Error(`not drawn: ${JSON.stringify(index).slice(0, 300)}`);
		const { reading, order, values, files } = index.built;
		const withValues = [...values.values()].filter((v) => v.state === 'read').length;
		say(
			`\n## ${system.name}: ${order.length} components, ${withValues} with values, ${reading.tags.edits.length} tokens tagged; drawn in ${seconds(started)}`,
		);
		const candidates = reading.tags.edits.flatMap((e) => {
			const token = reading.tokens.find((t) => t.path === e.path);
			const to = token && changedValue(token);
			return token && to ? [{ token, to, named: namedBy(index, e.path) }] : [];
		});
		const picked = [
			...candidates
				.filter((c) => c.named.size > 0)
				.sort((a, b) => b.named.size - a.named.size)
				.slice(0, NAMED),
			...candidates.filter((c) => c.named.size === 0).slice(0, UNNAMED),
		];
		say(`${candidates.filter((c) => c.named.size > 0).length} tokens named by some component's Values; checking ${picked.length}`);
		const notMoved: string[] = [];
		const notListed: string[] = [];
		for (const { token, to, named } of picked) {
			const t0 = Date.now();
			const { reach } = await tokens.reachWith(index, (reads) => editedFiles(reads, [{ path: token.path, value: to }]));
			if (reach.state !== 'ready') throw new Error(`${token.path}: reach ${JSON.stringify(reach).slice(0, 300)}`);
			const moved = new Map(reach.moved.map((m) => [m.file, m]));
			const movedOnly = [...moved.keys()].filter((f) => !named.has(f));
			const drawsTag = (f: string) => files.get(f)?.uses.has(token.path) === true;
			// Moved and not named: in a part its Values do not read (the limit the tab says), its Values name no token, or no tag drawn.
			const inParts = movedOnly.filter((f) => moved.get(f)?.inside && drawsTag(f));
			const valuesUnnamed = movedOnly.filter((f) => !moved.get(f)?.inside);
			const noTag = movedOnly.filter((f) => moved.get(f)?.inside && !drawsTag(f));
			const missed = [...named].filter((f) => !moved.has(f));
			const users = await tokens.users(token.path);
			const listed = new Set(users.state === 'ready' ? users.users.map((u) => u.file) : []);
			notListed.push(...[...named].filter((f) => !listed.has(f)).map((f) => `${token.path}: ${f}`));
			notMoved.push(...missed.map((f) => `${token.path}: ${f}`));
			say(
				`- ${token.path} (${token.kind} ${token.value} → ${to}; ${seconds(t0)}): named ${named.size}, moved ${moved.size}; in parts its Values do not read ${inParts.length}; not drawn ${reach.notDrawn.length}`,
			);
			for (const f of missed) say(`    NAMED, NOT MOVED: ${f}`);
			for (const f of valuesUnnamed) {
				const changes = (moved.get(f)?.changes ?? []).map((c) => `${c.mode} ${c.property} ${c.from}→${c.to}`).slice(0, 3);
				say(`    VALUES MOVED, NOT NAMED: ${f} — ${changes.join('; ')}`);
			}
			for (const f of noTag) say(`    MOVED INSIDE, NO TAG DRAWN: ${f}`);
		}
		say(`(${system.name} done in ${seconds(started)})`);
		expect(notMoved).toEqual([]);
		expect(notListed).toEqual([]);
	});
};

const LIMIT = 6 * 3_600_000;
const only = process.env.REACH_LIBS?.split(',');
for (const { key, system, missing } of EVERY_LIBRARY)
	describeLibrary(missing, system, `how far a token reaches, ${key}`, () => {
		it.runIf(ASKED && findChrome() !== null && (!only || only.includes(key)))('moves every component its Values name', check(system), LIMIT);
	});
