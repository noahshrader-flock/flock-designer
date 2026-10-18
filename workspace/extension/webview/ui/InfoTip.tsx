import { Icon } from './Icon';

/**
 * What would be a line of small print, kept behind a small info icon beside what it is about: it is told on hover, after the
 * one wait every tooltip has (`TooltipHost`), and to assistive technology as the icon's name. For what is good to know and is
 * not read every time, so the panel is not full of it.
 */
export const InfoTip = ({ text }: { text: string }) => (
	<span role="img" aria-label={text} title={text} className="info-tip">
		<Icon name="info" size="xs" />
	</span>
);
