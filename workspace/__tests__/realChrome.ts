import type { Browser } from 'puppeteer-core';
import { findChrome } from '../src/main/services/chromeHeadless';

/** Whether this machine has the Chrome the real-browser tests run in; without one they are skipped. */
export const NO_CHROME = findChrome() === null;

/** Runs `work` in a headless Chrome of its own, closed after, however it ends; `args`, for Chrome's own command line. */
export const inChrome = async <T>(work: (browser: Browser) => Promise<T>, args: string[] = []): Promise<T> => {
	const { default: puppeteer } = await import('puppeteer-core');
	const browser = await puppeteer.launch({ executablePath: findChrome() as string, headless: true, args });
	try {
		return await work(browser);
	} finally {
		await browser.close();
	}
};
