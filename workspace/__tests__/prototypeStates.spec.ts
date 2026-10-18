import { describe, expect, it } from 'vitest';
import { stateLabel, stateOfQuery, statesOf, withState } from '../src/shared/prototypeStates';

/** A prototype's states, as its built page lists them, and the address of each. */

describe('statesOf', () => {
	it('reads the list the build wrote into the page, in order', () => {
		expect(statesOf('<head>\n<meta name="dsnr-states" content="default,filtered,failed">\n</head>')).toEqual(['default', 'filtered', 'failed']);
	});

	it('is none for a page with no list, or one that is not a list of names', () => {
		expect(statesOf('<h1>Demo</h1>')).toEqual([]);
		expect(statesOf('<meta name="dsnr-states" content="">')).toEqual([]);
		expect(statesOf('<meta name="dsnr-states" content="default,Has Spaces">')).toEqual([]);
	});

	it('is none for a list with a name of more than one word: a state is one word', () => {
		expect(statesOf('<meta name="dsnr-states" content="default,no-match">')).toEqual([]);
	});
});

describe('stateLabel', () => {
	it('starts the name with a capital, which is how it is shown; the name itself, in the address, stays as it is', () => {
		expect(stateLabel('default')).toBe('Default');
		expect(stateLabel('filtered')).toBe('Filtered');
		expect(stateLabel('404')).toBe('404');
	});
});

describe('stateOfQuery', () => {
	const STATES = ['default', 'filtered', 'panel'];

	it('is the state’s name, from the query a comment recorded', () => {
		expect(stateOfQuery('?state=panel', STATES)).toBe('panel');
	});

	it('is nothing for the state the page opens in, asked for by name or not at all', () => {
		expect(stateOfQuery('', STATES)).toBeNull();
		// As the bars prototypes once drew wrote it, on switching back.
		expect(stateOfQuery('?state=default', STATES)).toBeNull();
	});

	it('is the query as it was for anything else, such as a real app’s', () => {
		expect(stateOfQuery('?tab=usage&state=error', [])).toBe('?tab=usage&state=error');
		expect(stateOfQuery('?state=error', [])).toBe('error');
	});
});

describe('withState', () => {
	it('asks for the state in the address', () => {
		expect(withState('http://127.0.0.1:9/demo/v1/', 'panel')).toBe('http://127.0.0.1:9/demo/v1/?state=panel');
		expect(withState('page.html', 'filtered')).toBe('page.html?state=filtered');
	});

	it('is the page’s own address for the state it opens in, and replaces a state already asked for', () => {
		expect(withState('page.html?state=panel', null)).toBe('page.html');
		expect(withState('page.html?state=panel', 'filtered')).toBe('page.html?state=filtered');
	});
});
