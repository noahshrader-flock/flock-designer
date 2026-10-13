import { Component, type ReactNode } from 'react';
import { Notice, RetryButton } from './Notice';

/**
 * Keeps one broken screen from taking the whole window with it. Without it a
 * render error unmounts everything and leaves a blank window with nothing to
 * click and no hint of what happened.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
	override state = { error: null as Error | null };

	static getDerivedStateFromError(error: Error) {
		return { error };
	}

	override render() {
		if (!this.state.error) return this.props.children;
		return (
			<div className="mx-auto max-w-2xl p-6 pt-20">
				<Notice variant="destructive" title="Something on this screen broke" action={<RetryButton onClick={() => this.setState({ error: null })} />}>
					{this.state.error.message}
				</Notice>
			</div>
		);
	}
}
