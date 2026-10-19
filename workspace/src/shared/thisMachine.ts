/** This machine as `URL.hostname` gives it, which keeps an IPv6 address's brackets. */
const NAMES = new Set(['localhost', '127.0.0.1', '[::1]']);

export const isThisMachine = (hostname: string): boolean => NAMES.has(hostname);
