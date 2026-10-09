// @vitest-environment jsdom
import { createElement } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { Review } from '../src/renderer/Review';
import type { MarkerRequest, ReviewComment } from '../src/shared/contract';
import {
	PROJECT,
	PROTOTYPE,
	afterAgentCheck,
	button,
	cardFor,
	cards,
	comment,
	fail,
	fakeApp,
	key,
	menuItem,
	ok,
	openMenu,
	press,
	render,
	reviewProps,
	settle,
	shownState,
	state,
	stateButtons,
	stateGroup,
	typeInto,
	unmountAll,
} from './reviewHarness';

/**
 * What the review screen does with comments, pinned before its comments are taken out of it (M4 of the Pages plan), and
 * held after: read off the screen and the calls it makes, never off how it is built.
 */

let current: Awaited<ReturnType<typeof render>> | null = null;
const open = async (app: ReturnType<typeof fakeApp>, more = {}) => {
	(window as unknown as { workspace: unknown }).workspace = app.api;
	current = await render(createElement(Review, reviewProps(more) as never));
	return current;
};
afterEach(async () => {
	if (current) await unmountAll(current.root);
	current = null;
});

const sidebar = async () => {
	await press(button('Show all comments'));
	await settle();
};
/** The pins the screen last asked the page to draw. */
const pins = (app: ReturnType<typeof fakeApp>): MarkerRequest[] => (app.calls.pageShowMarkers?.at(-1)?.[0] as MarkerRequest[]) ?? [];
const choose = async (text: string, item: string) => {
	const items = await openMenu(button('Comment actions', cardFor(text)));
	await press(menuItem(items, item));
	await settle();
};

describe('reading comments', () => {
	it('reads them on opening, numbers them in order, and pins the open ones, movable only for their author', async () => {
		const app = fakeApp({
			readComments: async () => ok([comment(1, 'First'), comment(2, 'Mine', { author: 'noah' }), comment(3, 'Done', { resolved: true })]),
		});
		await open(app);
		expect(app.calls.readComments?.[0]).toEqual(['demo', 'prototype/demo/v1-i1']);
		expect(pins(app).map((p) => [p.id, p.number, p.movable])).toEqual([
			[1, 1, false],
			[2, 2, true],
		]);
		// The count is of open comments; resolved ones stay listed, marked, and keep their number.
		expect(button('Show all comments').textContent).toBe('2');
		await sidebar();
		expect(document.body.textContent).toContain('Comments (2)');
		expect(cards()).toHaveLength(3);
		expect(cardFor('Done').textContent).toContain('Resolved');
		expect(cardFor('Done').textContent).toContain('3');
	});

	it('says why when they cannot be read on opening, opening the sidebar to say it', async () => {
		await open(fakeApp({ readComments: async () => fail('GitHub is down') }));
		expect(button('Show all comments').getAttribute('aria-pressed')).toBe('true');
		expect(document.body.textContent).toContain('GitHub is down');
	});

	it('says so when there are none', async () => {
		await open(fakeApp());
		await sidebar();
		expect(document.body.textContent).toContain('No comments yet');
	});

});

