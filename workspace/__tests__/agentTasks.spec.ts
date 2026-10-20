import { describe, expect, it } from 'vitest';
import { guidePart, handoffTask, buildInCodebaseTask, prototypeAddressTask, prototypeBuildTask } from '../src/core/services/agent/agentTasks';

const GUIDE = guidePart('# Building UI in a Flock product\n\n1. **Hard rules:** `../standards/non-negotiables.md`.', '/d');

const parts = {
	guide: GUIDE,
	lightCheck: 'npm run check:iteration',
	shared: '## Also yours to read (never change)\n\n- Shared standards: `/d/standards`',
	accessibility: '## Accessibility\n\nThe rules.',
	voice: '## Voice and tone\n\nCalm.',
};

const order = (task: string) =>
	["This product's light check", '## Also yours to read', '## Accessibility', '## Voice and tone'].map((part) => task.indexOf(part));

describe('every run in a product checkout', () => {
	const tasks = {
		Handoff: handoffTask({ skill: '# Hand off', projectId: 'p', branch: 'feature/p', gate: null }, parts),
		'building a prototype in the codebase': buildInCodebaseTask(
			{ skill: '# Move', routeSkill: '# Route', pageFile: '/p.html', auditFile: '/a.md', recordFile: '/i.json', name: 'v1' },
			parts,
		),
	};

	it.each(Object.entries(tasks))('ends with the same parts, in the same order: %s', (_kind, task) => {
		const at = order(task);
		expect(at.every((i) => i > 0)).toBe(true);
		expect([...at].sort((a, b) => a - b)).toEqual(at);
	});

	it('leaves out the voice when the design system has none written, and the folders when there are none', () => {
		const task = handoffTask({ skill: '# Hand off', projectId: 'p', branch: 'feature/p', gate: null }, { ...parts, shared: '', voice: '' });
		expect(task).not.toContain('## Voice and tone');
		expect(task).not.toContain('## Also yours to read');
		expect(task).toContain('## Accessibility');
	});
});

describe('Handoff', () => {
	const bare = { ...parts, shared: '', voice: '' };

	it('says when the product names no light check', () => {
		expect(handoffTask({ skill: '# Hand off', projectId: 'p', branch: 'feature/p', gate: null }, { ...bare, lightCheck: null })).toMatch(
			/names no light check/,
		);
	});

	it('Handoff: the shared skill, the branch, the gate first and last, the light check, and the verdict line asked for', () => {
		const task = handoffTask(
			{ skill: '# Hand work to engineering\n', projectId: 'admin-usage', branch: 'feature/admin-usage', gate: 'npm run handoff -- admin-usage' },
			bare,
		);
		expect(task).toContain('# Hand work to engineering');
		expect(task).toContain('`feature/admin-usage`');
		expect(task).toMatch(/`npm run handoff -- admin-usage`. Run it first, and last, once HANDOFF.md is committed/);
		expect(task).toContain('`npm run check:iteration`');
		expect(task).toMatch(/`Ready for engineering` or `Not ready`/);
	});
});

describe('building a prototype in the codebase', () => {
	it('asks for the audit before any code changes', () => {
		const task = buildInCodebaseTask(
			{
				skill: 's',
				routeSkill: '# Route',
				pageFile: '/q/v1.html',
				auditFile: '/d/projects/users/audit-v1.md',
				recordFile: '/d/projects/users/work.json',
				name: 'v1',
			},
			{ guide: '', lightCheck: null, shared: '', accessibility: '', voice: '' },
		);
		expect(task).toContain('Write the audit to `/d/projects/users/audit-v1.md` before you change any code.');
	});

	it('carries the route skill, and where the route goes', () => {
		const task = buildInCodebaseTask(
			{
				skill: 's',
				routeSkill: '# Record where the work is\n\nThe plainest form.',
				pageFile: '/q/v1.html',
				auditFile: '/d/projects/users/audit-v1.md',
				recordFile: '/d/projects/users/work.json',
				name: 'v1',
			},
			{ guide: '', lightCheck: null, shared: '', accessibility: '', voice: '' },
		);
		expect(task).toContain('# Record where the work is');
		expect(task).toContain("Record the work's route on the `codebase` entry of `/d/projects/users/work.json`");
	});
});

