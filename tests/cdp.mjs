// Minimal CDP driver over Node's built-in WebSocket (no Puppeteer).
// Chrome here is a custom build; Puppeteer's navigation hit LNA checks and its
// --screenshot path writes nothing, so this talks CDP directly.
//
// LNA quirk found the hard way: navigating an EXISTING tab to a localhost URL
// is blocked (ERR_BLOCKED_BY_LOCAL_NETWORK_ACCESS_CHECKS) because the previous
// document counts as a public initiator. A FRESH tab whose first navigation is
// the game URL loads fine. So every page here is opened with Target.createTarget.
import fs from 'node:fs';

const DEBUG_PORT = process.env.CDP_PORT || 9226;

function makeSession(ws) {
  let id = 0;
  const pending = new Map();
  const events = [];
  ws.onmessage = (msg) => {
    const data = JSON.parse(msg.data);
    if (data.id && pending.has(data.id)) {
      const { resolve, reject } = pending.get(data.id);
      pending.delete(data.id);
      if (data.error) reject(new Error(JSON.stringify(data.error)));
      else resolve(data.result);
    } else if (data.method) {
      events.push(data);
    }
  };
  async function send(method, params = {}) {
    const mid = ++id;
    ws.send(JSON.stringify({ id: mid, method, params }));
    return new Promise((resolve, reject) => pending.set(mid, { resolve, reject }));
  }
  return {
    send,
    events,
    async enable() {
      await send('Page.enable');
      await send('Runtime.enable');
      await send('Log.enable');
      await send('Network.enable');
      // No device-metrics override here: the browser is launched with
      // --window-size=1280,720, and overriding metrics after the page starts
      // loading fires a resize that clears a just-painted canvas.
    },
    async waitFor(fnSource, timeoutMs = 30000) {
      const start = Date.now();
      for (;;) {
        try {
          const r = await send('Runtime.evaluate', { expression: fnSource, returnByValue: true });
          if (r.result?.value === true) return true;
        } catch { /* target may still be loading */ }
        if (Date.now() - start > timeoutMs) throw new Error('timeout waiting for: ' + fnSource);
        await new Promise((r2) => setTimeout(r2, 200));
      }
    },
    async eval(expression) {
      const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) throw new Error('page eval failed: ' + JSON.stringify(r.exceptionDetails).slice(0, 500));
      return r.result?.value;
    },
    async screenshot(path, quality = 88) {
      const r = await send('Page.captureScreenshot', { format: 'jpeg', quality });
      fs.writeFileSync(path, Buffer.from(r.data, 'base64'));
      return fs.statSync(path).size;
    },
    async key(type, code, key) {
      // No windowsVirtualKeyCode: the game reads event.code only, and the
      // virtual-key param has been rejected as malformed by this build.
      await send('Input.dispatchKeyEvent', { type, code, key });
    },
    async press(code, key) {
      await this.key('keyDown', code, key);
      await this.key('keyUp', code, key);
    },
    async holdKey(code, key, ms) {
      await this.key('keyDown', code, key);
      await new Promise((r) => setTimeout(r, ms));
      await this.key('keyUp', code, key);
    },
    async click(x, y) {
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
    },
    consoleErrors() {
      return events
        .filter((e) => (e.method === 'Log.entryAdded' && e.params.entry.level === 'error') || (e.method === 'Runtime.exceptionThrown'))
        .map((e) => JSON.stringify(e.params).slice(0, 400));
    },
    failedRequests() {
      return events
        .filter((e) => e.method === 'Network.loadingFailed')
        .map((e) => JSON.stringify(e.params).slice(0, 300));
    },
    externalRequests(base) {
      return events
        .filter((e) => e.method === 'Network.requestWillBeSent')
        .map((e) => e.params.request.url)
        .filter((u) => !u.startsWith(base) && !u.startsWith('data:') && !u.startsWith('blob:') && !u.startsWith('chrome:'));
    },
    close() { ws.close(); },
  };
}

async function connectWs(url) {
  const ws = new WebSocket(url);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = (e) => reject(new Error('ws error ' + e.message));
  });
  return ws;
}

export async function connectCDP() {
  const list = await (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`)).json();
  const page = list.find((t) => t.type === 'page');
  if (!page) throw new Error('no page target');
  const ws = await connectWs(page.webSocketDebuggerUrl);
  const session = makeSession(ws);
  return {
    ...session,
    /** Open the URL in a FRESH tab (its first navigation) and return a session for it. */
    async openTab(url) {
      const t = await session.send('Target.createTarget', { url });
      // Find the new target's debugger URL.
      let target = null;
      for (let i = 0; i < 30; i += 1) {
        const l = await (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`)).json();
        target = l.find((x) => x.id === t.targetId);
        if (target) break;
        await new Promise((r) => setTimeout(r, 200));
      }
      if (!target) throw new Error('new target never appeared');
      const tabWs = await connectWs(target.webSocketDebuggerUrl);
      const tab = makeSession(tabWs);
      await tab.enable();
      return tab;
    },
    async closeTarget(targetId) {
      await session.send('Target.closeTarget', { targetId });
    },
  };
}
