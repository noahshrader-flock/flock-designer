import { describe, expect, it } from 'vitest';
import { stateOfQuery, statesOf, withState } from '../src/shared/prototypeStates';

/** A prototype's states, as its built page lists them, and the address of each. */

describe('statesOf', () => {
	it('reads the list the build wrote into the page, in order', () => {
		expect(statesOf('<head>\n<meta name="flkd-states" content="default,no-match,panel-error">\n</head>')).toEqual(['default', 'no-match', 'panel-error']);
	});

	it('is none for a page with no list, or one that is not a list of names', () => {
		expect(statesOf('<h1>Demo</h1>')).toEqual([]);
		expect(statesOf('<meta name="flkd-states" content="">')).toEqual([]);
		expect(statesOf('<meta name="flkd-states" content="default,Has Spaces">')).toEqual([]);
	});
});

describe('stateOfQuery', () => {
	const STATES = ['default', 'no-match', 'panel'];

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
		expect(withState('http://127.0.0.1:9/demo/v1-i1/', 'panel')).toBe('http://127.0.0.1:9/demo/v1-i1/?state=panel');
		expect(withState('page.html', 'no-match')).toBe('page.html?state=no-match');
	});

	it('is the page’s own address for the state it opens in, and replaces a state already asked for', () => {
		expect(withState('page.html?state=panel', null)).toBe('page.html');
		expect(withState('page.html?state=panel', 'no-match')).toBe('page.html?state=no-match');
	});
});
