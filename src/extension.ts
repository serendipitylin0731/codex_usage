import * as vscode from 'vscode';
import { CodexClient } from './codexClient';
import { parseQuotaResponse, QuotaSnapshot, statusBarParts } from './model';
import { RefreshPolicy, RETRY_INTERVAL_MS } from './refreshPolicy';
import { QuotaView } from './view';

let client: CodexClient | undefined;
let timer: NodeJS.Timeout | undefined;
let inFlight: Promise<void> | undefined;
let snapshot: QuotaSnapshot | null = null;
let lastError: string | null = null;
let generation = 0;

export function activate(context: vscode.ExtensionContext): void {
  const refreshPolicy = new RefreshPolicy();
  let normalRefreshMs = 30_000;
  const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 102);
  const shortStatus = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 101);
  const detailsStatus = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  status.name = 'Codex 额度';
  shortStatus.name = 'Codex 短周期倒计时';
  detailsStatus.name = 'Codex 额度摘要';
  for (const item of [status, shortStatus, detailsStatus]) item.command = 'codexQuota.show';
  status.text = '$(sync~spin) Codex 额度';
  status.tooltip = '正在读取 Codex 额度';
  status.show();

  const updateStatusText = () => {
    if (!snapshot) return;
    const parts = statusBarParts(snapshot);
    const light = vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.Light
      || vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.HighContrastLight;
    const items = [status, shortStatus, detailsStatus];
    items.forEach((item, index) => {
      const part = parts[index];
      if (!part) { item.hide(); return; }
      item.text = part.text;
      item.color = part.kind === 'weekly' ? light ? '#a4465a' : '#f3c1b9'
        : part.kind === 'fiveHour' ? light ? '#276f9e' : '#a8d7ec'
          : light ? new vscode.ThemeColor('statusBar.foreground') : '#ffffff';
      item.show();
    });
  };

  const render = () => {
    view.update(snapshot, lastError);
    if (!snapshot) {
      shortStatus.hide();
      detailsStatus.hide();
      status.text = lastError ? '$(warning) Codex 额度' : '$(sync~spin) Codex 额度';
      status.color = lastError ? new vscode.ThemeColor('statusBarItem.warningForeground') : undefined;
      status.tooltip = lastError || '正在读取 Codex 额度';
      return;
    }
    updateStatusText();
    const tooltip = new vscode.MarkdownString();
    tooltip.appendMarkdown(`**${snapshot.limitName.replace(/[\\`*_{}\[\]()#+.!|>~-]/g, '\\$&')}**\n\n`);
    for (const window of snapshot.windows) {
      const reset = window.resetsAt ? new Date(window.resetsAt * 1000).toLocaleString() : '未知';
      tooltip.appendText(`${window.label}：额度剩余 ${Math.round(window.remainingPercent)}%，重置 ${reset}\n`);
    }
    tooltip.appendText(`可用重置次数：${snapshot.resetCredits ?? '未知'}\n`);
    tooltip.appendText(`上次更新：${new Date(snapshot.fetchedAt).toLocaleTimeString()}`);
    if (lastError) tooltip.appendText(`\n刷新失败：${lastError}`);
    for (const item of [status, shortStatus, detailsStatus]) item.tooltip = tooltip;
  };

  const schedule = (delayMs: number, scheduledRetry: boolean): void => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = undefined;
      void refresh(scheduledRetry);
    }, delayMs);
  };

  const refresh = (scheduledRetry = false): Promise<void> => {
    if (inFlight) return inFlight;
    const requestGeneration = generation;
    const requestClient = client!;
    inFlight = (async () => {
      try {
        const config = vscode.workspace.getConfiguration('codexQuota');
        const response = await requestClient.readRateLimits();
        const parsed = parseQuotaResponse(response, config.get<string>('limitId', 'codex'));
        if (!parsed) throw new Error('Codex 未返回可识别的额度数据');
        if (requestGeneration !== generation) return;
        snapshot = parsed;
        refreshPolicy.reset();
        lastError = null;
        schedule(normalRefreshMs, false);
      } catch (error) {
        if (requestGeneration !== generation) return;
        refreshPolicy.fail(error instanceof Error ? error.message : String(error), scheduledRetry);
        lastError = refreshPolicy.visibleError;
        schedule(RETRY_INTERVAL_MS, true);
      } finally {
        if (requestGeneration === generation) render();
      }
    })().finally(() => { inFlight = undefined; });
    return inFlight;
  };

  const openFaq = async (): Promise<void> => {
    const uri = vscode.Uri.joinPath(context.extensionUri, 'FAQ.md');
    try {
      await vscode.commands.executeCommand('markdown.showPreview', uri);
    } catch {
      const document = await vscode.workspace.openTextDocument(uri);
      await vscode.window.showTextDocument(document);
    }
  };
  const view = new QuotaView(() => { void refresh(); }, () => { void openFaq(); });
  const start = () => {
    generation++;
    const previousRefresh = inFlight;
    if (timer) clearTimeout(timer);
    client?.dispose();
    refreshPolicy.reset();
    lastError = null;
    render();
    const config = vscode.workspace.getConfiguration('codexQuota');
    client = new CodexClient(config.get<string>('codexPath', 'codex'), () => {
      if (!refreshPolicy.isRetrying) void refresh();
    });
    const seconds = Math.min(600, Math.max(15, config.get<number>('refreshIntervalSeconds', 30)));
    normalRefreshMs = seconds * 1000;
    if (previousRefresh) void previousRefresh.finally(() => refresh());
    else void refresh();
  };

  context.subscriptions.push(status, shortStatus, detailsStatus);
  context.subscriptions.push(vscode.window.registerWebviewViewProvider('codexQuota.view', view, {
    webviewOptions: { retainContextWhenHidden: true }
  }));
  context.subscriptions.push(vscode.commands.registerCommand('codexQuota.refresh', () => refresh()));
  context.subscriptions.push(vscode.commands.registerCommand('codexQuota.faq', () => openFaq()));
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
  context.subscriptions.push(vscode.window.onDidChangeActiveColorTheme(() => updateStatusText()));
  const countdownTimer = setInterval(() => {
    updateStatusText();
  }, 10_000);
  context.subscriptions.push({ dispose: () => {
    generation++;
    clearInterval(countdownTimer);
    if (timer) clearTimeout(timer);
    client?.dispose();
  }});
  start();
}

export function deactivate(): void {
  generation++;
  if (timer) clearTimeout(timer);
  client?.dispose();
}
