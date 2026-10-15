/**
 * This machine, by any of the names an address can give it (`URL.hostname`): what DSNR's own server and a product's dev
 * server are served on. Said once, for everything that asks whether an address is this machine's.
 */
const NAMES = new Set(['localhost', '127.0.0.1', '[::1]']);

export const isThisMachine = (hostname: string): boolean => NAMES.has(hostname);