describe('writing a comment', () => {
	it('drops a pin where the page is clicked, opens the box beside it, and saves what is written', async () => {
		const saved: ReviewComment[] = [];
		const app = fakeApp({
			// GitHub's listing trails a new comment: the reads straight after do not have it yet.
			readComments: async () => ok(saved),
			postComment: async (_p: string, _b: string, body: string) => ok(comment(9, body, { author: 'noah' })),
		});
		await open(app);
		await press(button('Comment'));
		await settle();
		expect(app.calls.pagePick).toHaveLength(1);
		await app.click({ selector: '#save' });
		await settle();
		// The pin being placed is drawn at once, before it is saved.
		expect(pins(app).map((p) => p.id)).toEqual([-1]);
		const box = document.querySelector<HTMLTextAreaElement>('#comment-draft');
		expect(box).not.toBeNull();
		expect(button('Save').disabled).toBe(true);
		await typeInto(box as HTMLTextAreaElement, 'Make this primary');
		await press(button('Save'));
		await settle();
		expect(app.calls.postComment?.[0]?.slice(0, 3)).toEqual(['demo', 'prototype/demo/v1-i1', 'Make this primary']);
		expect((app.calls.postComment?.[0]?.[3] as { selector: string }).selector).toBe('#save');
		expect(document.querySelector('#comment-draft')).toBeNull();
		// Kept and shown although the read has not caught up, and comment mode waits for the next click.
		expect(app.calls.pagePick).toHaveLength(2);
		await sidebar();
		expect(cards().map((c) => c.textContent)).toEqual([expect.stringContaining('Make this primary')]);
	});

	it('backs out of the comment with Escape, pin and all, and leaves comment mode with a second Escape', async () => {
		const app = fakeApp();
		await open(app);
		await key('c');
		await settle();
		await app.click();
		await settle();
		expect(document.querySelector('#comment-draft')).not.toBeNull();
		await key('Escape');
		await settle();
		expect(document.querySelector('#comment-draft')).toBeNull();
		expect(pins(app).map((p) => p.id)).toEqual([]);
		expect(button('Comment').getAttribute('aria-pressed')).toBe('true');
		await key('Escape');
		await settle();
		expect(button('Comment').getAttribute('aria-pressed')).toBe('false');
		expect(app.calls.pageCancelPick).toHaveLength(1);
	});

	it('takes the first click after comment mode was left and entered again', async () => {
		const app = fakeApp();
		await open(app);
		await press(button('Comment'));
		await settle();
		// Left while it was waiting for a click, then entered again.
		await press(button('Comment'));
		await settle();
		await press(button('Comment'));
		await settle();
		await app.click();
		await settle();
		expect(document.querySelector('#comment-draft')).not.toBeNull();
	});

	it('keeps the box open and says why when saving fails', async () => {
		const app = fakeApp({ postComment: async () => fail('Not signed in') });
		await open(app);
		await press(button('Comment'));
		await settle();
		await app.click();
		await settle();
		await typeInto(document.querySelector('#comment-draft') as HTMLTextAreaElement, 'x');
		await press(button('Save'));
		await settle();
		expect(document.querySelector('#comment-draft')).not.toBeNull();
		expect(document.body.textContent).toContain('Not signed in');
	});
});

describe('resolving and deleting', () => {
	it('resolves a comment at once, taking its pin off the page, and reopens it', async () => {
		let c = comment(1, 'First');
		const app = fakeApp({
			readComments: async () => ok([c]),
			resolveComment: async (_id: number, resolved: boolean) => ok((c = { ...c, resolved })),
		});
		await open(app);
		await sidebar();
		await choose('First', 'Resolve');
		expect(app.calls.resolveComment?.[0]).toEqual([1, true]);
		expect(cardFor('First').textContent).toContain('Resolved');
		expect(pins(app)).toEqual([]);
		await choose('First', 'Reopen');
		expect(app.calls.resolveComment?.[1]).toEqual([1, false]);
		expect(cardFor('First').textContent).not.toContain('Resolved');
	});

	it('does not let a read begun before a change undo it when it lands', async () => {
		const before = comment(1, 'First');
		let c = before;
		let slowRead: ((v: unknown) => void) | null = null;
		let held = false;
		const app = fakeApp({
			// Once held, the first read waits to be answered and any after it never are: the stale one is the only one to land.
			readComments: () => (held ? new Promise((r) => (slowRead ??= r)) : Promise.resolve(ok([c]))),
			resolveComment: async () => ok((c = { ...c, resolved: true })),
		});
		await open(app);
		await sidebar();
		// A read is in flight, from before the change.
		held = true;
		window.dispatchEvent(new Event('focus'));
		await settle(2);
		await choose('First', 'Resolve');
		// It answers as things stood when it began.
		(slowRead as ((v: unknown) => void) | null)?.(ok([before]));
		await settle();
		expect(cardFor('First').textContent).toContain('Resolved');
	});

	it('asks before deleting, and deletes only when told to', async () => {
		let all = [comment(1, 'First'), comment(2, 'Second')];
		const app = fakeApp({
			readComments: async () => ok(all),
			deleteComment: async (id: number) => ok((all = all.filter((c) => c.id !== id)) && null),
		});
		await open(app);
		await sidebar();
		await choose('First', 'Delete');
		expect(document.body.textContent).toContain('Delete this comment for good?');
		await press(button('Keep'));
		await settle();
		expect(app.calls.deleteComment).toBeUndefined();
		await choose('First', 'Delete');
		await press(button('Delete', cardFor('First')));
		await settle();
		expect(app.calls.deleteComment?.[0]).toEqual([1]);
		expect(cards().map((c) => c.textContent)).toEqual([expect.stringContaining('Second')]);
	});

	it('says why when resolving fails, and leaves the comment as it was', async () => {
		const app = fakeApp({ readComments: async () => ok([comment(1, 'First')]), resolveComment: async () => fail('Only its author can') });
		await open(app);
		await sidebar();
		await choose('First', 'Resolve');
		expect(document.body.textContent).toContain('Only its author can');
		expect(cardFor('First').textContent).not.toContain('Resolved');
	});
});

