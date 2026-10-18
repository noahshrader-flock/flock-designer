import { initialOf } from '../shared/avatar';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';

/** A person as their picture, or the first letter of their name until it loads, or when there is none. */
export const Person = ({ name, src, size = 'sm' }: { name: string; src: string | null; size?: 'xs' | 'sm' | 'md' | 'lg' }) => (
	<Avatar size={size} title={name}>
		{src && <AvatarImage src={src} alt="" />}
		<AvatarFallback aria-label={name}>{initialOf(name)}</AvatarFallback>
	</Avatar>
);
