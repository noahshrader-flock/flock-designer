import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import axe from 'axe-core';
import { describe, expect, it } from 'vitest';
import { contrastRatio } from '../src/shared/tokens';
import {
	CONTRAST_ENHANCED,
	CONTRAST_TEXT,
	DEFAULT_TARGET,
	WCAG_EDITION,
	WCAG_LEVELS,
	WCAG_VERSIONS,
	axeTag,
	axeTagsFor,
	describeTarget,
	editionOf,
	notAutomated,
	parseTarget,
	requiredAt,
} from '../src/shared/wcag';

describe('the thresholds', () => {
	it('are the W3C’s numbers, each with its success criterion, level, version and the W3C’s page for it', () => {
		expect([CONTRAST_TEXT.sc, CONTRAST_TEXT.ratio, CONTRAST_TEXT.level, CONTRAST_TEXT.since]).toEqual(['1.4.3', 4.5, 'AA', '2.0']);
		expect([CONTRAST_ENHANCED.sc, CONTRAST_ENHANCED.ratio, CONTRAST_ENHANCED.level, CONTRAST_ENHANCED.since]).toEqual(['1.4.6', 7, 'AAA', '2.0']);
		for (const c of [CONTRAST_TEXT, CONTRAST_ENHANCED]) expect(c.url).toMatch(/^https:\/\/www\.w3\.org\/WAI\/WCAG22\/Understanding\/[a-z-]+\.html$/);
	});

	it('meet the W3C’s known cases: black on white is 21:1, and #767676 on white is the lightest gray that is 4.5:1', () => {
		expect(contrastRatio('#000000', '#FFFFFF')).toBe(21);
		expect(contrastRatio('#767676', '#FFFFFF')!).toBeGreaterThanOrEqual(CONTRAST_TEXT.ratio);
		expect(contrastRatio('#777777', '#FFFFFF')!).toBeLessThan(CONTRAST_TEXT.ratio);
	});

	it('are asked for only at a target that includes them: contrast is AA, so not at Level A; one from 2.1 not at 2.0', () => {
		expect(requiredAt(CONTRAST_TEXT, { version: '2.0', level: 'A' })).toBe(false);
		expect(requiredAt(CONTRAST_TEXT, { version: '2.0', level: 'AA' })).toBe(true);
		const later = { sc: '1.4.11', name: 'Non-text Contrast', level: 'AA', since: '2.1', url: '' } as const;
		expect(requiredAt(later, { version: '2.0', level: 'AA' })).toBe(false);
		expect(requiredAt(later, { version: '2.1', level: 'AA' })).toBe(true);
		expect(requiredAt(CONTRAST_ENHANCED, DEFAULT_TARGET)).toBe(false);
	});
});

describe('a target', () => {
	it('is read as it is written in a manifest, and written back the same way', () => {
		expect(parseTarget('WCAG 2.0 Level A')).toEqual({ version: '2.0', level: 'A' });
		expect(parseTarget('**WCAG 2.1 AA**')).toEqual({ version: '2.1', level: 'AA' });
		expect(parseTarget('wcag 2.2 level aaa')).toEqual({ version: '2.2', level: 'AAA' });
		expect(parseTarget('Section 508')).toBeNull();
		expect(parseTarget('WCAG 3.0 Level A')).toBeNull();
		expect(describeTarget({ version: '2.0', level: 'A' })).toBe('WCAG 2.0 Level A');
	});

	it('becomes every axe tag at or below it, levels and versions both, since they are cumulative', () => {
		expect(axeTagsFor({ version: '2.0', level: 'A' })).toEqual(['wcag2a']);
		expect(axeTagsFor({ version: '2.2', level: 'AA' })).toEqual(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']);
		expect(DEFAULT_TARGET).toEqual({ version: '2.1', level: 'AA' });
		expect(axeTagsFor(DEFAULT_TARGET)).toEqual(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']);
	});

	it('says which of its parts no automated check covers, so they are left to a person and not skipped', () => {
		expect(notAutomated({ version: '2.0', level: 'AA' })).toEqual([]);
		expect(notAutomated({ version: '2.2', level: 'AA' })).toEqual(['WCAG 2.2 Level A']);
		expect(notAutomated(DEFAULT_TARGET)).toEqual([]);
	});
});

describe('the tags', () => {
	const ruled = new Set(axe.getRules().flatMap((r) => r.tags.filter((t) => /^wcag\d+a+$/.test(t))));

	it('are each one axe-core has rules for, and every WCAG tag axe-core has rules for is one of them', () => {
		const ours = WCAG_VERSIONS.flatMap((v) => WCAG_LEVELS.map((l) => axeTag(v, l))).filter((t): t is string => t !== null);
		for (const tag of ours) expect(ruled, `axe-core has no rules for ${tag}`).toContain(tag);
		for (const tag of ruled) expect(ours, `axe-core has rules for ${tag}, which the ladder does not name`).toContain(tag);
	});

	it('are the ladder in the accessibility standard, cell for cell', () => {
		const standard = readFileSync(join(__dirname, '../../standards/universal/accessibility.md'), 'utf8');
		for (const version of WCAG_VERSIONS) {
			const row = new RegExp(`^\\| \\*\\*WCAG ${version.replace('.', '\\.')}\\*\\* \\|(.+)\\|$`, 'm').exec(standard)?.[1];
			expect(row, `the standard has no row for WCAG ${version}`).toBeDefined();
			const cells = row!.split('|').map((c) => /`([^`]+)`/.exec(c)?.[1] ?? null);
			expect(cells).toEqual(WCAG_LEVELS.map((l) => axeTag(version, l)));
		}
	});
});

describe('the edition', () => {
	it('is read from the W3C’s page the way the weekly check reads it, and is the one recorded', () => {
		const page = readFileSync(join(__dirname, 'fixtures/w3c-wcag2-latest.html'), 'utf8');
		expect(editionOf(page)).toEqual({ version: WCAG_EDITION.version, published: WCAG_EDITION.published });
		expect(WCAG_EDITION.url).toContain(`REC-WCAG${WCAG_EDITION.version.replace('.', '')}-${WCAG_EDITION.published.replaceAll('-', '')}`);
	});

	it('is none, rather than a match, when the page no longer says its version or date the same way', () => {
		expect(editionOf('<title>Web Content Accessibility Guidelines (WCAG) 2.3</title>')).toBeNull();
		expect(editionOf('<p><time class="dt-published" datetime="2026-01-01">1 January 2026</time></p>')).toBeNull();
	});
});
