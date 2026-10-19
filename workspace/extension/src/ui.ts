import * as vscode from 'vscode';
import { errorText } from '../../src/shared/result';
import type { AgentLogLike, Offer, Progress, Tell } from './agentWork';
import type { PublishStatus } from '../../src/shared/contract';
import { syncItem } from './publishing';
import { openLink } from './vscodePorts';

export const failed = (err: unknown): void => void vscode.window.showErrorMessage(errorText(err, { firstLine: true }));

/** Also rethrows for a command run by code (a keybinding, another extension, a test), so the caller is told too. */
export const failedFor =
	(fromCode: boolean) =>
	(err: unknown): void => {
		failed(err);
		if (fromCode) throw err;
	};

export const vscodeOpen = (url: string): Promise<void> => openLink(vscode, url);

export const vscodeCopy = async (text: string): Promise<void> => {
	await vscode.env.clipboard.writeText(text);
	vscodeTell('Copied the link.');
};

export const vscodeTell: Tell = (message) => void vscode.window.showInformationMessage(message);

export const vscodeOffer: Offer = async (message, actions) => vscode.window.showInformationMessage(message, ...actions);

export const vscodeChoose: Offer = async (message, actions) => vscode.window.showWarningMessage(message, ...actions);

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
