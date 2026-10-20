import { Message } from '../../src/ui/Message';
import { LinkButton } from '../../src/ui/LinkButton';
import { asks } from './host';
import { useShared } from './shared';

/** The agent work goes to now, as the panel's words name it: "the agent" while it is still to be asked. */
export const useAgentName = (): string => useShared('agent').name ?? 'the agent';

/** "Build in Codex", or "Build" while the agent is still to be asked. */
export const useInAgent = (): ((verb: string) => string) => {
	const { name } = useShared('agent');
	return (verb) => (name ? `${verb} in ${name}` : verb);
};

/** Said where work is handed over, with Change, so the choice is never only in Settings. */
export const AgentInUse = () => {
	const { name } = useShared('agent');
	return (
		<Message>
			{name ? (
				<>
					With <strong>{name}</strong>.{' '}
				</>
			) : (
				'You choose the agent when it is handed over. '
			)}
			<LinkButton onPress={() => void asks().chooseAgent()}>{name ? 'Change' : 'Choose now'}</LinkButton>
		</Message>
	);
};
