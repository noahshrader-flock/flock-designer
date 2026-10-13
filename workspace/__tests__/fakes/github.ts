import { vi } from 'vitest';
import type { GitHubApi } from '../../src/host/github';

import { HostError, type HostErrorKind } from '../../src/host/hostError';

/**
 * GitHub's API as the specs fake it, written once: a table of routes, a way to refuse, and a record of what was asked.
 * The contract every host must keep is written against this, so a second host is checked by the same tests.
 */

/**
 * What GitHub says when it will not: the error every transport throws, with its status, or, for a failure that has none
 * (the command line signed out), its kind.
 */
export const refusal = (status: number | undefined, message = REASONS[status ?? 0] ?? `HTTP ${status}`, kind?: HostErrorKind): Error =>
	new HostError(message, status, kind);
const REASONS: Record<number, string> = { 403: 'Forbidden', 404: 'Not Found', 409: 'Conflict', 422: 'Validation Failed' };

/** One call, as the app made it. */
export interface HostCall {
	method: string;
	path: string;
	body?: unknown;
}

/** A route's answer: a value, given as it is; or a function of the call, whose return (or throw, or rejection) is the answer. */
export type Answer = unknown;
/** A call as a route's function is given it: its query read out. */
export type RouteCall = HostCall & { query: URLSearchParams };
type Route = (call: RouteCall) => unknown;

/**
 * A GitHub that answers from `routes`. A route is `'<path>'` or `'<METHOD> <path>'`: matched whole, query included, or,
 * ending in `*`, as the start of the call's path, the longest such start winning. A route without a method answers any.
 * A call no route answers fails the test with its method and path, rather than quietly answering something.
 */
export const fakeGitHub = (routes: Record<string, Answer> = {}) => {
	const calls: HostCall[] = [];
	const writes: HostCall[] = [];
	const table = Object.entries(routes).map(([key, answer]) => {
		const [, method = null, path = key] = /^(?:([A-Z]+) )?(.+)$/.exec(key) ?? [];
		return { method, prefix: path.endsWith('*'), path: path.replace(/\*$/, ''), answer };
	});
	const find = (method: string, path: string) => {
		const fits = table.filter((r) => r.method === null || r.method === method);
		return (
			fits.find((r) => !r.prefix && r.path === path) ??
			fits.filter((r) => r.prefix && path.startsWith(r.path)).sort((a, b) => b.path.length - a.path.length)[0]
		);
	};
	const api = vi.fn(async (path: string, init: { method?: string; body?: unknown } = {}): Promise<unknown> => {
		const method = init.method ?? 'GET';
		const call: HostCall = { method, path, ...(init.body !== undefined ? { body: init.body } : {}) };
		calls.push(call);
		if (method !== 'GET') writes.push(call);
		const route = find(method, path);
		if (!route) throw new Error(`not faked: ${method} ${path}`);
		return typeof route.answer === 'function'
			? (route.answer as Route)({ ...call, query: new URLSearchParams(path.split('?')[1] ?? '') })
			: route.answer;
	});
	const github: GitHubApi = { api };
	return {
		/** What the app is handed: an object with `api`, as every transport is. */
		github,
		api,
		calls,
		/** The calls that change something: anything but a GET. */
		writes,
	};
};
