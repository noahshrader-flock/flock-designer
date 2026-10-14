/**
 * A prototype is one page wherever it is served, so its comments are placed by what follows its # (`helpers.place`).
 * The page code reads this once, as it loads, so the agent's bundle imports this first, before any of it: the scripts the
 * app runs from outside say the same before each run (`SINGLE_PAGE`).
 */
window.__fdSinglePage = true;
export {};
