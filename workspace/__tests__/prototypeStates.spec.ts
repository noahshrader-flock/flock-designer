import { describe, expect, it } from 'vitest';
import { statesOf, withState } from '../src/shared/prototypeStates';

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
