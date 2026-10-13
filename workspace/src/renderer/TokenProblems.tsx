import type { TokenProblem } from '../shared/contract';
import { plural } from '../shared/plural';
import { ProblemsDialog } from './ProblemsDialog';

/**
 * What the library has that DSNR could not read (T2 of the design system plan): said only when there is something, in the
 * design system's row beside Sync, wherever the design system is shown (`ProblemsDialog`), with each in the dialog at the
 * file and line it is at. The rest of the tokens are shown; what is listed here is skipped, never guessed.
 */
export const TokenProblems = ({ problems }: { problems: TokenProblem[] }) => {
	if (problems.length === 0) return null;
	return (
		<ProblemsDialog
			label={`${plural(problems.length, 'value')} couldn’t be read`}
			description="These are in the library’s files, and are skipped. The rest of the tokens are shown."
		>
			<ul className="flex flex-col gap-3">
				{problems.map((p) => (
					<li key={`${p.file}:${p.line ?? ''}:${p.reason}`} className="flex flex-col gap-0.5 text-sm">
						<span className="font-mono text-xs break-all">
							{p.file}
							{p.line !== undefined && `:${p.line}`}
						</span>
						<span className="text-muted-foreground">{p.reason}</span>
					</li>
				))}
			</ul>
		</ProblemsDialog>
	);
};
