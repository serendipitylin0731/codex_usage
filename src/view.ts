import * as vscode from 'vscode';
import { QuotaSnapshot } from './model';

export class QuotaView implements vscode.WebviewViewProvider {
  private view: vscode.WebviewView | undefined;
  private snapshot: QuotaSnapshot | null = null;
  private error: string | null = null;

  constructor(private readonly refresh: () => void) {}

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    view.webview.options = { enableScripts: true };
    view.webview.html = this.html(view.webview);
    view.webview.onDidReceiveMessage(message => {
      if (message?.type === 'refresh') this.refresh();
      if (message?.type === 'ready') this.send();
    });
    this.send();
  }

  update(snapshot: QuotaSnapshot | null, error: string | null): void {
    this.snapshot = snapshot;
    this.error = error;
    this.send();
  }

  private send(): void {
    void this.view?.webview.postMessage({ type: 'snapshot', snapshot: this.snapshot, error: this.error });
  }

  private html(webview: vscode.Webview): string {
    const nonce = Math.random().toString(36).slice(2) + Date.now().toString(36);
    return `<!doctype html>
<html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
<style nonce="${nonce}">
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  body { margin: 0; padding: 9px 8px 12px; color: var(--vscode-foreground); font-family: var(--vscode-font-family); font-size: 12px; }
  .top { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  h1 { font-size: 13px; line-height: 1.2; margin: 0; font-weight: 650; }
  button { border: 1px solid var(--vscode-button-border, transparent); background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); padding: 6px 9px; border-radius: 7px; cursor: pointer; font: inherit; }
  button:hover { background: var(--vscode-button-secondaryHoverBackground); }
  .dashboard { display: grid; grid-template-columns: minmax(88px, 120px) minmax(0, 1fr); gap: 8px; align-items: center; margin-top: 8px; }
  .chart { position: relative; width: min(100%, 120px); aspect-ratio: 1; }
  svg { display: block; width: 100%; height: 100%; overflow: visible; }
  .center { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; pointer-events: none; }
  .center .num { font-size: 22px; font-weight: 730; line-height: 1; letter-spacing: -.05em; }
  .center .caption { color: var(--vscode-descriptionForeground); margin-top: 2px; text-align: center; font-size: 9px; line-height: 1.1; }
  .center .sub { color: var(--vscode-descriptionForeground); font-size: 8px; margin-top: 2px; text-align: center; }
  .legend { display: grid; gap: 8px; min-width: 0; }
  .row { min-width: 0; padding: 2px 0 2px 6px; border-left: 3px solid; }
  .name { font-weight: 650; font-size: 11px; }
  .value { font-size: 11px; font-weight: 650; font-variant-numeric: tabular-nums; margin-top: 2px; }
  .detail { color: var(--vscode-descriptionForeground); font-size: 10px; font-variant-numeric: tabular-nums; line-height: 1.35; margin-top: 2px; overflow-wrap: anywhere; }
  .error { color: var(--vscode-errorForeground); margin-top: 10px; font-size: 11px; line-height: 1.5; }
  .empty { text-align: center; padding: 12px 4px; color: var(--vscode-descriptionForeground); line-height: 1.5; }
  @media (max-width: 220px) { .dashboard { grid-template-columns: 88px minmax(0, 1fr); gap: 4px; } }
</style></head><body>
<div class="top"><h1 id="title">Codex 额度</h1><button id="refresh" title="立即刷新">↻</button></div>
<div id="content" class="empty">正在读取 Codex 额度…</div>
<div id="error" class="error" role="status"></div>
<script nonce="${nonce}">
const vscode = acquireVsCodeApi();
document.getElementById('refresh').addEventListener('click', () => vscode.postMessage({type:'refresh'}));
const NS = 'http://www.w3.org/2000/svg';
function svg(tag, attrs) { const el=document.createElementNS(NS,tag); for(const [key,val] of Object.entries(attrs)) el.setAttribute(key,String(val)); return el; }
function resetTime(seconds) { return seconds ? new Date(seconds*1000).toLocaleString('zh-CN',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}) : '未知'; }
function color(window) { const left=window.remainingPercent; return window.kind==='fiveHour' ? (left<=20?'#f16f80':left<=50?'#d69a54':'#a58af5') : (left<=20?'#f16f80':left<=50?'#d6aa4e':'#4fcaa9'); }
function timeLeft(window) { if(window.resetsAt===null || window.durationMinutes===null || window.durationMinutes<=0) return null; return Math.max(0,Math.min(100,(window.resetsAt*1000-Date.now())/(window.durationMinutes*60000)*100)); }
function addArc(group, radius, width, percent, stroke, opacity) {
  if(percent===null || percent<=0) return;
  const circumference=2*Math.PI*radius, length=circumference*Math.min(100,percent)/100;
  group.appendChild(svg('circle',{cx:140,cy:140,r:radius,fill:'none',stroke:stroke,'stroke-width':width,opacity:opacity,'stroke-dasharray':length+' '+circumference}));
}
function addRing(root, window, radius, width) {
  const group=svg('g',{transform:'rotate(-90 140 140)'});
  const ringColor=color(window);
  // The two solid arcs start at twelve o'clock. Consumed quota and elapsed time remain empty.
  addArc(group,radius,width,window.remainingPercent,ringColor,1);
  addArc(group,radius-width/2-5,3,timeLeft(window),ringColor,.85);
  root.appendChild(group);
}
function render(snapshot,error) {
  const content=document.getElementById('content'), err=document.getElementById('error');
  err.textContent=error||'';
  content.replaceChildren(); content.className='';
  if(!snapshot) { content.className='empty'; content.textContent=error?'尚无可显示的额度数据':'正在读取 Codex 额度…'; return; }
  document.getElementById('title').textContent=snapshot.limitName || 'Codex 额度';
  const dashboard=document.createElement('div');dashboard.className='dashboard';
  const chart=document.createElement('div'); chart.className='chart';
  const graphic=svg('svg',{viewBox:'0 0 280 280','aria-label':'外侧粗线为剩余额度，内侧细线为剩余时间',role:'img'});
  snapshot.windows.forEach((window,i)=>addRing(graphic,window,i===0?112:82,i===0?17:14));
  chart.appendChild(graphic);
  const center=document.createElement('div'); center.className='center';
  const num=document.createElement('div'); num.className='num'; num.textContent=snapshot.resetCredits===null?'—':String(snapshot.resetCredits);
  const caption=document.createElement('div'); caption.className='caption'; caption.append('usable',document.createElement('br'),'resets');
  center.append(num,caption);
  if(snapshot.resetCredits===null){ const sub=document.createElement('div');sub.className='sub';sub.textContent='数据暂不可用';center.appendChild(sub); }
  chart.appendChild(center);dashboard.appendChild(chart);
  const legend=document.createElement('div');legend.className='legend';
  if(!snapshot.windows.length){ const empty=document.createElement('div');empty.className='empty';empty.textContent='该账户未返回时间窗口额度';legend.appendChild(empty); }
  for(const window of snapshot.windows){
    const row=document.createElement('div');row.className='row';
    row.style.borderLeftColor=color(window);
    const name=document.createElement('div');name.className='name';name.textContent=window.label+'额度';
    const value=document.createElement('div');value.className='value';value.textContent='额度剩余 '+Math.round(window.remainingPercent)+'%';
    const reset=document.createElement('div');reset.className='detail';reset.textContent='重置 '+resetTime(window.resetsAt);
    row.append(name,value,reset);legend.appendChild(row);
  }
  dashboard.appendChild(legend);content.appendChild(dashboard);
}
let currentSnapshot=null,currentError=null;
window.addEventListener('message',event=>{if(event.data?.type==='snapshot'){currentSnapshot=event.data.snapshot;currentError=event.data.error;render(currentSnapshot,currentError)}});
setInterval(()=>{if(currentSnapshot)render(currentSnapshot,currentError)},30000);
vscode.postMessage({type:'ready'});
</script></body></html>`;
  }
}
