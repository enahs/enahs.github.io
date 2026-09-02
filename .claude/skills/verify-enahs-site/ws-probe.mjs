#!/usr/bin/env node
import { argv } from 'node:process';

const arg = (n, d) => { const i = argv.indexOf(`--${n}`); return i === -1 ? d : argv[i + 1]; };

const url = arg('url', 'ws://localhost:3000/ws');
const seconds = Number(arg('for', '5'));
const expect = arg('expect', 'quiet');

const t0 = Date.now();
const messages = [];
let ws;
try {
  ws = new WebSocket(url);
} catch (e) {
  console.log(JSON.stringify({ ok: false, error: `cannot construct socket: ${e.message}` }));
  process.exit(2);
}

ws.addEventListener('message', (ev) => {
  messages.push({ at_ms: Date.now() - t0, data: String(ev.data) });
  if (expect === 'reload' && String(ev.data) === 'reload') finish();
});
ws.addEventListener('error', () => {
  console.log(JSON.stringify({ ok: false, error: 'websocket error, server may be down', messages }));
  process.exit(2);
});

let done = false;
function finish() {
  if (done) return;
  done = true;
  try { ws.close(); } catch {}
  const greeted = messages.some((m) => m.data === 'connection successful');
  const reloaded = messages.some((m) => m.data === 'reload');
  const wedged = expect === 'quiet' && reloaded;
  const ok = expect === 'reload' ? reloaded : greeted && !reloaded;
  console.log(JSON.stringify({
    ok, greeted, reloaded, wedged, expect,
    verdict: wedged
      ? 'WEDGED: an unsolicited reload arrived on connect, the watch loop was blocked and this probe just unblocked it'
      : ok ? 'as expected' : 'unexpected message pattern',
    messages,
  }, null, 2));
  process.exit(ok ? 0 : 1);
}

setTimeout(finish, seconds * 1000);