describe('pins and cards', () => {
	it('opens the sidebar on the comment whose pin was clicked', async () => {
		const app = fakeApp({ readComments: async () => ok([comment(1, 'First'), comment(2, 'Second')]) });
		await open(app);
		await app.pin({ kind: 'click', id: 2 });
		await settle();
		expect(cards()).toHaveLength(2);
		expect(cardFor('Second').className).toContain('border-primary');
		expect(cardFor('First').className).not.toContain('border-primary');
	});

	it('saves where a pin was dragged to, and draws it from what was saved', async () => {
		let c = comment(2, 'Mine', { author: 'noah' });
		const moved = { ...(c.anchor as NonNullable<ReviewComment['anchor']>), selector: '#elsewhere' };
		const app = fakeApp({ readComments: async () => ok([c]), moveComment: async () => ok((c = { ...c, anchor: moved })) });
		await open(app);
		await app.pin({ kind: 'move', id: 2, anchor: moved });
		await settle();
		expect(app.calls.moveComment?.[0]).toEqual([2, moved]);
		expect(pins(app)[0]?.anchor.selector).toBe('#elsewhere');
	});

	it('focuses the pin of a card that is clicked', async () => {
		const app = fakeApp({ readComments: async () => ok([comment(1, 'First')]) });
		await open(app);
		await sidebar();
		await press(cardFor('First'));
		expect(app.calls.pageFocusMarker?.[0]).toEqual([1]);
		expect(cardFor('First').className).toContain('border-primary');
	});

	it('says, on the card, when its element is gone or it was made in another state', async () => {
		const app = fakeApp({
			readComments: async () => ok([comment(1, 'Gone'), comment(2, 'Other')]),
			pageShowMarkers: async () => ok([{ id: 1, state: 'missing' }, { id: 2, state: 'otherState' }]),
		});
		await open(app);
		await sidebar();
		expect(cardFor('Gone').textContent).toContain('no longer on the page');
		expect(cardFor('Other').textContent).toContain('different state');
	});
});

describe('its published page', () => {
	it('offers to open it once it is published, as the filled button, through the main process, which works out the address itself', async () => {
		const app = fakeApp({ publishedPage: async () => ok({ state: 'published', url: 'https://x.github.io/d/demo/v1/i1/?v=abc1234' }) });
		await open(app);
		expect(button('Open page').getAttribute('data-variant')).toBe('default');
		await press(button('Open page'));
		expect(app.calls.openPublishedPage?.[0]).toEqual(['demo', 'v1-i1']);
	});

	it('offers to publish it when it is saved but not on its page, and says it is under way once asked', async () => {
		const app = fakeApp({ publishedPage: async () => ok({ state: 'unpublished' }), publishPage: async () => ok({ state: 'publishing' }) });
		await open(app);
		expect(button('Publish').getAttribute('data-variant')).toBe('outline');
		expect(button('Publish').disabled).toBe(false);
		await press(button('Publish'));
		await settle();
		expect(app.calls.publishPage?.[0]).toEqual(['demo', 'v1-i1']);
		expect(button('Publishing…').disabled).toBe(true);
		expect(() => button('Publish')).toThrow(/0 buttons/);
	});

	it('says why a publish stopped, on the screen and on the button, and that Publish tries again', async () => {
		await open(fakeApp({ publishedPage: async () => ok({ state: 'unpublished', why: 'the repository is public.' }) }));
		expect(button('Publish').getAttribute('title')).toBe('the repository is public.');
		expect(document.body.textContent).toContain('It was not published because: the repository is public. It is tried again by itself, or press Publish.');
	});

	it('offers to publish it too when GitHub would not say whether it is, with why on the button', async () => {
		await open(fakeApp({ publishedPage: async () => ok({ state: 'unavailable', why: 'GitHub would not say.' }) }));
		expect(button('Publish').getAttribute('title')).toBe('GitHub would not say.');
	});

	it('says while it is being published, and says nothing without a site', async () => {
		await open(fakeApp({ publishedPage: async () => ok({ state: 'publishing' }) }));
		expect(button('Publishing…').disabled).toBe(true);
		await unmountAll((current as NonNullable<typeof current>).root);
		await open(fakeApp());
		expect(() => button(/Open page|Publish/)).toThrow(/0 buttons/);
	});

	it('shows what stopped it when asking to publish fails', async () => {
		await open(fakeApp({ publishedPage: async () => ok({ state: 'unpublished' }), publishPage: async () => fail('Sign in to GitHub to publish.') }));
		await press(button('Publish'));
		await settle();
		expect(document.body.textContent).toContain('Sign in to GitHub to publish.');
	});
});

