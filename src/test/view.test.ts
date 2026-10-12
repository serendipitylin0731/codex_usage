import assert from 'node:assert/strict';
import test from 'node:test';
import type * as vscode from 'vscode';
import { QuotaView } from '../view';

test('FAQ message from the webview opens help', () => {
  let onMessage: ((message: unknown) => void) | undefined;
  let opened = 0;
  const webview = {
    options: {},
    html: '',
    onDidReceiveMessage(handler: (message: unknown) => void) {
      onMessage = handler;
      return { dispose() {} };
    },
    postMessage() { return Promise.resolve(true); }
  };
  const provider = new QuotaView(() => {}, () => { opened++; });
  provider.resolveWebviewView({ webview } as unknown as vscode.WebviewView);

  assert.match(webview.html, /id="faq"/);
  assert.match(webview.html, /常见问题与解决方案/);
  onMessage!({ type: 'faq' });
  assert.equal(opened, 1);
});
