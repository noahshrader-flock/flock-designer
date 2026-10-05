import { describe, expect, it } from 'vitest';
import { EdgeWatcher, inRightEdge, type Point } from '../src/main/services/edgeWatcher';

const view = { x: 0, y: 100, width: 1000, height: 600 };

describe('inRightEdge', () => {
	it('is true within the zone at the right of the preview', () => {
		expect(inRightEdge({ x: 980, y: 300 }, view, 40)).toBe(true);
		expect(inRightEdge({ x: 1000, y: 300 }, view, 40)).toBe(true);
	});
	it('is false outside the zone, or above or below the preview', () => {
		expect(inRightEdge({ x: 900, y: 300 }, view, 40)).toBe(false);
		expect(inRightEdge({ x: 990, y: 50 }, view, 40)).toBe(false); // over the toolbar
		expect(inRightEdge({ x: 990, y: 800 }, view, 40)).toBe(false);
	});
	it('is false when there is no preview', () => {
		expect(inRightEdge({ x: 5, y: 5 }, { x: 0, y: 0, width: 0, height: 0 }, 40)).toBe(false);
	});
});

describe('EdgeWatcher', () => {
	const make = () => {
		let t = 0;
		let p: Point | null = null;
		const events: boolean[] = [];
		const w = new EdgeWatcher({ pointer: () => p, view: () => view, now: () => t, onChange: (n) => events.push(n) });
		return {
			events,
			move: (to: Point | null) => (p = to),
			advance: (ms: number) => (t += ms),
			tick: () => w.tick(),
		};
	};

	it('waits for the pointer to rest, so brushing past does not open the panel', () => {
		const s = make();
		s.move({ x: 990, y: 300 });
		s.tick();
		s.advance(100);
		s.tick();
		expect(s.events).toEqual([]);
	});

	it('reports once the pointer has stayed', () => {
		const s = make();
		s.move({ x: 990, y: 300 });
		s.tick();
		s.advance(400);
		s.tick();
		expect(s.events).toEqual([true]);
	});

	it('does not report again while it stays, and reports when it leaves', () => {
		const s = make();
		s.move({ x: 990, y: 300 });
		s.tick();
		s.advance(400);
		s.tick();
		s.advance(400);
		s.tick();
		s.move({ x: 500, y: 300 });
		s.tick();
		expect(s.events).toEqual([true, false]);
	});

	it('restarts the wait if the pointer leaves and comes back', () => {
		const s = make();
		s.move({ x: 990, y: 300 });
		s.tick();
		s.advance(300);
		s.move({ x: 500, y: 300 });
		s.tick();
		s.move({ x: 990, y: 300 });
		s.advance(100);
		s.tick();
		s.advance(300);
		s.tick();
		expect(s.events).toEqual([]);
	});

	it('treats a pointer outside the window as not near', () => {
		const s = make();
		s.move(null);
		s.tick();
		expect(s.events).toEqual([]);
	});
});
