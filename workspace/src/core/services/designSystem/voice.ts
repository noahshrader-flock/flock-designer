export const voiceWithoutComments = (text: string): string =>
	text
		.replace(/<!--[\s\S]*?-->/g, '')
		.replace(/\n{3,}/g, '\n\n')
		.trim();

export const voiceIsWritten = (text: string): boolean =>
	voiceWithoutComments(text)
		.split('\n')
		.some((line) => line.trim() !== '' && !/^#{1,6}\s/.test(line.trim()));
