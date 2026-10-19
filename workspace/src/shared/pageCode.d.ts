/** Made by `pageCode.vite.ts`. */
declare module '*?page' {
	const code: string;
	export default code;
}

/** Bundled whole into one ES module, as text, by `pageBundle.mjs`'s `bundleScript`. */
declare module '*?script' {
	const code: string;
	export default code;
}
