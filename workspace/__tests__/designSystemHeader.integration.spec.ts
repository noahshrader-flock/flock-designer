import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DesignSystemHeader } from '../extension/webview/DesignSystemHeader';
import { Badge } from '../src/ui/Badge';
import { Menu } from '../src/ui/Menu';
import { inChrome, NO_CHROME, OWN_WINDOW } from './realChrome';
import { panelCss } from './panelStyles';

const css = panelCss();
const NAMES = ['FUI', 'Flock’s React component library, the design system every product of its team is built from'];

const page = (name: string) => {
	const header = renderToStaticMarkup(
		createElement(DesignSystemHeader, {
			name,
			branch: 'develop',
			children: [
				createElement(Badge, { key: 'a', tone: 'warning', count: 3, label: 'not read' }),
				createElement(Badge, { key: 'b', tone: 'brand', count: 12, label: 'changes being tried' }),
				createElement(Menu, {
					key: 'm',
					label: 'Design system actions',
					size: 'small',
					always: true,
					sections: [{ items: [{ label: 'Sync', icon: 'refresh', onSelect: () => undefined }] }],
				}),
			],
		}),
	);
	return `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body><div class="panel-top"><div style="height: var(--dsnr-control)"></div></div>${header}<div class="ds-part"><div style="height: var(--dsnr-control)"></div></div><div style="height: 2000px">list</div></body></html>`;
};

