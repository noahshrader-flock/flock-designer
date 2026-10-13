import { TriangleAlertIcon } from 'lucide-react';
import type { TokenProblem } from '../shared/contract';
import { plural } from '../shared/plural';
import { Button } from './ui/button';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';

/**
 * What the library has that DSNR could not read (T2 of the design system plan): said only when there is something, as a
 * small ghost button (the warning icon and how many) in the design system's row, beside Sync, wherever the design system
 * is shown; pressed, it opens a dialog listing each with the file and line it is at. The rest of the tokens are shown;
 * what is listed here is skipped, never guessed.
 */
export const TokenProblems = ({ problems }: { problems: TokenProblem[] }) => {
	if (problems.length === 0) return null;
	const said = `${plural(problems.length, 'value')} couldn’t be read`;
	return (
		<Dialog>
			<DialogTrigger asChild>
				<Button variant="ghost" size="sm">
					<TriangleAlertIcon />
					{said}
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-xl" showCloseButton={false}>
				<DialogHeader>
					<DialogTitle>{said}</DialogTitle>
					<DialogDescription>These are in the library’s files, and are skipped. The rest of the tokens are shown.</DialogDescription>
				</DialogHeader>
				<DialogBody>
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
				</DialogBody>
				<DialogFooter showCloseButton />
			</DialogContent>
		</Dialog>
	);
};
