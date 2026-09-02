#!/usr/bin/env node
// Headless Chrome driver over the DevTools Protocol. No npm dependencies:
// Node 22's global WebSocket speaks CDP directly.
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { argv } from 'node:process';

const CHROME = process.env.CHROME_BIN
  || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const arg = (n, d) => { const i = argv.indexOf(`--${n}`); return i === -1 ? d : argv[i + 1]; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

// Throughput in bytes/sec, latency in ms. slow4g mirrors the Lighthouse mobile preset.
// Without throttling every asset arrives from localhost in ~1ms and LCP measures nothing.
const NETWORK_PROFILES = {
  none: null,
  slow4g: { latency: 150, downloadThroughput: 1.6 * 1024 * 1024 / 8, uploadThroughput: 750 * 1024 / 8 },
  fast4g: { latency: 40, downloadThroughput: 9 * 1024 * 1024 / 8, uploadThroughput: 1.5 * 1024 * 1024 / 8 },
};

const VITALS_PROBE = `
  window.__vitals = { lcp: null, cls: 0, shifts: [] };
  new PerformanceObserver((list) => {
    for (const e of list.getEntries()) {
      window.__vitals.lcp = {
        ms: Math.round(e.startTime), size: e.size, url: e.url || null,
        tag: e.element ? e.element.tagName : null,
        cls_attr: e.element ? e.element.getAttribute('class') : null,
      };
    }
  }).observe({ type: 'largest-contentful-paint', buffered: true });
  new PerformanceObserver((list) => {
    for (const e of list.getEntries()) {
      if (e.hadRecentInput) continue;
      window.__vitals.cls += e.value;
      window.__vitals.shifts.push({ value: Number(e.value.toFixed(5)), ms: Math.round(e.startTime) });
    }
  }).observe({ type: 'layout-shift', buffered: true });
`;

const grade = (metric, v) => {
  const t = { lcp: [2500, 4000], cls: [0.1, 0.25] }[metric];
  return v <= t[0] ? 'good' : v <= t[1] ? 'needs-improvement' : 'poor';
};

async function launchChrome() {
  if (!existsSync(CHROME)) throw new Error(`no Chrome at ${CHROME}, set CHROME_BIN`);
  const port = 9333 + Math.floor(Math.random() * 500);
  const profile = mkdtempSync(join(tmpdir(), 'verify-enahs-chrome-'));
  const proc = spawn(CHROME, [
    '--headless=new',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    '--no-first-run', '--no-default-browser-check', '--disable-extensions',
    '--disable-background-networking', '--window-size=1280,900',
    'about:blank',
  ], { stdio: 'ignore' });

  const deadline = Date.now() + 25000;
  while (Date.now() < deadline) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      const page = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
      if (page) return { proc, profile, wsUrl: page.webSocketDebuggerUrl };
    } catch { /* not listening yet */ }
    await sleep(200);
  }
  proc.kill('SIGKILL');
  rmSync(profile, { recursive: true, force: true });
  throw new Error('Chrome never exposed a page target');
}

function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  const pending = new Map();
  const listeners = [];
  let id = 0;
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(JSON.stringify(msg.error))); else resolve(msg.result);
    } else if (msg.method) {
      for (const fn of listeners) fn(msg);
    }
  });
  const ready = new Promise((res, rej) => {
    ws.addEventListener('open', res, { once: true });
    ws.addEventListener('error', () => rej(new Error('CDP socket failed')), { once: true });
  });
  return {
    ready,
    send: (method, params = {}) => new Promise((resolve, reject) => {
      const mid = ++id;
      pending.set(mid, { resolve, reject });
      ws.send(JSON.stringify({ id: mid, method, params }));
    }),
    on: (fn) => listeners.push(fn),
    close: () => { try { ws.close(); } catch {} },
  };
}

async function waitFor(predicate, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return true;
    await sleep(100);
  }
  return false;
}