describe('Handoff, on work with no route recorded', () => {
	const bare = { guide: '', lightCheck: null, shared: '', accessibility: '', voice: '' };
	const base = { skill: '# Hand off', projectId: 'p', branch: 'feature/p', gate: null };

	it('asks for the route first, with how to choose it, and says nothing of it when there is one', () => {
		const task = handoffTask({ ...base, missingRoute: { skill: '# Record where the work is', recordFile: '/d/projects/p/work.json' } }, bare);
		expect(task).toContain('# Record where the work is');
		expect(task).toMatch(/no route.*`\/d\/projects\/p\/work.json`/);
		expect(handoffTask(base, bare)).not.toContain('route');
	});
});

describe('the builder’s guide, in every task (so no run depends on an agent choosing to read it)', () => {
	const build = {
		source: '/p/v1.tsx',
		page: '/p/v1.html',
		buildCommand: 'node build.mjs',
		checkCommand: 'node check-prototype.mjs /p/v1.build-check.json',
	};
	const sources = {
		code: '/c',
		productGuidance: null,
		designSystemGuidance: null,
		installedDesignSystem: null,
		installedAgainstBase: null,
		sharedStandards: null,
		nodeModules: null,
	};
	const tasks = {
		'building a prototype': prototypeBuildTask({ guide: GUIDE, skill: '# Build', build, sources, accessibility: '', voice: '', request: 'A list' }),
		'changing a prototype for a comment': prototypeAddressTask({
			guide: GUIDE,
			addressSkill: '# Address',
			buildSkill: '# Build',
			build,
			sources,
			accessibility: '',
			voice: '',
			commentsPath: '/c.md',
			number: 1,
			name: 'v1',
			where: 'here',
		}),
		'building a prototype in the codebase': buildInCodebaseTask(
			{ skill: '# Move', routeSkill: '# Route', pageFile: '/p.html', auditFile: '/a.md', recordFile: '/i.json', name: 'v1' },
			parts,
		),
		Handoff: handoffTask({ skill: '# Hand off', projectId: 'p', branch: 'feature/p', gate: null }, parts),
	};

	it.each(Object.entries(tasks))('comes first, before anything else: %s', (_kind, task) => {
		expect(task.startsWith(GUIDE)).toBe(true);
		expect(task.indexOf('# Building UI in a Flock product')).toBeLessThan(task.indexOf('#', GUIDE.length));
	});

	it('tells the agent, in what it may read, when the design system installed may not be what the base pins: building and changing alike', () => {
		const said = 'develop pins x 1.3.0, and 1.2.3 is installed here, so the prototype may not match develop: it is built against 1.2.3.';
		const told = { ...sources, installedDesignSystem: '/n/x', installedAgainstBase: said };
		const building = prototypeBuildTask({ guide: GUIDE, skill: '# Build', build, sources: told, accessibility: '', voice: '', request: 'A list' });
		const changing = prototypeAddressTask({
			...{ guide: GUIDE, addressSkill: '# A', buildSkill: '# B', build, accessibility: '', voice: '' },
			sources: told,
			commentsPath: '/c.md',
			number: 1,
			name: 'v1',
			where: null,
		});
		for (const task of [building, changing])
			expect(task).toContain(`- **The design system as installed:** \`/n/x\`\n  ${said} Say so in your summary.`);
		expect(tasks['building a prototype']).not.toContain('pins x');
	});

	it('says it is always followed, that the run’s own skill wins where it is more specific, and what to do with nobody to ask', () => {
		expect(GUIDE).toMatch(/^## How to build UI here: always, before anything else/);
		expect(GUIDE).toContain('the skill below wins');
		expect(GUIDE).toContain('If nobody is there to answer a question');
	});

	it('sends the agent to DSNR’s workflow definition too, by a path that names a real file, so no step depends on it being found', () => {
		expect(GUIDE).toContain('`/d/agents/dsnr.md`');
		expect(guidePart('A.', null)).toContain('`agents/dsnr.md`');
	});

	it('points its links at the shared folder on this machine, so a task copied anywhere still names real files', () => {
		expect(GUIDE).toContain('`/d/standards/non-negotiables.md`');
		expect(GUIDE).not.toContain('`../');
		// Not known (no design repository found): the links are left as written, never pointed somewhere wrong.
		expect(guidePart('See `../standards/x.md`.', null)).toContain('`../standards/x.md`');
	});
});
