import { FSAlert, FSBox, FSButton, FSStack } from '@flocksafety/flock-react-component-lib';
import { Component, type ReactNode } from 'react';

/**
 * Keeps one broken screen from taking the whole window with it. Without it a
 * render error unmounts everything and leaves a blank window with nothing to
 * click and no hint of what happened.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
	state = { error: null as Error | null };

	static getDerivedStateFromError(error: Error) {
		return { error };
	}

	render() {
		if (!this.state.error) return this.props.children;
		return (
			<FSBox sx={{ p: 3, pt: '80px', maxWidth: 720, mx: 'auto' }}>
				<FSStack spacing={2}>
					<FSAlert severity="error">Something on this screen broke: {this.state.error.message}</FSAlert>
					<FSBox>
						<FSButton size="md" onClick={() => this.setState({ error: null })}>Try again</FSButton>
					</FSBox>
				</FSStack>
			</FSBox>
		);
	}
}