describe.skipIf(NO_CHROME)('the design system’s row, in the side panel, in the browser on this machine', () => {
	it.each([300, 220])(
		'is one line with its branch’s icon directly after its name, and a long name cut short, in a %ipx panel',
		async (width) => {
			const found = await inChrome(async (browser) => {
				const out: Record<string, unknown> = {};
				for (const name of NAMES) {
					const tab = await browser.newPage(OWN_WINDOW);
					await tab.setViewport({ width, height: 400 });
					await tab.setContent(page(name));
					out[name] = await tab.evaluate(() => {
						const box = (s: string) => (document.querySelector(s) as HTMLElement).getBoundingClientRect();
						const nameEl = document.querySelector('.ds-name') as HTMLElement;
						const badges = [...document.querySelectorAll<HTMLElement>('.ds-actions .badge')].map((b) => b.getBoundingClientRect());
						const [n, icon, actions, header] = [box('.ds-name'), box('.ds-branch'), box('.ds-actions'), box('.ds-header')];
						// What the stylesheet's own names come to, measured: the row's height and the gap, not numbers written here.
						const probe = document.body.appendChild(document.createElement('div'));
						probe.style.cssText = 'position:absolute;height:var(--dsnr-ds-header-height);width:var(--dsnr-ds-gap)';
						const [wantHeight, wantGap] = [probe.getBoundingClientRect().height, probe.getBoundingClientRect().width];
						probe.remove();
						return {
							wantHeight: Math.round(wantHeight),
							wantGap: Math.round(wantGap * 10) / 10,
							nameToIcon: Math.round((icon.left - n.right) * 10) / 10,
							iconToButtons: Math.round((actions.left - icon.right) * 10) / 10,
							betweenBubbles: Math.round((badges[1]!.left - badges[0]!.right) * 10) / 10,
							cut: nameEl.scrollWidth > nameEl.clientWidth,
							ellipsis: getComputedStyle(nameEl).textOverflow === 'ellipsis',
							height: Math.round(header.height),
							iconInside: icon.right <= actions.left + 0.5 && icon.left >= header.left,
							oneLine: Math.abs((n.top + n.bottom) / 2 - (icon.top + icon.bottom) / 2) < 3,
							page: document.documentElement.scrollWidth <= document.documentElement.clientWidth,
						};
					});
				}
				return out as Record<
					string,
					{
						wantHeight: number;
						wantGap: number;
						nameToIcon: number;
						iconToButtons: number;
						betweenBubbles: number;
						cut: boolean;
						ellipsis: boolean;
						height: number;
						iconInside: boolean;
						oneLine: boolean;
						page: boolean;
					}
				>;
			});
			const [short, long] = [found[NAMES[0] as string]!, found[NAMES[1] as string]!];
			expect(short.cut).toBe(false);
			expect(short.nameToIcon).toBeCloseTo(short.wantGap, 0);
			expect(short.oneLine).toBe(true);
			expect(short.height).toBe(short.wantHeight);
			expect(long.cut).toBe(true);
			expect(long.ellipsis).toBe(true);
			expect(long.betweenBubbles).toBeCloseTo(long.wantGap, 0);
			expect(long.iconToButtons).toBeCloseTo(long.betweenBubbles, 0);
			expect(long.nameToIcon).toBeCloseTo(long.wantGap, 0);
			expect(long.height).toBe(long.wantHeight);
			expect([long.wantHeight, long.wantGap]).toEqual([30, 4]);
			for (const f of [short, long]) expect([f.iconInside, f.page]).toEqual([true, true]);
		},
		60_000,
	);

	it('has its menu open over the toggle and the list under it, not behind them', async () => {
		const found = await inChrome(async (browser) => {
			const tab = await browser.newPage(OWN_WINDOW);
			await tab.setViewport({ width: 300, height: 400 });
			await tab.setContent(page(NAMES[0] as string));
			return tab.evaluate(() => {
				// What the menu is when it is open (`Menu`): its list, drawn under its button.
				(document.querySelector('.ds-actions .menu') as HTMLElement).insertAdjacentHTML(
					'beforeend',
					'<div role="menu" class="menu-list"><button type="button" role="menuitem" class="menu-item">Sync with GitHub</button><button type="button" role="menuitem" class="menu-item">Primitives</button><button type="button" role="menuitem" class="menu-item">Voice and Tone</button></div>',
				);
				const list = (document.querySelector('.menu-list') as HTMLElement).getBoundingClientRect();
				const toggle = (document.querySelector('.ds-part') as HTMLElement).getBoundingClientRect();
				// Each of its entries, at its middle: what is on top there must be the entry, though the toggle is under it.
				const entries = [...document.querySelectorAll<HTMLElement>('.menu-item')].map((e) => {
					const r = e.getBoundingClientRect();
					const top = document.elementFromPoint((r.left + r.right) / 2, (r.top + r.bottom) / 2);
					return { name: e.textContent, onTop: top === e || e.contains(top), overToggle: r.bottom > toggle.top };
				});
				return { entries, overlaps: list.bottom > toggle.top };
			});
		});
		// It does reach down over the toggle's bar, so what is on top there is what the test is of.
		expect(found.overlaps).toBe(true);
		expect(found.entries.some((e) => e.overToggle)).toBe(true);
		for (const e of found.entries) expect(e.onTop, `${e.name} is behind what is under it`).toBe(true);
	}, 60_000);

	it('is kept at the top under the top bar while the list scrolls, with the toggle kept under it, so its name is always shown', async () => {
		const found = await inChrome(async (browser) => {
			const tab = await browser.newPage(OWN_WINDOW);
			await tab.setViewport({ width: 300, height: 400 });
			await tab.setContent(page(NAMES[0] as string));
			return tab.evaluate(async () => {
				const top = (s: string) => (document.querySelector(s) as HTMLElement).getBoundingClientRect();
				const at = async (y: number) => {
					window.scrollTo(0, y);
					await new Promise((r) => requestAnimationFrame(() => r(null)));
					return { bar: top('.panel-top'), header: top('.ds-header'), part: top('.ds-part') };
				};
				const [start, far] = [await at(0), await at(900)];
				return {
					startHeader: start.header.top,
					startBarBottom: start.bar.bottom,
					farBar: [far.bar.top, far.bar.bottom],
					farHeader: [far.header.top, far.header.bottom],
					farPart: far.part.top,
				};
			});
		});
		expect(found.startHeader).toBeCloseTo(found.startBarBottom, 0);
		expect(found.farBar[0]).toBeCloseTo(0, 0);
		expect(found.farHeader[0]).toBeCloseTo(found.farBar[1] as number, 0);
		expect(found.farPart).toBeCloseTo(found.farHeader[1] as number, 0);
	}, 60_000);
});
