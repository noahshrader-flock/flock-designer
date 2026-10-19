import { Icon } from './Icon';

export const InfoTip = ({ text }: { text: string }) => (
	<span role="img" aria-label={text} title={text} className="info-tip">
		<Icon name="info" size="xs" />
	</span>
);
