import { FSAlert, FSBox, FSChip, FSStack, FSTypography } from '@flocksafety/flock-react-component-lib';
import type { ContextReceipt } from '../shared/contract';

/**
 * What was grounded, before anything is generated.
 *
 * The design-system version shown here is the one the OPENED REPOSITORY
 * resolves. It is deliberately not the version this app is built with -- those
 * are unrelated facts, and showing the app's own version where a product
 * baseline belongs would make the receipt confidently wrong.
 */
export const ContextReceiptPanel = ({ receipt }: { receipt: ContextReceipt }) => (
	<FSBox sx={{ border: 1, borderColor: 'divider', borderRadius: 1, p: 2 }}>
		<FSStack spacing={1.5}>
			<FSTypography variant="h6" component="h2">
				Context receipt
			</FSTypography>

			<FSStack direction="row" spacing={2} alignItems="center" flexWrap="wrap">
				<FSTypography variant="body2">{receipt.product}</FSTypography>
				<FSChip
					variant="status"
					size="small"
					color={receipt.designSystem.resolved ? 'default' : 'warning'}
					label={`${receipt.designSystem.package} ${receipt.designSystem.resolved ?? 'unresolved'}`}
				/>
				<FSTypography variant="body2" color="text.secondary">
					from {receipt.designSystem.source}
				</FSTypography>
			</FSStack>

			<FSTypography variant="body2">
				{receipt.contextFiles.length} context file{receipt.contextFiles.length === 1 ? '' : 's'}, and{' '}
				{receipt.commands.length} command{receipt.commands.length === 1 ? '' : 's'} this repository permits:{' '}
				{receipt.commands.map((c) => c.label).join(', ') || 'none'}
			</FSTypography>

			{receipt.problems.map((problem) => (
				<FSAlert key={problem} severity="warning">
					{problem}
				</FSAlert>
			))}
		</FSStack>
	</FSBox>
);