describe('the project’s documents, in More', () => {
	const records = { project: { ...PROJECT, records: ['brief.md', 'design-notes.md', 'iterations.json'] } };
	const items = async () => [...(await openMenu(button('More'))), ...document.querySelectorAll<HTMLElement>('[role="menuitemradio"]')];

	it('are the last group in the menu, after a divider that follows Open in browser', async () => {
		await open(fakeApp(), records);
		const all = await items();
		const names = all.map((i) => i.textContent?.trim());
		expect(names.slice(-4)).toEqual(['Open in browser', 'Brief', 'Design notes', 'Iterations']);
		const divider = [...document.querySelectorAll('[role="separator"]')].at(-1) as HTMLElement;
		const order = (a: Element, b: Element) => a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING;
		expect(order(menuItem(all, 'Open in browser'), divider)).toBeTruthy();
		expect(order(divider, menuItem(all, 'Brief'))).toBeTruthy();
	});

	it('open the document in the panel from the side, read from the design repository', async () => {
		const app = fakeApp({ readRecord: async () => ok('# Brief\n\nA list of alerts.') });
		await open(app, records);
		await press(menuItem(await openMenu(button('More')), 'Design notes'));
		await settle();
		expect(app.calls.readRecord).toEqual([['demo', 'design-notes.md']]);
		expect(document.body.textContent).toContain('design-notes.md');
		expect(document.body.textContent).toContain('A list of alerts.');
	});

	it('can be read before the page is up, and are then all that the menu has', async () => {
		const app = fakeApp({ openPrototype: async () => fail('This prototype has no page yet.') });
		await open(app, records);
		await settle();
		const names = (await items()).map((i) => i.textContent?.trim());
		expect(names).toEqual(['Brief', 'Design notes', 'Iterations']);
		expect(document.querySelectorAll('[role="separator"]')).toHaveLength(0);
	});

	it('leave nothing to open before the page is up, for a project that has none', async () => {
		await open(fakeApp({ openPrototype: async () => fail('This prototype has no page yet.') }));
		await settle();
		expect(button('More').disabled).toBe(true);
	});

	it('begin with where the codebase work is on GitHub, when the project has some', async () => {
		const codebase = { ...PROTOTYPE, name: 'codebase', branch: 'feature/demo', repository: 'flocksafety/flock-coke' };
		await open(fakeApp(), { project: { ...PROJECT, records: ['brief.md'], iterations: [PROTOTYPE, codebase] } });
		const all = await items();
		expect(all.map((i) => i.textContent?.trim()).slice(-3)).toEqual(['Open in browser', 'Built in code', 'Brief']);
		expect(menuItem(all, 'Built in code').getAttribute('href')).toBe('https://github.com/flocksafety/flock-coke/tree/feature/demo');
	});

	it('leave the menu as it was, with no divider at the end, for a project that has none', async () => {
		await open(fakeApp());
		const names = (await items()).map((i) => i.textContent?.trim());
		expect(names.at(-1)).toBe('Open in browser');
		expect(document.querySelectorAll('[role="separator"]')).toHaveLength(1);
	});
});

