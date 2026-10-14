import { describe, expect, it, vi } from 'vitest';
import { FIGMA_READ_RULES, allowFigma, hasFigmaAccess, mentionsFigma, offerFigmaAccess, settingsPath } from '../extension/src/figmaAccess';

/**
 * Claude Code asks before each call to an MCP tool, Figma's included, so a build that reads a Figma frame stops to ask. With
 * the person's say-so, DSNR adds Figma's read-only tools to Claude Code's own settings so it does not ask. Opt-in, once, never
 * silent, never a tool that can write to Figma, and never over a file it cannot read.
 */

const LINK = 'Rebuild this screen: https://www.figma.com/design/RhFQLfgXduHeSGB56G8X5k/Org?node-id=8914-85777';

describe('when the request has a Figma link', () => {
	it('is a figma.com design, board, make or slides address, and nothing else', () => {
		for (const yes of [LINK, 'https://figma.com/make/abc/Thing', 'see http://www.figma.com/board/x/y', 'FIGMA.COM/slides/a/b'])
			expect(mentionsFigma(yes)).toBe(true);
		for (const no of ['', 'Make it like Figma', 'https://example.com/figma.com/design', 'figma.com is a site', 'https://notfigma.com/design/x'])
			expect(mentionsFigma(no)).toBe(false);
	});
});

describe('the rules', () => {
	it('are Figma’s tools that only read: nothing that writes, uploads or creates', () => {
		expect(FIGMA_READ_RULES).toEqual([
			'mcp__claude_ai_Figma__get_design_context',
			'mcp__claude_ai_Figma__get_screenshot',
			'mcp__claude_ai_Figma__get_metadata',
			'mcp__claude_ai_Figma__get_variable_defs',
			'mcp__claude_ai_Figma__get_code_connect_map',
			'mcp__claude_ai_Figma__get_figma_skill',
		]);
		expect(FIGMA_READ_RULES.every((r) => r.startsWith('mcp__claude_ai_Figma__get_'))).toBe(true);
	});

	it('are already there when each is allowed, or the whole Figma server is', () => {
		expect(hasFigmaAccess({ permissions: { allow: [...FIGMA_READ_RULES, 'Bash(ls)'] } })).toBe(true);
		expect(hasFigmaAccess({ permissions: { allow: ['mcp__claude_ai_Figma'] } })).toBe(true);
		expect(hasFigmaAccess({ permissions: { allow: ['mcp__claude_ai_Figma__*'] } })).toBe(true);
		expect(hasFigmaAccess({ permissions: { allow: FIGMA_READ_RULES.slice(1) } })).toBe(false);
		expect(hasFigmaAccess({ permissions: { allow: ['mcp__claude_ai_Notion'] } })).toBe(false);
		expect(hasFigmaAccess({})).toBe(false);
		expect(hasFigmaAccess(null)).toBe(false);
	});
});

describe('where Claude Code keeps the person’s settings', () => {
	it('is its folder in the home directory, or the folder the person has told it to use', () => {
		expect(settingsPath('/Users/a', {})).toBe('/Users/a/.claude/settings.json');
		expect(settingsPath('/Users/a', { CLAUDE_CONFIG_DIR: '/cfg' })).toBe('/cfg/settings.json');
	});
});

describe('adding the rules', () => {
	const files = (initial: string | null) => {
		const store = { text: initial };
		return {
			store,
			read: vi.fn(async () => store.text),
			write: vi.fn(async (_path: string, text: string) => void (store.text = text)),
		};
	};

	it('keeps everything else in the file, in its order, and adds only what is missing', async () => {
		const f = files(
			JSON.stringify({ model: 'sonnet', permissions: { allow: ['Bash(ls)', FIGMA_READ_RULES[0]], deny: ['Bash(rm *)'] }, hooks: {} }, null, 2),
		);
		await allowFigma('/s.json', f);
		const saved = JSON.parse(f.store.text!);
		expect(Object.keys(saved)).toEqual(['model', 'permissions', 'hooks']);
		expect(saved.permissions.deny).toEqual(['Bash(rm *)']);
		expect(saved.permissions.allow).toEqual(['Bash(ls)', ...FIGMA_READ_RULES]);
	});

	it('makes the file, with only these rules, when there is none', async () => {
		const f = files(null);
		await allowFigma('/s.json', f);
		expect(JSON.parse(f.store.text!)).toEqual({ permissions: { allow: FIGMA_READ_RULES } });
		expect(f.store.text!.endsWith('\n')).toBe(true);
	});

	it('writes nothing when they are all there already', async () => {
		const f = files(JSON.stringify({ permissions: { allow: FIGMA_READ_RULES } }));
		await allowFigma('/s.json', f);
		expect(f.write).not.toHaveBeenCalled();
	});

	it('refuses a file it cannot read as settings, and leaves it exactly as it is', async () => {
		for (const bad of ['{ not json', '[]', '"x"', JSON.stringify({ permissions: { allow: 'Bash(ls)' } })]) {
			const f = files(bad);
			await expect(allowFigma('/s.json', f)).rejects.toThrow(/not as settings|could not be read/);
			expect(f.write).not.toHaveBeenCalled();
			expect(f.store.text).toBe(bad);
		}
	});
});

