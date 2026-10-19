import { useState } from 'react';
import { initialOf } from '../shared/avatar';

export const Avatar = ({ name, src, size = 'default' }: { name: string; src: string | null; size?: 'default' | 'xs' }) => {
	const [failed, setFailed] = useState<string | null>(null);
	return (
		<span className={size === 'xs' ? 'avatar avatar-xs' : 'avatar'} title={name}>
			{src !== null && failed !== src ? <img src={src} alt="" onError={() => setFailed(src)} /> : <span aria-hidden="true">{initialOf(name)}</span>}
		</span>
	);
};
