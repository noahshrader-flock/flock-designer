/** The page code, bundled into the text of one script (`pageCode.vite.ts`). */
declare module '*?page' {
	const code: string;
	export default code;
}

/** A script DSNR writes for an agent to run, bundled whole into one ES module, as text (`pageBundle.mjs`'s `bundleScript`). */
declare module '*?script' {
	const code: string;
	export default code;
}
