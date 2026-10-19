import type { Browser } from 'puppeteer-core';
import { findChrome } from '../src/core/services/browser/chromeHeadless';

export { OWN_WINDOW } from '../src/core/services/browser/chromeHeadless';

// On CI none is skipped for want of a Chrome: it fails instead, so a run that passed is one where they ran.
export const NO_CHROME = !process.env['CI'] && findChrome() === null;

/** A headless Chrome of its own, closed however `work` ends; `args` go on Chrome's own command line. */
export const inChrome = async <T>(work: (browser: Browser) => Promise<T>, args: string[] = []): Promise<T> => {
	const { default: puppeteer } = await import('puppeteer-core');
	const browser = await puppeteer.launch({ executablePath: findChrome() as string, headless: true, args });
	try {
		return await work(browser);
	} catch (err) {
		// Where each page was and what it showed, so a wait that ran out says what it found instead.
		const seen = await Promise.all(
			(await browser.pages()).map(async (p) => {
				const text = await p.evaluate(() => document.body?.innerText ?? '').catch(() => '(not readable)');
				return `${p.url()}: ${JSON.stringify(text.replace(/\s+/g, ' ').trim().slice(0, 300))}`;
			}),
		);
		if (err instanceof Error) err.message += `\nOpen pages:\n${seen.join('\n')}`;
		throw err;
	} finally {
		await browser.close();
	}
};
