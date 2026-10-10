import { Page } from './Page';

/**
 * The Voice and tone tab (T9 of the design system plan): the company's voice and tone, one file in the design repository.
 * Step 1 makes the tab; reading the file is step 2.
 */
export const VoiceAndTone = () => (
	<Page>
		<p className="text-muted-foreground text-sm">Flock's voice and tone will be read from the design repository here.</p>
	</Page>
);
