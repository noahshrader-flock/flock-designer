/**
 * What a product's own server says as it starts, read the one way wherever DSNR starts it (Run locally, measuring its
 * accessibility): its lines without their colour codes, and the line that says why its build failed. Read from the words
 * bundlers print, never from which bundler it is, so no product's tools are named.
 */

const ANSI = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g');

/** A chunk of a server's output as lines: its colour codes taken out, its blank lines left out. */
export const outputLines = (text: string): string[] =>
	text
		.replace(ANSI, '')
		.split('\n')
		.filter((l) => l.trim() !== '');

/** The line of a server's output (its colour codes already taken out) that says why its build failed, if one does. */
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

/** Said when an error names a package export or module that is not there: the product's packages are older than its code. */
export const packagesHint = (reason: string, install: string | null): string =>
	/was not found in '[^']+'|has no exported member|Cannot find module '[^']+'/.test(reason)
		? ` Its packages may be out of date${install ? `: ${install}` : '.'}`
		: '';
