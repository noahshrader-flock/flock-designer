import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Alert, AlertDescription } from './ui/alert';

/**
 * What went wrong, as one destructive alert with its text and nothing else. The text wraps, a long word included: a git
 * or `gh` error is one long line with paths and addresses in it, and run off the side it cannot be read. It may hold a
 * link or a name in code, so it is anything a description can.
 */
export const ErrorAlert = ({ error, className }: { error: ReactNode; className?: string }) => (
	<Alert variant="destructive" className={cn(className)}>
		<AlertDescription className="wrap-anywhere whitespace-pre-wrap">{error}</AlertDescription>
	</Alert>
);
