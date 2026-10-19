import { useEffect, useLayoutEffect, useRef, useState } from 'react';

/** One wait for every tooltip: the browser's own for a `title` is long and no page can change it, so nothing sets a delay of its own. */
export const TOOLTIP_DELAY_MS = 1000;

/** Once one has been told, the next opens at once for this long: moving along a row of buttons is not a wait for each. */
export const TOOLTIP_SKIP_MS = 300;

const EDGE = 8;
const GAP = 4;

/** A frame's `title` is its name, not a tooltip. */
const titled = (el: Element | null, current: HTMLElement | null): HTMLElement | null => {
	for (let n = el; n instanceof HTMLElement; n = n.parentElement) {
		// The one being told of has had its title taken: it is still what the pointer is on, whatever is above it.
		if (n === current) return n;
		if (n.tagName !== 'IFRAME' && (n.getAttribute('title') ?? '') !== '') return n;
	}
	return null;
};

/** The title is taken while the pointer is on it, so the browser does not tell it as well, and given back after. Keyboard focus is not told. */
export const TooltipHost = () => {
	const [shown, setShown] = useState<{ text: string; rect: DOMRect } | null>(null);
	const box = useRef<HTMLDivElement>(null);

	useEffect(() => {
		let current: { el: HTMLElement; text: string } | null = null;
		let timer: ReturnType<typeof setTimeout> | undefined;
		let closedAt = Number.NEGATIVE_INFINITY;
		let open = false;
		const end = () => {
			clearTimeout(timer);
			if (current !== null) {
				const { el, text } = current;
				// Its title back, unless the page gave it another while the pointer was on it.
				if (!el.hasAttribute('title')) el.setAttribute('title', text);
				current = null;
			}
			if (open) {
				open = false;
				closedAt = Date.now();
				setShown(null);
			}
		};
		const begin = (el: HTMLElement) => {
			end();
			const text = el.getAttribute('title') ?? '';
			el.removeAttribute('title');
			current = { el, text };
			timer = setTimeout(
				() => {
					if (current === null || !current.el.isConnected) return end();
					open = true;
					setShown({ text: current.text, rect: current.el.getBoundingClientRect() });
				},
				Date.now() - closedAt < TOOLTIP_SKIP_MS ? 0 : TOOLTIP_DELAY_MS,
			);
		};
		const onOver = (e: PointerEvent) => {
			// A pointer that is a finger or a pen has no hovering to tell by.
			if (e.pointerType !== 'mouse') return;
			const el = titled(e.target instanceof Element ? e.target : null, current?.el ?? null);
			if (el === null) end();
			else if (el !== current?.el) begin(el);
		};
		// An element taken away under a pointer that has not moved is not something to tell of.
		const gone = new MutationObserver(() => {
			if (current !== null && !current.el.isConnected) end();
		});
		const enders = ['pointerdown', 'keydown'] as const;
		document.addEventListener('pointerover', onOver);
		document.documentElement.addEventListener('pointerleave', end);
		document.addEventListener('scroll', end, true);
		for (const name of enders) window.addEventListener(name, end, true);
		// The window itself losing the focus, not an element in it.
		window.addEventListener('blur', end);
		gone.observe(document.body, { childList: true, subtree: true });
		return () => {
			end();
			document.removeEventListener('pointerover', onOver);
			document.documentElement.removeEventListener('pointerleave', end);
			document.removeEventListener('scroll', end, true);
			for (const name of enders) window.removeEventListener(name, end, true);
			window.removeEventListener('blur', end);
			gone.disconnect();
		};
	}, []);

	useLayoutEffect(() => {
		const tip = box.current;
		if (shown === null || tip === null) return;
		const { width, height } = tip.getBoundingClientRect();
		const below = shown.rect.bottom + GAP + height + EDGE <= window.innerHeight;
		tip.style.left = `${Math.max(EDGE, Math.min(shown.rect.left, window.innerWidth - width - EDGE))}px`;
		tip.style.top = `${below ? shown.rect.bottom + GAP : Math.max(EDGE, shown.rect.top - GAP - height)}px`;
		tip.style.visibility = 'visible';
	}, [shown]);

	return shown === null ? null : (
		<div ref={box} role="tooltip" className="tooltip">
			{shown.text}
		</div>
	);
};
