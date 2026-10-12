export const RETRY_INTERVAL_MS = 3_000;
export const RETRY_FAILURE_LIMIT = 10;

export class RefreshPolicy {
  private retrying = false;
  private retryFailures = 0;
  private error: string | null = null;

  get isRetrying(): boolean { return this.retrying; }
  get visibleError(): string | null { return this.error; }

  reset(): void {
    this.retrying = false;
    this.retryFailures = 0;
    this.error = null;
  }

  fail(message: string, scheduledRetry: boolean): void {
    if (!this.retrying) {
      this.retrying = true;
    } else if (scheduledRetry) {
      this.retryFailures++;
    }
    if (this.retryFailures >= RETRY_FAILURE_LIMIT) this.error = message;
  }
}
