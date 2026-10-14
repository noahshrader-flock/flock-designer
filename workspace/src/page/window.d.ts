/**
 * What the page code leaves on a previewed page's window, and nothing else: the hooks the app calls it by between runs
 * (each run is a fresh script, so this is all that is kept), and the flag a prototype's driver sets before each.
 */
interface Window {
	/** Set before every script run on a prototype (`SINGLE_PAGE`): it is one page, placed by what follows its #. */
	__fdSinglePage?: boolean;
	/** Ends the pick in progress, as Escape does. */
	__fdCancelPick?: () => void;
	/** The pins drawn last: stopped before the next are drawn, and one brought into view by its comment's id. */
	__fdMarkers?: { stop: () => void; focus: (id: number) => void };
	/** Where a pin's report goes on a page with the agent (`agent.ts`); the console, which the app listens to, without one. */
	__fdReport?: (text: string) => void;
}
