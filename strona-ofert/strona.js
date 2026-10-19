#!/usr/bin/env node
/*
 * Strona ofert: zbiera pliki z <dane>\oferty\dane\<ID>\ i buduje <dane>\oferty\oferty.html (kafelki ze zdjęciami).
 *   szacownik.json – Adi (szacuj.cmd --zapisz <ID>)
 *   raport.json    – Andrzej (format: <dane>\oferty\FORMAT.md)
 *   odrzucona.json – Mietek ({ "id": "...", "powod": "..." })
 *   weryfikacja.json – Mietek: usterki i ostrzeżenia sprawdzone z opisem, poprawki do danych Adiego
 * <dane>\oferty\kosz\<ID>\ – oferty usunięte na stronie (do przywrócenia), <dane>\oferty\ulubione.json – ulubione.
 * <dane> – folder z ..\konfiguracja.json. Uruchomienie: odswiez.cmd
 */
'use strict';

const fs = require('fs');
const path = require('path');
const CFG = require('../konfiguracja.js');

const ROOT = CFG.oferty;
const DATA = path.join(ROOT, 'dane');
const BIN = path.join(ROOT, 'kosz');
const FAVS = path.join(ROOT, 'ulubione.json');
const OUT = path.join(ROOT, 'oferty.html');
const TEMPLATE = path.join(__dirname, 'szablon.html');
const FILES = { sz: 'szacownik.json', r: 'raport.json', odrz: 'odrzucona.json', wer: 'weryfikacja.json', del: 'usunieto.json' };
const ID_RE = /^[A-Za-z0-9_-]{3,80}$/;

function readJson(file) {
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, ''));
  } catch (e) {
    return { __error: path.basename(file) + ': ' + e.message };
  }
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2));
  fs.renameSync(tmp, file);
}

function favorites() {
  const f = readJson(FAVS);
  return new Set(f && Array.isArray(f.ids) ? f.ids : []);
}

function readDir(base, inBin, favs) {
  if (!fs.existsSync(base)) return [];
  const out = [];
  for (const d of fs.readdirSync(base, { withFileTypes: true })) {
    if (!d.isDirectory() || !ID_RE.test(d.name)) continue;
    const dir = path.join(base, d.name);
    const o = { id: d.name, updated: null, ulubione: favs.has(d.name), kosz: inBin };
    let latest = 0;
    for (const [k, f] of Object.entries(FILES)) {
      const file = path.join(dir, f);
      o[k] = readJson(file);
      if (o[k] && k !== 'del') latest = Math.max(latest, fs.statSync(file).mtimeMs);
    }
    if (!o.sz && !o.r && !o.odrz) continue;
    o.updated = new Date(latest).toISOString();
    out.push(o);
  }
  return out;
}

function collect() {
  const favs = favorites();
  return readDir(DATA, false, favs).concat(readDir(BIN, true, favs));
}

function errorsOf(offers) {
  return offers.flatMap((o) => Object.keys(FILES).filter((k) => o[k] && o[k].__error).map((k) => o.id + ' – ' + o[k].__error));
}

/** Strona z danymi w środku. tryb: 'plik' (tylko podgląd) albo 'serwer' (ulubione, usuwanie). */
function html(tryb) {
  const offers = collect();
  const json = JSON.stringify({ generated: new Date().toISOString(), offers })
    .replace(/</g, '\\u003c').split(String.fromCharCode(0x2028)).join('\\u2028').split(String.fromCharCode(0x2029)).join('\\u2029');
  const page = fs.readFileSync(TEMPLATE, 'utf8')
    .replace('/*__DANE__*/null', () => json)
    .replace('/*__TRYB__*/"plik"', () => JSON.stringify(tryb === 'serwer' ? 'serwer' : 'plik'));
  return { page, offers };
}

function build() {
  const { page, offers } = html('plik');
  fs.mkdirSync(ROOT, { recursive: true });
  const tmp = OUT + '.tmp';
  fs.writeFileSync(tmp, page);
  fs.renameSync(tmp, OUT);
  return { file: OUT, count: offers.filter((o) => !o.kosz).length, errors: errorsOf(offers) };
}

// ---------------------------------------------------------------------------
// Zmiany ze strony (wywołuje serwer.js)
// ---------------------------------------------------------------------------
function checkId(id) {
  if (!ID_RE.test(String(id || ''))) throw new Error('nieprawidłowe ID');
  return String(id);
}

function setFavorite(id, on) {
  checkId(id);
  const favs = favorites();
  if (on) favs.add(id); else favs.delete(id);
  writeJson(FAVS, { ids: [...favs].sort() });
}

function moveToBin(id) {
  checkId(id);
  const from = path.join(DATA, id);
  if (!fs.existsSync(from)) throw new Error('nie ma takiej oferty');
  const to = path.join(BIN, id);
  fs.mkdirSync(BIN, { recursive: true });
  if (fs.existsSync(to)) fs.rmSync(to, { recursive: true, force: true }); // starsza usunięta kopia tej samej oferty
  fs.renameSync(from, to);
  writeJson(path.join(to, FILES.del), { usunieto: new Date().toISOString() });
}

function restore(id) {
  checkId(id);
  const from = path.join(BIN, id);
  const to = path.join(DATA, id);
  if (!fs.existsSync(from)) throw new Error('nie ma tej oferty w koszu');
  if (fs.existsSync(to)) throw new Error('oferta o tym ID już jest na liście');
  fs.rmSync(path.join(from, FILES.del), { force: true });
  fs.renameSync(from, to);
}

function deleteForever(id) {
  checkId(id);
  const dir = path.join(BIN, id);
  if (!fs.existsSync(dir)) throw new Error('nie ma tej oferty w koszu');
  fs.rmSync(dir, { recursive: true, force: true });
  setFavorite(id, false);
}

module.exports = { build, html, collect, setFavorite, moveToBin, restore, deleteForever, ROOT };

if (require.main === module) {
  const r = build();
  process.stdout.write('Strona ofert odświeżona: ' + r.file + ' (ofert: ' + r.count + ')\n');
  if (r.errors.length) {
    process.stdout.write('Błędy w plikach:\n- ' + r.errors.join('\n- ') + '\n');
    process.exitCode = 1;
  }
}
