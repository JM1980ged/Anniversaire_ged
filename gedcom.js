// Lecture d'un fichier GEDCOM (.ged) et calcul des anniversaires.
// Aucune dépendance : fonctionne tel quel avec Hermes / React Native.

const MONTHS = {
  JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6,
  JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12,
};
const DAYS_IN_MONTH = [0, 31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

// Une personne sans date de décès mais née il y a plus de MAX_AGE ans
// est considérée comme décédée.
export const MAX_AGE = 110;

/* ------------------------------------------------------------------ */
/* Décodage des octets (UTF-8, UTF-16, ou ANSI/Latin-1 en secours)     */
/* ------------------------------------------------------------------ */

function fromCodes(codes) {
  const out = [];
  for (let i = 0; i < codes.length; i += 8000) {
    out.push(String.fromCharCode.apply(null, codes.slice(i, i + 8000)));
  }
  return out.join('');
}

function decodeUtf8(b, start) {
  const codes = [];
  let i = start;
  while (i < b.length) {
    const c = b[i];
    let cp;
    if (c < 0x80) {
      cp = c;
      i += 1;
    } else if (c >= 0xc2 && c <= 0xdf) {
      if (i + 1 >= b.length || (b[i + 1] & 0xc0) !== 0x80) return null;
      cp = ((c & 0x1f) << 6) | (b[i + 1] & 0x3f);
      i += 2;
    } else if (c >= 0xe0 && c <= 0xef) {
      if (i + 2 >= b.length || (b[i + 1] & 0xc0) !== 0x80 || (b[i + 2] & 0xc0) !== 0x80) return null;
      cp = ((c & 0x0f) << 12) | ((b[i + 1] & 0x3f) << 6) | (b[i + 2] & 0x3f);
      i += 3;
    } else if (c >= 0xf0 && c <= 0xf4) {
      if (
        i + 3 >= b.length ||
        (b[i + 1] & 0xc0) !== 0x80 ||
        (b[i + 2] & 0xc0) !== 0x80 ||
        (b[i + 3] & 0xc0) !== 0x80
      ) return null;
      cp = ((c & 0x07) << 18) | ((b[i + 1] & 0x3f) << 12) | ((b[i + 2] & 0x3f) << 6) | (b[i + 3] & 0x3f);
      i += 4;
    } else {
      return null;
    }
    if (cp > 0xffff) {
      cp -= 0x10000;
      codes.push(0xd800 + (cp >> 10), 0xdc00 + (cp & 0x3ff));
    } else {
      codes.push(cp);
    }
  }
  return fromCodes(codes);
}

function decodeUtf16(b, littleEndian) {
  const codes = [];
  for (let i = 2; i + 1 < b.length; i += 2) {
    codes.push(littleEndian ? b[i] | (b[i + 1] << 8) : (b[i] << 8) | b[i + 1]);
  }
  return fromCodes(codes);
}

export function decodeBytes(bytes) {
  const b = bytes;
  if (b.length >= 3 && b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf) {
    return decodeUtf8(b, 3) ?? fromCodes(Array.from(b));
  }
  if (b.length >= 2 && b[0] === 0xff && b[1] === 0xfe) return decodeUtf16(b, true);
  if (b.length >= 2 && b[0] === 0xfe && b[1] === 0xff) return decodeUtf16(b, false);
  const utf8 = decodeUtf8(b, 0);
  if (utf8 !== null) return utf8;
  // Fichier "ANSI" (Windows-1252 / Latin-1), fréquent dans les anciens logiciels
  return fromCodes(Array.from(b));
}

/* ------------------------------------------------------------------ */
/* Analyse du GEDCOM                                                   */
/* ------------------------------------------------------------------ */

// Ne conserve que les dates complètes (jour + mois). L'année est facultative.
// Les dates approximatives (ABT, EST, BEF, AFT, BET...) sont ignorées.
function parseDate(value) {
  if (!value) return null;
  const s = value.toUpperCase().replace(/@#[^@]*@/g, ' ').trim();
  if (/^(ABT|ABOUT|EST|CAL|BEF|AFT|BET|FROM|TO|INT)\b/.test(s)) return null;
  const m = s.match(/^(\d{1,2})\s+([A-Z]{3})\s*(?:(\d{3,4})(?:\/\d+)?)?$/);
  if (!m) return null;
  const day = parseInt(m[1], 10);
  const month = MONTHS[m[2]];
  if (!month || day < 1 || day > DAYS_IN_MONTH[month]) return null;
  return { day, month, year: m[3] ? parseInt(m[3], 10) : null };
}

function cleanName(v) {
  return (v || '').replace(/\//g, ' ').replace(/\s+/g, ' ').trim();
}

const LINE = /^\s*(\d+)\s+(?:@[^@]*@\s+)?([A-Za-z0-9_]+)(?:\s(.*))?$/;

export function parseGedcom(text, now = new Date()) {
  const thisYear = now.getFullYear();
  const lines = text.replace(/^﻿/, '').split(/\r\n|\n|\r/);
  const people = [];
  const stats = { total: 0, dead: 0, noBirth: 0, tooOld: 0, living: 0 };

  let cur = null;
  let lvl1 = null;

  const finish = () => {
    if (!cur) return;
    stats.total += 1;
    if (cur.dead) { stats.dead += 1; return; }
    if (!cur.birth) { stats.noBirth += 1; return; }
    if (cur.birth.year && thisYear - cur.birth.year > MAX_AGE) { stats.tooOld += 1; return; }
    const name = cur.name || cleanName(`${cur.given} ${cur.surn}`) || 'Sans nom';
    people.push({ name, day: cur.birth.day, month: cur.birth.month, year: cur.birth.year });
    stats.living += 1;
  };

  for (const raw of lines) {
    const m = LINE.exec(raw);
    if (!m) continue;
    const level = parseInt(m[1], 10);
    const tag = m[2].toUpperCase();
    const value = m[3];

    if (level === 0) {
      finish();
      cur = tag === 'INDI' ? { name: '', given: '', surn: '', nameCount: 0, birth: null, dead: false } : null;
      lvl1 = null;
      continue;
    }
    if (!cur) continue;

    if (level === 1) {
      lvl1 = tag;
      if (tag === 'NAME') {
        cur.nameCount += 1;
        if (cur.nameCount === 1) cur.name = cleanName(value);
      } else if (tag === 'DEAT' || tag === 'BURI' || tag === 'CREM') {
        if (!(tag === 'DEAT' && (value || '').trim().toUpperCase() === 'N')) cur.dead = true;
      }
    } else if (level === 2) {
      if (lvl1 === 'BIRT' && tag === 'DATE' && !cur.birth) {
        cur.birth = parseDate(value);
      } else if (lvl1 === 'NAME' && cur.nameCount === 1) {
        if (tag === 'GIVN') cur.given = cleanName(value);
        else if (tag === 'SURN') cur.surn = cleanName(value);
      }
    }
  }
  finish();

  return { people, stats };
}

/* ------------------------------------------------------------------ */
/* Anniversaires                                                       */
/* ------------------------------------------------------------------ */

function isLeap(y) {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

// Personnes (vivantes) dont c'est l'anniversaire à la date donnée.
// Les nés un 29 février sont fêtés le 28 février les années non bissextiles.
export function birthdaysOn(people, date) {
  const m = date.getMonth() + 1;
  const d = date.getDate();
  const y = date.getFullYear();
  const leap = isLeap(y);
  const out = [];
  for (const p of people) {
    const sameDay =
      (p.month === m && p.day === d) ||
      (p.month === 2 && p.day === 29 && !leap && m === 2 && d === 28);
    if (!sameDay) continue;
    const age = p.year ? y - p.year : null;
    if (age !== null && (age < 0 || age > MAX_AGE)) continue;
    out.push({ name: p.name, age });
  }
  out.sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  return out;
}

export function ageText(age) {
  if (age === null || age === undefined) return 'âge inconnu';
  return `${age} an${age > 1 ? 's' : ''}`;
}

// Prochains anniversaires (hors aujourd'hui) sur `days` jours.
export function upcomingBirthdays(people, from, days = 30, max = 15) {
  const out = [];
  for (let i = 1; i <= days && out.length < max; i += 1) {
    const d = new Date(from.getFullYear(), from.getMonth(), from.getDate() + i);
    for (const b of birthdaysOn(people, d)) {
      out.push({ date: d, ...b });
    }
  }
  return out.slice(0, max);
}

// Format compact pour le stockage local
export const packPeople = (people) => people.map((p) => [p.name, p.day, p.month, p.year || 0]);
export const unpackPeople = (rows) =>
  rows.map(([name, day, month, year]) => ({ name, day, month, year: year || null }));
