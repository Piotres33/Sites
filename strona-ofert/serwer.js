#!/usr/bin/env node
/*
 * Lokalny serwer strony ofert: http://127.0.0.1:<port>/ (port z ..\konfiguracja.json).
 * Strona na żywo z plików oraz zmiany: ulubione, usuwanie do kosza, przywracanie.
 * Słucha tylko na tym komputerze. Uruchamia go otworz.vbs (skrót „Oferty do naprawy”).
 */
'use strict';

const http = require('http');
const os = require('os');
const CFG = require('../konfiguracja.js');
const STRONA = require('./strona.js');

const PORT = CFG.port;

function ipv4Number(ip) {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null;
  return (((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0);
}

function localSubnets() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const net of (list || [])) {
      if (net.family !== 'IPv4' || net.internal || !net.cidr) continue;
      const [address, prefixText] = net.cidr.split('/');
      const prefix = Number(prefixText);
      const ip = ipv4Number(address);
      if (ip == null || !Number.isInteger(prefix) || prefix < 1 || prefix > 32) continue;
      const mask = prefix === 32 ? 0xffffffff : (0xffffffff << (32 - prefix)) >>> 0;
      out.push({ ip, mask });
    }
  }
  return out;
}

function clientAllowed(req) {
  const remote = String(req.socket.remoteAddress || '').replace(/^::ffff:/i, '');
  if (remote === '127.0.0.1' || remote === '::1') return true;
  const ip = ipv4Number(remote);
  if (ip == null) return false;
  return localSubnets().some((s) => (ip & s.mask) === (s.ip & s.mask));
}

function hostAllowed(req) {
  const host = String(req.headers.host || '').toLowerCase();
  if (host === 'localhost:' + PORT || host === '127.0.0.1:' + PORT) return true;
  const match = host.match(/^((?:\d{1,3}\.){3}\d{1,3}):(\d+)$/);
  if (!match || Number(match[2]) !== PORT) return false;
  const hostIp = ipv4Number(match[1]);
  return hostIp != null && localSubnets().some((s) => hostIp === s.ip);
}

function send(res, code, body, type) {
  res.writeHead(code, {
    'content-type': type || 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer'
  });
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > 16 * 1024) { reject(new Error('za duże zapytanie')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); } catch (e) { reject(new Error('zły JSON')); }
    });
    req.on('error', reject);
  });
}

const ACTIONS = {
  '/api/ulubione': (b) => STRONA.setFavorite(b.id, !!b.wartosc),
  '/api/usun': (b) => STRONA.moveToBin(b.id),
  '/api/przywroc': (b) => STRONA.restore(b.id),
  '/api/usun-na-zawsze': (b) => STRONA.deleteForever(b.id)
};

const server = http.createServer(async (req, res) => {
  // tylko ten komputer i tylko ten adres (ochrona przed obcymi stronami w przeglądarce)
  if (!clientAllowed(req) || !hostAllowed(req)) return send(res, 403, { ok: false, error: 'dostęp tylko z sieci lokalnej' });
  const url = new URL(req.url, 'http://127.0.0.1');
  try {
    if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
      return send(res, 200, STRONA.html('serwer').page, 'text/html; charset=utf-8');
    }
    if (req.method === 'GET' && url.pathname === '/api/dane') {
      return send(res, 200, { ok: true, generated: new Date().toISOString(), offers: STRONA.collect() });
    }
    if (req.method === 'GET' && url.pathname === '/api/ping') return send(res, 200, { ok: true });
    if (req.method === 'POST' && ACTIONS[url.pathname]) {
      if (req.headers['x-oferty'] !== '1' || !/^application\/json/.test(req.headers['content-type'] || '')) {
        return send(res, 403, { ok: false, error: 'brak nagłówka strony' });
      }
      ACTIONS[url.pathname](await readBody(req));
      try { STRONA.build(); } catch (_) { /* plik podglądu odświeży się przy następnym raporcie */ }
      return send(res, 200, { ok: true });
    }
    send(res, 404, { ok: false, error: 'nie ma takiej strony' });
  } catch (e) {
    send(res, 400, { ok: false, error: e.message });
  }
});

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') { process.stdout.write('Serwer już działa na porcie ' + PORT + '\n'); process.exit(0); }
  throw e;
});
server.listen(PORT, '0.0.0.0', () => process.stdout.write('Strona ofert: http://127.0.0.1:' + PORT + '/ (LAN: http://<adres-komputera>:' + PORT + '/)\n'));
