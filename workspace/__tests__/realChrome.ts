import type { Browser } from 'puppeteer-core';
import { findChrome } from '../src/core/services/browser/chromeHeadless';

export const NO_CHROME = findChrome() === null;

/** A headless Chrome of its own, closed however `work` ends; `args` go on Chrome's own command line. */
export const inChrome = async <T>(work: (browser: Browser) => Promise<T>, args: string[] = []): Promise<T> => {
	const { default: puppeteer } = await import('puppeteer-core');
	const browser = await puppeteer.launch({ executablePath: findChrome() as string, headless: true, args });
	try {
		return await work(browser);
	} finally {
		await browser.close();
	}
};
