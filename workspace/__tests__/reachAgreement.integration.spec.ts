import { appendFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { findChrome } from '../src/main/services/chromeHeadless';
import type { DrawnIndex } from '../src/main/services/componentTokens';
import { editedFiles } from '../src/main/services/tokenEdits';
import type { ConnectedDesignSystem, DesignToken, TokenEdit } from '../src/shared/contract';
import { lengthParts } from '../src/shared/tokens';
import { settledAnswer } from './fixtures';
import {
	REAL_FUI,
	REAL_PRIMER,
	REAL_TREMOR3,
	REAL_TREMOR4,
	describeWith,
	libraryMissing,
	primerMissing,
	tremor3Missing,
	tremor4Missing,
} from './realCheckouts';
import { onRealLibrary } from './realLibrary';

/**
 * REACH_PLAN Phase 1: the two measurements of a token, held against each other on real libraries. For each token, the
 * components whose Values name it (tagging), against the components that move when it is changed (`reachWith`, drawn again).
 * They should agree. Each that is in one and not the other is written down with what else is known of it, never hidden.
 *
 * Long (a build and every component drawn twice, per token), so run only when asked: `DSNR_REACH=1`, with `REACH_TOKENS` (how
 * many tokens Values name, most named first) and `REACH_UNNAMED` (how many no Values name) per library, and `REACH_OUT`.
 */
const ASKED = process.env.DSNR_REACH === '1';
const NAMED = Number(process.env.REACH_TOKENS ?? 6);
const UNNAMED = Number(process.env.REACH_UNNAMED ?? 2);
const say = (line: string) => (process.env.REACH_OUT ? appendFileSync(process.env.REACH_OUT, `${line}\n`) : console.log(line));

/** A value the token does not have, of its kind: what it is changed to. */
const changedValue = (t: DesignToken): string | null => {
	if (t.kind === 'color') return t.value.toUpperCase() === '#E01E5A' ? '#1EE05A' : '#E01E5A';
	const parts = lengthParts(t.value);
	if (!parts) return null;
	if (parts.unit === 'px') return `${parts.number + 5}px`;
	if (parts.unit === 'rem') return `${(parts.number * 16 + 5) / 16}rem`;
	return null;
};

/** The components whose Values name `path`, in either mode. */
const namedBy = (index: DrawnIndex, path: string): Set<string> => {
	const named = new Set<string>();
	for (const [file, values] of index.built.values) {
		if (values.state !== 'read') continue;
		for (const rows of [values.rows.light, values.rows.dark]) if (rows?.some((r) => r.cells.some((c) => c.tokens.includes(path)))) named.add(file);
	}
	return named;
};

const check = (system: ConnectedDesignSystem) => async () => {
	await onRealLibrary(system, async ({ tokens }) => {
		const started = Date.now();
		const index = await settledAnswer(
			() => tokens.drawn(),
			(x) => x.state === 'building',
			{ within: 1_200_000, every: 1000 },
		);
		if (index.state !== 'ready') throw new Error(`not drawn: ${JSON.stringify(index).slice(0, 300)}`);
		const { reading, order, values, files } = index.built;
		const drawnValues = [...values.values()].filter((v) => v.state === 'read').length;
		say(
			`\n## ${system.name}: ${order.length} components, ${drawnValues} with values, ${reading.tags.edits.length} tokens tagged, ${reading.tags.unmarked} untaggable; drawn in ${Math.round((Date.now() - started) / 1000)}s`,
		);
		const candidates = reading.tags.edits
			.map((e) => ({ token: reading.tokens.find((t) => t.path === e.path) as DesignToken, named: namedBy(index, e.path) }))
			.filter((c) => c.token && changedValue(c.token) !== null);
		const picked = [
			...candidates
				.filter((c) => c.named.size > 0)
				.sort((a, b) => b.named.size - a.named.size)
				.slice(0, NAMED),
			...candidates.filter((c) => c.named.size === 0).slice(0, UNNAMED),
		];
		say(`${candidates.filter((c) => c.named.size > 0).length} tokens named by some component's Values; checking ${picked.length}`);
		const total = { tokens: 0, named: 0, both: 0, namedOnly: 0, inParts: 0, valuesUnnamed: 0, noTag: 0, failed: 0 };
		for (const { token, named } of picked) {
			const t0 = Date.now();
			const edits: TokenEdit[] = [{ path: token.path, value: changedValue(token) as string }];
			const { reach } = await tokens.reachWith(index, (reads) => editedFiles(reads, edits));
			if (reach.state !== 'ready') {
				total.failed++;
				say(`- ${token.path}: reach ${reach.state} ${'error' in reach ? reach.error : ''}`);
				continue;
			}
			total.tokens++;
			const moved = new Map(reach.moved.map((m) => [m.file, m]));
			const both = [...named].filter((f) => moved.has(f));
			const namedOnly = [...named].filter((f) => !moved.has(f));
			const movedOnly = [...moved.keys()].filter((f) => !named.has(f));
			// What is known of each that moved and is not named: its stories draw the token in a part its Values do not read (the
			// limit the tab says), its Values moved and do not name it, or its stories draw no tag of it at all.
			const inParts = movedOnly.filter((f) => files.get(f)?.uses.has(token.path) && moved.get(f)?.inside);
			const valuesUnnamed = movedOnly.filter((f) => !moved.get(f)?.inside);
			const noTag = movedOnly.filter((f) => !files.get(f)?.uses.has(token.path) && moved.get(f)?.inside);
			Object.assign(total, {
				named: total.named + named.size,
				both: total.both + both.length,
				namedOnly: total.namedOnly + namedOnly.length,
				inParts: total.inParts + inParts.length,
				valuesUnnamed: total.valuesUnnamed + valuesUnnamed.length,
				noTag: total.noTag + noTag.length,
			});
			say(
				`- ${token.path} (${token.kind} ${token.value} → ${changedValue(token)}; ${Math.round((Date.now() - t0) / 1000)}s): named ${named.size}, moved ${moved.size}, both ${both.length}; moved in parts its Values do not read ${inParts.length}; not drawn ${reach.notDrawn.length}`,
			);
			for (const f of namedOnly) say(`    NAMED, NOT MOVED: ${f}`);
			for (const f of valuesUnnamed) {
				const changes = (moved.get(f)?.changes ?? []).map((c) => `${c.mode} ${c.property} ${c.from}→${c.to}`).slice(0, 3);
				say(`    VALUES MOVED, NOT NAMED: ${f} — ${changes.join('; ')}${files.get(f)?.uses.has(token.path) ? ' (its stories draw the tag)' : ''}`);
			}
			for (const f of noTag) say(`    MOVED INSIDE, NO TAG DRAWN: ${f}`);
		}
		say(`SUMMARY ${system.name}: ${JSON.stringify(total)}`);
		say(`(${system.name} done in ${Math.round((Date.now() - started) / 1000)}s)`);
		expect(order.length).toBeGreaterThan(0);
	});
};

const LIMIT = 6 * 3_600_000;
const primer: ConnectedDesignSystem = {
	id: 'primer/react',
	name: 'Primer',
	repository: 'primer/react',
	root: REAL_PRIMER,
	folder: 'packages/react',
	branch: 'main',
};
const tremor = (root: string, repository: string, name: string): ConnectedDesignSystem => ({
	id: repository,
	name,
	repository,
	root,
	folder: '',
	branch: 'main',
});
const only = process.env.REACH_LIBS?.split(',');
const wanted = (name: string) => ASKED && findChrome() !== null && (!only || only.includes(name));

describeWith(libraryMissing, 'how far a token reaches, FUI', () => {
	it.runIf(wanted('FUI'))('agrees with the components its Values name', check(REAL_FUI), LIMIT);
});
describeWith(primerMissing, 'how far a token reaches, Primer', () => {
	it.runIf(wanted('Primer'))('agrees with the components its Values name', check(primer), LIMIT);
});
describeWith(tremor3Missing, 'how far a token reaches, Tremor on Tailwind 3', () => {
	it.runIf(wanted('Tremor3'))('agrees with the components its Values name', check(tremor(REAL_TREMOR3, 'tremorlabs/tremor-npm', 'Tremor3')), LIMIT);
});
describeWith(tremor4Missing, 'how far a token reaches, Tremor on Tailwind 4', () => {
	it.runIf(wanted('Tremor4'))('agrees with the components its Values name', check(tremor(REAL_TREMOR4, 'tremorlabs/tremor', 'Tremor4')), LIMIT);
});
