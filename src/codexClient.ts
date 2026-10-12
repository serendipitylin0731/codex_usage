import { spawn, ChildProcessWithoutNullStreams } from 'node:child_process';

type Pending = {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
  timer: NodeJS.Timeout;
};

export class CodexClient {
  private process: ChildProcessWithoutNullStreams | undefined;
  private startPromise: Promise<void> | undefined;
  private nextId = 1;
  private pending = new Map<number, Pending>();
  private buffer = '';
  private disposed = false;

  constructor(private readonly executable: string, private readonly onUpdate: () => void) {}

  async readRateLimits(): Promise<unknown> {
    await this.start();
    return this.request('account/rateLimits/read', { excludeResetCreditDetails: false });
  }

  private start(): Promise<void> {
    if (this.disposed) return Promise.reject(new Error('Codex 客户端已关闭'));
    if (this.startPromise) return this.startPromise;
    this.startPromise = this.launch().catch(error => {
      this.startPromise = undefined;
      this.process?.kill();
      throw error;
    });
    return this.startPromise;
  }

  private async launch(): Promise<void> {
    this.buffer = '';
    const child = spawn(this.executable, ['app-server', '--listen', 'stdio://'], {
      stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true
    });
    this.process = child;
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => this.receive(chunk));
    child.stdin.on('error', () => { /* Process exit is handled by the child close event. */ });
    // Keep stderr drained but do not log it: Codex diagnostics may contain private paths.
    child.stderr.resume();
    child.on('error', error => this.closed(child, error));
    child.on('close', () => this.closed(child, new Error('Codex app-server 已退出')));

    await this.request('initialize', {
      clientInfo: { name: 'codex_quota_rings', title: 'Codex Quota Rings', version: '0.4.13' },
      capabilities: null
    });
    this.write({ method: 'initialized' });
  }

  private request(method: string, params: unknown): Promise<unknown> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`${method} 超时`));
      }, 15000);
      this.pending.set(id, { resolve, reject, timer });
      try {
        this.write({ id, method, params });
      } catch (error) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  private write(message: unknown): void {
    if (!this.process?.stdin.writable) throw new Error('无法连接 Codex app-server');
    this.process.stdin.write(`${JSON.stringify(message)}\n`);
  }

  private receive(chunk: string): void {
    this.buffer += chunk;
    if (this.buffer.length > 5_000_000) {
      this.process?.kill();
      return;
    }
    let newline: number;
    while ((newline = this.buffer.indexOf('\n')) >= 0) {
      const line = this.buffer.slice(0, newline);
      this.buffer = this.buffer.slice(newline + 1);
      let message: Record<string, unknown>;
      try { message = JSON.parse(line); } catch { continue; }
      if (typeof message.id === 'number') {
        const pending = this.pending.get(message.id);
        if (!pending) continue;
        this.pending.delete(message.id);
        clearTimeout(pending.timer);
        if (message.error) {
          const error = message.error as Record<string, unknown>;
          pending.reject(new Error(typeof error.message === 'string' ? error.message : 'Codex 请求失败'));
        } else {
          pending.resolve(message.result);
        }
      } else if (message.method === 'account/rateLimits/updated') {
        this.onUpdate();
      }
    }
  }

  private closed(child: ChildProcessWithoutNullStreams, error: Error): void {
    if (this.process !== child) return;
    this.process = undefined;
    this.startPromise = undefined;
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
  }

  dispose(): void {
    this.disposed = true;
    this.process?.kill();
    this.process = undefined;
    this.startPromise = undefined;
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(new Error('Codex 客户端已关闭'));
    }
    this.pending.clear();
  }
}