describe('offering it', () => {
	const world = (over: { settings?: string | null; declined?: boolean; choose?: string | undefined; writeFails?: boolean } = {}) => {
		let text = over.settings === undefined ? null : over.settings;
		let declined = over.declined ?? false;
		const told: string[] = [];
		const written: string[] = [];
		const deps = {
			read: async () => text,
			write: async (_p: string, t: string) => {
				if (over.writeFails) throw new Error('EACCES');
				text = t;
				written.push(t);
			},
			path: '/h/.claude/settings.json',
			declined: { get: () => declined, set: async () => void (declined = true) },
			offer: vi.fn(async () => over.choose),
			tell: (m: string) => void told.push(m),
		};
		return { deps, told, written, isDeclined: () => declined };
	};

	it('asks once at the bottom, saying what it adds and that nothing can be written to Figma', async () => {
		const w = world({ choose: undefined });
		await offerFigmaAccess(LINK, w.deps);
		expect(w.deps.offer).toHaveBeenCalledTimes(1);
		const [message, actions] = w.deps.offer.mock.calls[0] as unknown as [string, string[]];
		expect(actions).toEqual(['Allow', 'No thanks']);
		expect(message).toContain('read-only');
		expect(message).toContain('~/.claude/settings.json');
		expect(message).toContain('nothing can be written or changed in Figma');
	});

	it('adds the rules on Allow, and says so', async () => {
		const w = world({ choose: 'Allow' });
		await offerFigmaAccess(LINK, w.deps);
		expect(JSON.parse(w.written[0]!).permissions.allow).toEqual(FIGMA_READ_RULES);
		expect(w.told).toEqual(['Claude Code will read Figma frames without asking. Added to ~/.claude/settings.json: take them out there any time.']);
	});

	it('remembers No thanks, and never asks again; a dismissed offer is asked again next time', async () => {
		const no = world({ choose: 'No thanks' });
		await offerFigmaAccess(LINK, no.deps);
		expect(no.isDeclined()).toBe(true);
		expect(no.written).toEqual([]);
		await offerFigmaAccess(LINK, no.deps);
		expect(no.deps.offer).toHaveBeenCalledTimes(1);
		const dismissed = world({ choose: undefined });
		await offerFigmaAccess(LINK, dismissed.deps);
		expect(dismissed.isDeclined()).toBe(false);
	});

	it('does not ask without a Figma link, or when it is already allowed, or the person said no before', async () => {
		const none = world();
		await offerFigmaAccess('A history of alerts', none.deps);
		const allowed = world({ settings: JSON.stringify({ permissions: { allow: ['mcp__claude_ai_Figma'] } }) });
		await offerFigmaAccess(LINK, allowed.deps);
		const said = world({ declined: true });
		await offerFigmaAccess(LINK, said.deps);
		for (const w of [none, allowed, said]) expect(w.deps.offer).not.toHaveBeenCalled();
	});

	it('says how to do it by hand when the file cannot be changed, and does not remember that as a no', async () => {
		const cannot = world({ choose: 'Allow', writeFails: true });
		await offerFigmaAccess(LINK, cannot.deps);
		expect(cannot.told[0]).toContain('could not be added');
		expect(cannot.told[0]).toContain('mcp__claude_ai_Figma__get_design_context');
		expect(cannot.isDeclined()).toBe(false);
		const unreadable = world({ choose: 'Allow', settings: '{ not json' });
		await offerFigmaAccess(LINK, unreadable.deps);
		expect(unreadable.told[0]).toContain('could not be added');
		expect(unreadable.written).toEqual([]);
	});
});
