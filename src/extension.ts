import * as vscode from 'vscode';
import { CodexClient } from './codexClient';
import { parseQuotaResponse, QuotaSnapshot, QuotaWindow, remainingColor, timeRemainingPercent } from './model';
import { QuotaView } from './view';

let client: CodexClient | undefined;
let timer: NodeJS.Timeout | undefined;
let inFlight: Promise<void> | undefined;
let snapshot: QuotaSnapshot | null = null;
let lastError: string | null = null;

export function activate(context: vscode.ExtensionContext): void {
  const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  status.name = 'Codex 额度';
  status.command = 'codexQuota.show';
  status.text = '$(sync~spin) Codex 额度';
  status.tooltip = '正在读取 Codex 额度';
  status.show();

  const render = () => {
    view.update(snapshot, lastError);
    if (!snapshot) {
      status.text = lastError ? '$(warning) Codex 额度' : '$(sync~spin) Codex 额度';
      status.color = lastError ? new vscode.ThemeColor('statusBarItem.warningForeground') : undefined;
      status.tooltip = lastError || '正在读取 Codex 额度';
      return;
    }
    const weekly = snapshot.windows.find(window => window.kind === 'weekly');
    const short = snapshot.windows.find(window => window.kind === 'fiveHour');
    const displayed = [weekly, short].filter((window): window is QuotaWindow => window !== undefined);
    if (!displayed.length) displayed.push(...snapshot.windows);
    const labels = displayed.map(window => window.kind === 'weekly' ? '7d' : window.kind === 'fiveHour' ? '5h' : window.label);
    const percentages = displayed.map(window => `${Math.round(window.remainingPercent)}%`);
    status.text = displayed.length
      ? `${labels.join('|')} : ${percentages.join('|')}  reset: ${snapshot.resetCredits ?? '—'}`
      : `Codex : —  reset: ${snapshot.resetCredits ?? '—'}`;
    const lowest = [...snapshot.windows].sort((a, b) => a.remainingPercent - b.remainingPercent)[0];
    status.color = lastError ? new vscode.ThemeColor('statusBarItem.warningForeground') : lowest ? remainingColor(lowest) : undefined;
    const tooltip = new vscode.MarkdownString();
    tooltip.appendMarkdown(`**${snapshot.limitName.replace(/[\\`*_{}\[\]()#+.!|>~-]/g, '\\$&')}**\n\n`);
    for (const window of snapshot.windows) {
      const reset = window.resetsAt ? new Date(window.resetsAt * 1000).toLocaleString() : '未知';
      const time = timeRemainingPercent(window);
      tooltip.appendText(`${window.label}：额度剩余 ${Math.round(window.remainingPercent)}%，时间剩余 ${time === null ? '未知' : `${Math.round(time)}%`}，重置 ${reset}\n`);
    }
    tooltip.appendText(`可用重置次数：${snapshot.resetCredits ?? '未知'}\n`);
    tooltip.appendText(`上次更新：${new Date(snapshot.fetchedAt).toLocaleTimeString()}`);
    if (lastError) tooltip.appendText(`\n刷新失败：${lastError}`);
    status.tooltip = tooltip;
  };

  const refresh = (): Promise<void> => {
    if (inFlight) return inFlight;
    inFlight = (async () => {
      try {
        const config = vscode.workspace.getConfiguration('codexQuota');
        const response = await client!.readRateLimits();
        const parsed = parseQuotaResponse(response, config.get<string>('limitId', 'codex'));
        if (!parsed) throw new Error('Codex 未返回可识别的额度数据');
        snapshot = parsed;
        lastError = null;
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
      } finally {
        render();
      }
    })().finally(() => { inFlight = undefined; });
    return inFlight;
  };

  const view = new QuotaView(() => { void refresh(); });
  const start = () => {
    const previousRefresh = inFlight;
    if (timer) clearInterval(timer);
    client?.dispose();
    const config = vscode.workspace.getConfiguration('codexQuota');
    client = new CodexClient(config.get<string>('codexPath', 'codex'), () => { void refresh(); });
    const seconds = Math.min(600, Math.max(15, config.get<number>('refreshIntervalSeconds', 30)));
    timer = setInterval(() => { void refresh(); }, seconds * 1000);
    if (previousRefresh) void previousRefresh.finally(() => refresh());
    else void refresh();
  };

  context.subscriptions.push(status);
  context.subscriptions.push(vscode.window.registerWebviewViewProvider('codexQuota.view', view, {
    webviewOptions: { retainContextWhenHidden: true }
  }));
  context.subscriptions.push(vscode.commands.registerCommand('codexQuota.refresh', () => refresh()));
  context.subscriptions.push(vscode.commands.registerCommand('codexQuota.show', async () => {
    await vscode.commands.executeCommand('workbench.view.explorer');
    await vscode.commands.executeCommand('codexQuota.view.focus');
  }));
  context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(event => {
    if (event.affectsConfiguration('codexQuota.codexPath') || event.affectsConfiguration('codexQuota.refreshIntervalSeconds')) {
      start();
    } else if (event.affectsConfiguration('codexQuota.limitId')) {
      void refresh();
    }
  }));
  context.subscriptions.push({ dispose: () => {
    if (timer) clearInterval(timer);
    client?.dispose();
  }});
  start();
}

export function deactivate(): void {
  if (timer) clearInterval(timer);
  client?.dispose();
}
