import * as vscode from 'vscode';
import { errorText } from '../../src/shared/result';
import type { AgentLogLike, Offer, Progress, Tell } from './agentWork';
import type { PublishStatus } from '../../src/shared/contract';
import { syncItem } from './publishing';
import { openLink } from './vscodePorts';

/** Says what went wrong, in VS Code's own error message: its first line. */
export const failed = (err: unknown): void => void vscode.window.showErrorMessage(errorText(err, { firstLine: true }));

/**
 * Says what went wrong, and, for a command run by code with its answers (a keybinding, another extension, a test), throws
 * it on, so the caller is told too.
 */
export const failedFor =
	(fromCode: boolean) =>
	(err: unknown): void => {
		failed(err);
		if (fromCode) throw err;
	};

/** Opens an address in the person's browser, outside VS Code. */
export const vscodeOpen = (url: string): Promise<void> => openLink(vscode, url);

/** Puts a link on the clipboard, and says so. */
export const vscodeCopy = async (text: string): Promise<void> => {
	await vscode.env.clipboard.writeText(text);
	vscodeTell('Copied the link.');
};

/** Says how something went, in VS Code's notification, without waiting on anyone. */
export const vscodeTell: Tell = (message) => void vscode.window.showInformationMessage(message);

/** How something went, with what can be done next, as VS Code's notification with buttons: the one pressed, or undefined. */
export const vscodeOffer: Offer = async (message, actions) => vscode.window.showInformationMessage(message, ...actions);

/** A warning with what can be done about it, as VS Code's notification with buttons: the one pressed, or undefined. */
export const vscodeChoose: Offer = async (message, actions) => vscode.window.showWarningMessage(message, ...actions);

/** Work that takes a while, in VS Code's notification, with a Stop (its cancel button) when it can be stopped. */
export const vscodeProgress: Progress = (title, task, onStop) =>
	Promise.resolve(
		vscode.window.withProgress(
			{ location: vscode.ProgressLocation.Notification, title, cancellable: onStop !== undefined },
			async (progress, token) => {
				if (onStop) token.onCancellationRequested(onStop);
				await task((message) => progress.report({ message }));
			},
		),
	);

/** The agent's log, in View › Output › DSNR: Agent: started afresh for each piece of work, and shown beside the editor. */
export class AgentLog implements AgentLogLike, vscode.Disposable {
	private readonly channel = vscode.window.createOutputChannel('DSNR: Agent');

	start(title: string): void {
		this.channel.clear();
		this.channel.appendLine(`${title}: the agent's log`);
		this.channel.show(true);
	}

	line(text: string): void {
		this.channel.appendLine(text);
	}

	dispose(): void {
		this.channel.dispose();
	}
}

/** Whether the person's work is synced, in VS Code's status bar (`syncItem`); pressing it is DSNR: Sync your work. */
export class SyncStatus implements vscode.Disposable {
	private readonly item = vscode.window.createStatusBarItem('dsnr.sync', vscode.StatusBarAlignment.Left);

	constructor() {
		this.item.name = 'DSNR sync';
		this.item.command = 'dsnr.sync';
	}

	show(status: PublishStatus): void {
		const shown = syncItem(status);
		if (shown === null) return void this.item.hide();
		this.item.text = shown.text;
		this.item.tooltip = shown.tooltip;
		this.item.show();
	}

	dispose(): void {
		this.item.dispose();
	}
}