describe('Build', () => {
	const plan = { branch: 'feature/demo', exists: false, recorded: false, started: false, repository: 'flock-coke', basedOn: { repository: 'flock-coke', branch: 'develop' }, current: 'develop', clean: true };
	const dialog = async (withSetup: string[], more: Partial<typeof plan> = {}) => {
		const app = fakeApp({ agentReadiness: async () => ok({ state: 'ready' }), moveToCodePlan: async () => ok({ ...plan, ...more }), branchesWithSetup: async () => ok(withSetup) });
		await open(app);
		await press(menuItem(await openMenu(button('More')), 'Build'));
		await settle();
		return app;
	};

	it('offers only branches with the DSNR setup, and starts from one of them', async () => {
		// The prototype was modelled on develop, which has no setup: the newest that has it is chosen.
		await dialog(['noah/flock-designer', 'feature/other']);
		expect((document.getElementById('move-from') as HTMLElement).textContent).toBe('noah/flock-designer');
	});

	it('hands the building to Claude Code in VS Code, and says so, rather than running it here', async () => {
		const app = await dialog(['develop']);
		app.impl.buildInClaude = async () => ok({ editor: true, command: null });
		await press(button('Build in Claude Code'));
		await settle();
		expect(app.calls.buildInClaude).toEqual([['/c/flock-coke', 'demo', 'v1-i1', 'develop']]);
		expect(document.body.textContent).toContain('It is in Claude Code in VS Code now, on feature/demo');
		// The extension types the prompt in; the person sends it.
		expect(document.body.textContent).toContain('Press Enter there to start it');
		// Nothing is run, or shown running, in the app.
		expect(app.calls.startAgent).toBeUndefined();
		expect(app.calls.prepareMoveToCode).toBeUndefined();
		await press(button('Done'));
	});

	it('gives the command for a terminal when VS Code with Claude Code is not here', async () => {
		const app = await dialog(['develop']);
		app.impl.buildInClaude = async () => ok({ editor: false, command: "cd /c/flock-coke && claude 'Build prototype V1 · I1'" });
		await press(button('Build in Claude Code'));
		await settle();
		expect(document.body.textContent).toContain('the command that starts it in a terminal is on your clipboard');
		expect(document.body.textContent).toContain("cd /c/flock-coke && claude 'Build prototype V1 · I1'");
	});

	it('says why it could not start, and stays open to try again', async () => {
		const app = await dialog(['develop']);
		app.impl.buildInClaude = async () => fail('There are uncommitted changes in flock-coke.');
		await press(button('Build in Claude Code'));
		await settle();
		expect(document.body.textContent).toContain('There are uncommitted changes in flock-coke.');
		expect(button('Build in Claude Code').disabled).toBe(false);
	});

	it('is called just Build in the menu, and its button says where it goes', async () => {
		const app = fakeApp({ moveToCodePlan: async () => ok(plan), branchesWithSetup: async () => ok(['develop']) });
		await open(app);
		const items = await openMenu(button('More'));
		const names = items.map((i) => i.textContent?.trim());
		expect(names).toContain('Build');
		expect(names).not.toContain('Build in the codebase');
		await press(menuItem(items, 'Build'));
		await settle();
		expect(button('Build in Claude Code')).toBeTruthy();
	});

	describe('for a project that already has codebase work', () => {
		const started = { recorded: true, exists: true, started: true, current: 'develop' };

		it('continues it in Claude Code, on its branch, instead of refusing a second', async () => {
			const app = await dialog(['develop'], started);
			expect(document.body.textContent).not.toContain('a second one is not started');
			expect(document.body.textContent).not.toContain('Open it from the project list');
			expect(document.body.textContent).toContain('feature/demo already has this project’s codebase work');
			// No branch to choose: it is that branch.
			expect(document.getElementById('move-from')).toBeNull();
			app.impl.buildInClaude = async () => ok({ editor: true, command: null });
			await press(button('Continue in Claude Code'));
			await settle();
			// No base branch is sent: nothing is created.
			expect(app.calls.buildInClaude).toEqual([['/c/flock-coke', 'demo', 'v1-i1', undefined]]);
			expect(document.body.textContent).toContain('It is in Claude Code in VS Code now, on feature/demo');
		});

		it('continues it when only the record is here, the branch being on GitHub or another machine', async () => {
			await dialog(['develop'], { recorded: true, exists: false, started: true });
			expect(button('Continue in Claude Code').disabled).toBe(false);
		});

		it('does not need a clean checkout when it is already on that branch: that is the work in progress', async () => {
			await dialog(['develop'], { ...started, current: 'feature/demo', clean: false });
			expect(button('Continue in Claude Code').disabled).toBe(false);
			expect(document.body.textContent).not.toContain('uncommitted changes');
		});

		it('says a clean checkout is needed to move it to that branch from another', async () => {
			await dialog(['develop'], { ...started, current: 'develop', clean: false });
			expect(button('Continue in Claude Code').disabled).toBe(true);
			expect(document.body.textContent).toContain('uncommitted changes in flock-coke');
			expect(document.body.textContent).toContain('moving it to feature/demo needs a clean checkout');
		});
	});

	it('starts from what the prototype was modelled on, when that has the setup', async () => {
		await dialog(['noah/flock-designer', 'develop']);
		expect((document.getElementById('move-from') as HTMLElement).textContent).toBe('develop');
	});
});

