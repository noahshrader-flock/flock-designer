/** Read from the words bundlers print, never from which bundler it is, so no product's tools are named. */

const ANSI = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g');

export const outputLines = (text: string): string[] =>
	text
		.replace(ANSI, '')
		.split('\n')
		.filter((l) => l.trim() !== '');

/** `lines` must already have their colour codes taken out (`outputLines`). */
export const buildError = (lines: string[]): string | null => {
	// The bundler's list of what a package does export is long and says nothing the person needs: it is cut.
	const bare = lines
		.map((l) =>
			l
				.replace(/^\s*[×✖]\s*/, '')
				.replace(/\s*\(possible exports:.*$/, '')
				.trim(),
		)
		.filter(Boolean);
	const failed = bare.some((l) => /build failed|failed to compile|build error/i.test(l));
	if (!failed) return null;
	return (
		bare.find(
			(l) =>
				/(Error|error TS\d+|Module not found|was not found in|Cannot find module)/.test(l) &&
				!/^error\s+build (failed|error)/i.test(l) &&
				!/^error\s+Build error:?$/i.test(l),
		) ?? 'its build failed.'
	);
};

export const packagesHint = (reason: string, install: string | null): string =>
	/was not found in '[^']+'|has no exported member|Cannot find module '[^']+'/.test(reason)
		? ` Its packages may be out of date${install ? `: ${install}` : '.'}`
		: '';
