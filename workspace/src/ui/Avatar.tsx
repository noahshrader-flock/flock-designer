import { useState } from 'react';
import { initialOf } from '../shared/avatar';

/**
 * A person, as their picture: the first letter of their name until it loads, and when there is none or it does not. Named
 * for them as its tooltip; what it is beside says who it is to assistive technology. Small, the size of a small control; or
 * extra small (`xs`) beside a name, the size a pin's picture is drawn at on the page (`AVATAR_XS_PX`).
 */
export const Avatar = ({ name, src, size = 'small' }: { name: string; src: string | null; size?: 'small' | 'xs' }) => {
	const [failed, setFailed] = useState<string | null>(null);
	return (
		<span className={size === 'xs' ? 'avatar avatar-xs' : 'avatar'} title={name}>
			{src !== null && failed !== src ? <img src={src} alt="" onError={() => setFailed(src)} /> : <span aria-hidden="true">{initialOf(name)}</span>}
		</span>
	);
};