describe('there is no selected version', () => {
	const prototypes = ['v2-i2', 'v2-i1', 'v1-i1'].map((name) => ({ ...PROTOTYPE, name, branch: `prototype/demo/${name}` }));

	it('so More has nothing to select or unselect, and the app asks nothing of the kind', async () => {
		const app = fakeApp();
		await open(app, { project: { ...PROJECT, iterations: prototypes } });
		const names = (await openMenu(button('More'))).map((i) => i.textContent?.trim());
		expect(names.join('|')).not.toMatch(/Select|Unselect/);
		expect(app.calls.selectedVersion).toBeUndefined();
	});

	it('and Build is on the prototype being looked at, not on some other version', async () => {
		const app = fakeApp({
			agentReadiness: async () => ok({ state: 'ready' }),
			branchesWithSetup: async () => ok(['develop']),
			moveToCodePlan: async () => ok({ branch: 'feature/demo', exists: false, recorded: false, started: false, repository: 'flock-coke', basedOn: null, current: 'develop', clean: true }),
		});
		await open(app, { project: { ...PROJECT, iterations: prototypes } });
		await press(menuItem(await openMenu(button('More')), 'Build'));
		await settle();
		expect(document.body.textContent).toContain('This moves V1 · I1 into flock-coke');
		expect(app.calls.moveToCodePlan?.[0]).toEqual(['/c/flock-coke', 'demo', 'v1-i1']);
	});
});

