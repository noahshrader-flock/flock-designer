import * as vscode from 'vscode';
import type { AgentLogLike, Progress } from './agentWork';
import type { Ask } from './newPrototype';

/** VS Code's own input box and quick pick, as a flow asks them (`Ask`). */
export const vscodeAsk: Ask = {
	text: async ({ title, prompt, placeholder, validate }) =>
		vscode.window.showInputBox({
			title,
			prompt,
			ignoreFocusOut: true,
			...(placeholder !== undefined ? { placeHolder: placeholder } : {}),
			...(validate ? { validateInput: (v: string) => validate(v) ?? undefined } : {}),
		}),
	pick: async ({ title, placeholder, items }) =>
		(await vscode.window.showQuickPick(items, { title, placeHolder: placeholder, ignoreFocusOut: true }))?.value,
};

/** A warning with what can be done about it, as VS Code's notification with buttons: the one pressed, or undefined. */
export const vscodeChoose = async (message: string, actions: string[]): Promise<string | undefined> =>
	vscode.window.showWarningMessage(message, ...actions);

/** Work that takes a while, in VS Code's notification with a Stop (its cancel button). */
export const vscodeProgress: Progress = (title, task, onStop) =>
	Promise.resolve(
		vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title, cancellable: true }, async (progress, token) => {
			token.onCancellationRequested(onStop);
			await task((message) => progress.report({ message }));
		}),
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
