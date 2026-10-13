import { Component, type ReactNode } from 'react';
import { Alert, AlertDescription } from './ui/alert';
import { RetryButton } from './Notice';

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
				<div className="flex flex-col gap-4">
					<Alert variant="destructive">
						<AlertDescription>Something on this screen broke: {this.state.error.message}</AlertDescription>
					</Alert>
					<div>
						<RetryButton onClick={() => this.setState({ error: null })} />
					</div>
				</div>
			</div>
		);
	}
}
