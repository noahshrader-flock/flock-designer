import type { Browser } from 'puppeteer-core';
import { findChrome } from '../src/core/services/browser/chromeHeadless';

/** GitHub's runners have no graphics hardware: a browser left to find that out stalls drawing now and then. */
export const CHROME_ON_CI = process.env['CI'] ? ['--disable-gpu'] : [];

// On CI none is skipped for want of a Chrome: it fails instead, so a run that passed is one where they ran.
export const NO_CHROME = !process.env['CI'] && findChrome() === null;

/** A headless Chrome of its own, closed however `work` ends; `args` go on Chrome's own command line. */
export const inChrome = async <T>(work: (browser: Browser) => Promise<T>, args: string[] = []): Promise<T> => {
	const { default: puppeteer } = await import('puppeteer-core');
	const browser = await puppeteer.launch({ executablePath: findChrome() as string, headless: true, args: [...CHROME_ON_CI, ...args] });
	try {
		return await work(browser);
	} finally {
		await browser.close();
	}
};