describe('the prototype’s states', () => {
	const withStates = (states: string[]) => fakeApp({ openPrototype: async () => ok({ url: 'http://127.0.0.1:9/demo/v1-i1/', states }) });

	it('are a group of buttons in the bar, and pressing one opens the preview in it', async () => {
		const app = withStates(['default', 'filtered', 'panel']);
		await open(app);
		await settle();
		expect(app.calls.pageOpen?.at(-1)).toEqual(['http://127.0.0.1:9/demo/v1-i1/']);
		expect(stateButtons().map((s) => s.textContent)).toEqual(['Default', 'Filtered', 'Panel']);
		expect(shownState()).toBe('Default');
		await press(state('Filtered'));
		await settle();
		expect(app.calls.pageOpen?.at(-1)).toEqual(['http://127.0.0.1:9/demo/v1-i1/?state=filtered']);
		expect(shownState()).toBe('Filtered');
		// The first is the page as it opens.
		await press(state('Default'));
		await settle();
		expect(app.calls.pageOpen?.at(-1)).toEqual(['http://127.0.0.1:9/demo/v1-i1/']);
	});

	it('name the state a comment was made in, on its card, and nothing for the first', async () => {
		const anchor = { route: '/', selector: 'main', nearbyText: '', viewport: { width: 1, height: 1 }, commit: '' };
		const app = fakeApp({
			openPrototype: async () => ok({ url: 'http://127.0.0.1:9/demo/v1-i1/', states: ['default', 'panel'] }),
			readComments: async () =>
				ok([
					comment(1, 'On the panel', { anchor: { ...anchor, state: '?state=panel' } }),
					comment(2, 'On the page as it opens', { anchor: { ...anchor, state: '?state=default' } }),
					comment(3, 'Before states were recorded', { anchor }),
				]),
		});
		await open(app);
		await settle();
		await sidebar();
		expect(cardFor('On the panel').textContent).toContain('State: Panel');
		expect(cardFor('On the panel').textContent).not.toContain('?state=');
		expect(cardFor('On the page as it opens').textContent).not.toContain('State:');
		expect(cardFor('Before states were recorded').textContent).not.toContain('State:');
	});

	describe('a comment made in another of them', () => {
		const anchor = { route: '/', selector: 'main', nearbyText: '', viewport: { width: 1, height: 1 }, commit: '' };
		// As the page says on this view: made in another state, so not drawn.
		const elsewhere = (madeIn: string) =>
			fakeApp({
				openPrototype: async () => ok({ url: 'http://127.0.0.1:9/demo/v1-i1/', states: ['default', 'panel'] }),
				readComments: async () => ok([comment(1, 'On the panel', { anchor: { ...anchor, state: madeIn } })]),
				pageShowMarkers: async (items: { id: number }[]) => ok(items.map((i) => ({ id: i.id, state: 'otherState' }))),
			});

		it('has a button on its card that opens the page in that state', async () => {
			const app = elsewhere('?state=panel');
			await open(app);
			await settle();
			await sidebar();
			await press(button('Show in Panel', cardFor('On the panel')));
			await settle();
			expect(app.calls.pageOpen?.at(-1)).toEqual(['http://127.0.0.1:9/demo/v1-i1/?state=panel']);
			expect(shownState()).toBe('Panel');
			// Pressing it is not choosing the comment.
			expect(cardFor('On the panel').className).not.toContain('border-primary');
		});

		it('names the first state too, and opens the page as it opens', async () => {
			const app = elsewhere('');
			await open(app);
			await settle();
			await sidebar();
			await press(button('Show in Default', cardFor('On the panel')));
			await settle();
			expect(app.calls.pageOpen?.at(-1)).toEqual(['http://127.0.0.1:9/demo/v1-i1/']);
		});

		it('has no button for a state the prototype no longer has, only the note', async () => {
			await open(elsewhere('?state=gone'));
			await settle();
			await sidebar();
			expect([...cardFor('On the panel').querySelectorAll('button')].map((b) => b.textContent)).not.toContain('Show in Gone');
			expect(cardFor('On the panel').textContent).toContain('Made in a different state of this page, so it is not pinned here.');
		});
	});

	it('are not offered for a prototype with one, or none', async () => {
		await open(withStates(['default']));
		await settle();
		expect(stateGroup()).toBeNull();
		expect(button('Iteration I1: switch iteration')).toBeTruthy();
	});
});

describe('Address', () => {
	it('runs on one comment, and shows it resolved with where the change went', async () => {
		let c = comment(1, 'Remove this');
		const app = fakeApp({
			readComments: async () => ok([c]),
			addressPrototype: async () => ok({ state: 'running', startedAt: 'now' }),
			agentStatus: async () => ok({ state: 'finished', exitCode: 0 }),
			finishPrototypeAddress: async () =>
				ok({ changed: true, iteration: 'v1-i2', made: null, comment: (c = { ...c, resolved: true, addressedAt: 'abc1234def56', addressedIn: 'v1-i2' }) }),
		});
		await open(app);
		await sidebar();
		await choose('Remove this', 'Address');
		await afterAgentCheck();
		expect(app.calls.addressPrototype?.[0]).toEqual(['demo', 'v1-i1', 1]);
		expect(app.calls.finishPrototypeAddress?.[0]).toEqual([1]);
		expect(cardFor('Remove this').textContent).toContain('Resolved');
		expect(cardFor('Remove this').textContent).toContain('The agent addressed this in V1 · I2');
		expect(document.body.textContent).toContain('The change is in V1 · I2');
		expect(pins(app)).toEqual([]);
	});

	it('is not offered without the product repository', async () => {
		const app = fakeApp({ readComments: async () => ok([comment(1, 'Open')]) });
		await open(app, { checkout: null });
		await sidebar();
		expect((await openMenu(button('Comment actions', cardFor('Open')))).map((i) => i.textContent?.trim())).not.toContain('Address');
	});

	it('is not offered on a resolved comment', async () => {
		const app = fakeApp({ readComments: async () => ok([comment(2, 'Done', { resolved: true })]) });
		await open(app);
		await sidebar();
		expect((await openMenu(button('Comment actions', cardFor('Done')))).map((i) => i.textContent?.trim())).toEqual(['Reopen', 'Delete']);
	});
});