async function main() {
  const command = argv[2];
  const url = arg('url', 'http://localhost:3000/');
  const outDir = arg('out-dir', join(tmpdir(), 'verify-enahs-site', 'artifacts'));
  mkdirSync(outDir, { recursive: true });

  const chrome = await launchChrome();
  const cdp = connect(chrome.wsUrl);
  const result = { command, url, artifacts: [] };
  const loads = [];
  const consoleLines = [];
  const pageErrors = [];
  const t0 = Date.now();

  try {
    await cdp.ready;
    cdp.on((m) => {
      if (m.method === 'Page.loadEventFired') loads.push({ n: loads.length + 1, at_ms: Date.now() - t0 });
      if (m.method === 'Runtime.exceptionThrown') {
        const d = m.params.exceptionDetails;
        pageErrors.push({
          at_ms: Date.now() - t0,
          text: d.exception?.description ?? d.text,
          line: d.lineNumber,
          url: d.url,
        });
      }
      if (m.method === 'Runtime.consoleAPICalled') {
        consoleLines.push({
          at_ms: Date.now() - t0,
          type: m.params.type,
          text: m.params.args.map((a) => a.value ?? a.description ?? a.type).join(' '),
        });
      }
    });
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Page.navigate', { url });
    if (!await waitFor(() => loads.length >= 1, 20000)) throw new Error(`page never loaded: ${url}`);
    await sleep(400);

    const snap = async () => (await cdp.send('Runtime.evaluate', {
      expression: `JSON.stringify({
        title: document.title,
        heading: document.querySelector('h1')?.innerText ?? null,
        text: document.body.innerText.replace(/\\s+/g,' ').trim().slice(0, 600),
        links: [...document.querySelectorAll('a')].map(a => a.getAttribute('href')),
        images: [...document.images].map(i => ({ src: i.getAttribute('src'), alt: i.alt, loaded: i.naturalWidth > 0 })),
        scripts: [...document.scripts].map(s => s.getAttribute('src')).filter(Boolean),
        inlineScriptCount: [...document.scripts].filter(s => !s.src).length,
        bodyAlignItems: getComputedStyle(document.body).alignItems,
        fontFamily: getComputedStyle(document.body).fontFamily,
        mainDocTop: (() => { const m = document.querySelector('main');
          return m ? Math.round(m.getBoundingClientRect().top + window.scrollY) : null; })(),
        contentReachable: (() => { const m = document.querySelector('main');
          return m ? m.getBoundingClientRect().top + window.scrollY >= 0 : true; })()
      })`,
      returnByValue: true,
    })).result.value;

    const shoot = async (name) => {
      const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
      const path = join(outDir, name);
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, Buffer.from(data, 'base64'));
      result.artifacts.push(path);
      return path;
    };

    if (command === 'inspect') {
      result.page = JSON.parse(await snap());
      if (arg('screenshot')) await shoot(arg('screenshot'));
    } else if (command === 'watch-reload') {
      const createPage = arg('create-page');
      const marker = arg('marker', `verify-${Date.now()}`);
      const timeout = Number(arg('timeout', '25')) * 1000;
      if (!createPage) throw new Error('watch-reload needs --create-page <path under pages/>');

      result.before = JSON.parse(await snap());
      result.wsConnected = consoleLines.some((l) => l.text.includes('new websocket connection opened'));
      await shoot('hot-reload-before.png');

      const loadsBefore = loads.length;
      writeFileSync(createPage,
        `{{define "title"}}ENAHS | ${marker}{{end}}\n{{define "content"}}\n<h1>${marker}</h1>\n{{end}}\n`);
      result.createdPage = createPage;
      result.marker = marker;

      result.reloaded = await waitFor(() => loads.length > loadsBefore, timeout);
      await sleep(600);
      result.after = JSON.parse(await snap());
      await shoot('hot-reload-after.png');
      result.loadEvents = loads;
      result.note = 'probe page left in place on purpose. control-site down removes pages/verify-probe-*.html and rebuilds.';
    } else if (command === 'vitals') {
      const runs = Number(arg('runs', '3'));
      const throttle = arg('throttle', 'slow4g');
      if (!(throttle in NETWORK_PROFILES)) throw new Error(`unknown --throttle ${throttle}`);
      const cpuRate = Number(arg('cpu', '4'));
      const settleMs = Number(arg('settle', '2500'));

      await cdp.send('Network.enable');
      await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
      await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: VITALS_PROBE });

      const inflight = new Map();
      cdp.on((m) => {
        if (m.method === 'Network.responseReceived') {
          inflight.set(m.params.requestId, {
            url: m.params.response.url, type: m.params.type,
            mime: m.params.response.mimeType, status: m.params.response.status, bytes: 0,
          });
        }
        if (m.method === 'Network.loadingFinished') {
          const r = inflight.get(m.params.requestId);
          if (r) r.bytes = m.params.encodedDataLength;
        }
      });

      const samples = [];
      for (let i = 0; i < runs; i++) {
        await cdp.send('Page.navigate', { url: 'about:blank' });
        await sleep(300);
        inflight.clear();
        await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpuRate });
        if (NETWORK_PROFILES[throttle]) {
          await cdp.send('Network.emulateNetworkConditions', { offline: false, ...NETWORK_PROFILES[throttle] });
        }
        const mark = loads.length;
        await cdp.send('Page.navigate', { url });
        if (!await waitFor(() => loads.length > mark, 60000)) throw new Error(`page never loaded: ${url}`);
        await sleep(settleMs);
        const v = JSON.parse((await cdp.send('Runtime.evaluate', {
          expression: `JSON.stringify(Object.assign({}, window.__vitals, { nav: (() => {
            const n = performance.getEntriesByType('navigation')[0];
            return n ? { ttfb: Math.round(n.responseStart), domContentLoaded: Math.round(n.domContentLoadedEventEnd), load: Math.round(n.loadEventEnd) } : null;
          })() }))`,
          returnByValue: true,
        })).result.value);
        const resources = [...inflight.values()].filter((r) => r.status !== 0);
        samples.push({
          run: i + 1,
          lcp_ms: v.lcp ? v.lcp.ms : null,
          lcp_element: v.lcp ? `${v.lcp.tag}${v.lcp.cls_attr ? '.' + v.lcp.cls_attr : ''}` : null,
          lcp_url: v.lcp ? v.lcp.url : null,
          cls: Number(v.cls.toFixed(5)),
          shifts: v.shifts,
          nav: v.nav,
          total_bytes: resources.reduce((a, r) => a + r.bytes, 0),
          image_bytes: resources.filter((r) => r.type === 'Image').reduce((a, r) => a + r.bytes, 0),
          resources: resources.map((r) => ({ url: r.url, type: r.type, bytes: r.bytes })).sort((a, b) => b.bytes - a.bytes),
        });
      }

      const lcps = samples.map((s) => s.lcp_ms).filter((n) => n !== null);
      const medLcp = lcps.length ? median(lcps) : null;
      const medCls = median(samples.map((s) => s.cls));
      result.config = { throttle, cpuThrottlingRate: cpuRate, runs, settleMs };
      result.samples = samples;
      result.median = {
        lcp_ms: medLcp,
        lcp_element: samples[0].lcp_element,
        cls: medCls,
        total_bytes: median(samples.map((s) => s.total_bytes)),
        image_bytes: median(samples.map((s) => s.image_bytes)),
      };
      result.verdict = {
        lcp: medLcp === null ? 'no-lcp-candidate' : grade('lcp', medLcp),
        cls: grade('cls', medCls),
        inp: 'not-applicable (no interactive elements on this page)',
      };
      result.thresholds = { lcp_good_ms: 2500, cls_good: 0.1 };
      if (arg('screenshot')) await shoot(arg('screenshot'));
    } else {
      throw new Error(`unknown command: ${command}`);
    }

    result.console = consoleLines;
    result.pageErrors = pageErrors;
    result.ok = command === 'watch-reload' ? result.reloaded === true
      : command === 'vitals' ? result.verdict.lcp === 'good' && result.verdict.cls === 'good'
      : result.page?.contentReachable !== false;
  } finally {
    cdp.close();
    chrome.proc.kill('SIGKILL');
    await sleep(400);
    try {
      rmSync(chrome.profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    } catch { /* Chrome is slow to release its profile; a stale temp dir is not a failure */ }
  }

  console.log(JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 1);
}

main().catch((e) => { console.error(`cdp: ${e.message}`); process.exit(2); });
