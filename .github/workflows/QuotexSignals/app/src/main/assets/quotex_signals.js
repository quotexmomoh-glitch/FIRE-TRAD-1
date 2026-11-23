/*
 * quotex_f12_signals_v6_2.js  -  à coller dans F12 > Console sur https://quotex.com/en/demo-trade
 *
 * v6.2 = v6.1 + DÉTECTION AUTOMATIQUE DES BOUTONS BUY / SELL (CALL / PUT) pour l'exécution sur le terminal graphique
 *   - scan du DOM : score par texte (Up/Call/Buy/Haut...), classe CSS, COULEUR de fond (vert/rouge), curseur, position
 *   - mémorisation des boutons trouvés (re-scan si la page est re-rendue)
 *   - garde-fou : clic automatique UNIQUEMENT si l'URL contient "demo" (S.demoOnly = true)
 *   - boutons du panneau : « Détecter » (entoure en magenta) et « Test CALL/PUT » ; Auto-exec OFF par défaut
 *   - tout le reste de v6.1 est conservé (34 stratégies, 3 votes, Telegram, voix, maj auto 120 s, horloge serveur)
 *
 * Commandes boutons : __qxSig.detectButtons()            -> tableau console + contour magenta des candidats
 *                     __qxSig.setButtons('SEL_VERT','SEL_ROUGE') -> forcer les sélecteurs CSS (prioritaires)
 *                     __qxSig.testClick('CALL'|'PUT')    -> clique 1 fois pour tester (démo uniquement)
 *                     __qxSig.clearOutline() | __qxSig.setDemoOnly(true|false) | __qxSig.setAutoTrade(true|false)
 * Commandes : __qxSig.setTelegram('BOT_TOKEN', 'CHAT_ID') | __qxSig.tgTest() | __qxSig.tgToggle(true|false)
 *             __qxSig.stop() | setTF(300) | autoTF() | setAsset('EURUSD_otc') | setExp('1m'|'5m'|'auto') | run()
 *             __qxSig.setRefresh(120) | __qxSig.setRefresh(120, false) (désactiver) | __qxSig.refreshNow()
 *             __qxSig.setOpacity(0.28) | __qxSig.center() | __qxSig.clickThrough(true)
 *             __qxSig.only([2,9,46]) (limiter les stratégies) | __qxSig.only() (toutes)
 *             __qxSig.voiceToggle(true|false) | voiceTest() | setVoice('fr-FR', 1, 1) | voices() | beepToggle(true|false)
 *             __qxSig.cfg.cooldown = 3 | __qxSig.cfg.minVotes = 3
 */
(() => {
  if (window.__qxSig) { console.log('[qxSig] déjà actif (faites __qxSig.stop() avant de recoller)'); return; }

  const VALID_TF = [5, 10, 15, 30, 60, 120, 180, 300, 600, 900, 1800, 3600, 7200, 14400, 86400];
  const S = window.__qxSig = {
    TF: 60, tfAuto: true, expMode: 'auto', MAXTICKS: 150000, MAXC: 1500,
    opacity: 0.28, blurPx: 2, isClickThrough: true,
    _expOverrides: {},
    autoTrade: false, demoOnly: true, callSelector: null, putSelector: null, _btnCache: {}, _outlined: [], _trades: [], _tradeSent: {},
    tgEnabled: true, tgToken: '', tgChatId: '', tgProxyUrl: 'https://ais-dev-ybxsmoba7oqi7gceluf5m4-258496288695.europe-west1.run.app', tgSendIndividual: false, _tgSent: {},
    _srvOffsetMs: 0, _lastLiveTs: 0, _srvSynced: false,
    autoRefresh: true, refreshEverySec: 120, _lastRefreshMs: 0, _nextRefreshMs: 0,
    voiceEnabled: true, beepEnabled: true, voiceLang: 'fr-FR', voiceRate: 1, voiceVolume: 1, _voiceSent: {},
    cfg: { minVotes: 3, cooldown: 3,
      stoOS: 20, stoOB: 80, obMinPips: 5, obSlopePips: 3, tunnelLvl: 15, atrMin: 0.002,
      stP: 10, stM: 3, adxMin: 20, rsi2Lo: 10, rsi2Hi: 90, donN: 20, donAdx: 25,
      pbRsi: 45, pbZone: 0.5, bmcLook: 20, bmcEma: 200, bmcBuf: 10, bmcSL: 20, bmcRR: 2 },
    ticks: {}, hist: {}, needSort: {}, active: null, lock: null, _only: null,
    raw: [], last: null, cool: {}, _proc: {}, _confCache: {}, _gotOpenTick: {},
  };
  const C = S.cfg;

  // ================================================================ indicateurs (tableaux)
  const nan = n => new Array(n).fill(NaN);
  const fin = Number.isFinite;
  const roll = (a, n, f) => { const o = nan(a.length); for (let i = n - 1; i < a.length; i++) { let ok = true; for (let j = i - n + 1; j <= i; j++) if (!fin(a[j])) { ok = false; break; } if (ok) o[i] = f(a, i); } return o; };
  const SMA = (a, n) => roll(a, n, (a, i) => { let s = 0; for (let j = i - n + 1; j <= i; j++) s += a[j]; return s / n; });
  const LWMA = (a, n) => roll(a, n, (a, i) => { let s = 0; for (let j = 0; j < n; j++) s += a[i - n + 1 + j] * (j + 1); return s / (n * (n + 1) / 2); });
  const EMA = (a, n) => { const k = 2 / (n + 1), o = nan(a.length); let p = NaN, c = 0; for (let i = 0; i < a.length; i++) { if (!fin(a[i])) continue; p = fin(p) ? a[i] * k + p * (1 - k) : a[i]; if (++c >= n) o[i] = p; } return o; };
  const SMMA = (a, n) => { const o = nan(a.length); let p = NaN; for (let i = n - 1; i < a.length; i++) { if (i === n - 1) { let s = 0; for (let j = 0; j < n; j++) s += a[j]; p = s / n; } else p = (p * (n - 1) + a[i]) / n; o[i] = p; } return o; };
  const wild = (a, n) => { const o = nan(a.length); let p = NaN; for (let i = 0; i < a.length; i++) { if (!fin(a[i])) continue; p = fin(p) ? p + (a[i] - p) / n : a[i]; if (i >= n - 1) o[i] = p; } return o; };
  const RSI = (c, n) => { const u = nan(c.length), d = nan(c.length); for (let i = 1; i < c.length; i++) { const x = c[i] - c[i - 1]; u[i] = Math.max(x, 0); d[i] = Math.max(-x, 0); } const U = wild(u, n), Dn = wild(d, n); return c.map((_, i) => !fin(U[i]) ? NaN : Dn[i] === 0 ? 100 : 100 - 100 / (1 + U[i] / Dn[i])); };
  const SAR = (h, l, st, mx) => {
    const n = h.length, o = nan(n); if (n < 2) return o; let bull = true, ep = h[0], af = st, s = l[0]; o[0] = s;
    for (let i = 1; i < n; i++) {
      s = s + af * (ep - s);
      if (bull) { s = Math.min(s, l[i - 1], i > 1 ? l[i - 2] : l[i - 1]); if (l[i] < s) { bull = false; s = ep; ep = l[i]; af = st; } else if (h[i] > ep) { ep = h[i]; af = Math.min(af + st, mx); } }
      else { s = Math.max(s, h[i - 1], i > 1 ? h[i - 2] : h[i - 1]); if (h[i] > s) { bull = true; s = ep; ep = h[i]; af = st; } else if (l[i] < ep) { ep = l[i]; af = Math.min(af + st, mx); } }
      o[i] = s;
    }
    return o;
  };

  // contexte : indicateurs calculés une seule fois par série de bougies (mémoïsation)
  function mkCtx(cs, pip) {
    const D = { n: cs.length, pip, _: {} };
    D.o = cs.map(x => x.o); D.h = cs.map(x => x.h); D.l = cs.map(x => x.l); D.c = cs.map(x => x.c);
    D.tp = cs.map(x => (x.h + x.l + x.c) / 3);
    const m = (k, f) => D._[k] || (D._[k] = f());
    D.src = s => D[s];
    D.sma = (n, s = 'c') => m('sma' + n + s, () => SMA(D[s], n));
    D.ema = (n, s = 'c') => m('ema' + n + s, () => EMA(D[s], n));
    D.lwma = (n, s = 'c') => m('lw' + n + s, () => LWMA(D[s], n));
    D.smma = (n, s = 'c') => m('sm' + n + s, () => SMMA(D[s], n));
    D.smaOn = (key, a, n) => m('so' + key + n, () => SMA(a, n));
    D.rsi = n => m('rsi' + n, () => RSI(D.c, n));
    D.mom = n => m('mom' + n, () => D.c.map((x, i) => i < n ? NaN : 100 * x / D.c[i - n]));
    D.atr = n => m('atr' + n, () => { const tr = D.c.map((_, i) => i === 0 ? D.h[0] - D.l[0] : Math.max(D.h[i] - D.l[i], Math.abs(D.h[i] - D.c[i - 1]), Math.abs(D.l[i] - D.c[i - 1]))); return SMA(tr, n); });
    D.adx = n => m('adx' + n, () => {
      const N = D.n, pdm = nan(N), mdm = nan(N), tr = nan(N);
      for (let i = 1; i < N; i++) { const up = D.h[i] - D.h[i - 1], dn = D.l[i - 1] - D.l[i]; pdm[i] = up > dn && up > 0 ? up : 0; mdm[i] = dn > up && dn > 0 ? dn : 0; tr[i] = Math.max(D.h[i] - D.l[i], Math.abs(D.h[i] - D.c[i - 1]), Math.abs(D.l[i] - D.c[i - 1])); }
      const A = wild(tr, n), P = wild(pdm, n), M = wild(mdm, n);
      const pdi = A.map((a, i) => 100 * P[i] / a), mdi = A.map((a, i) => 100 * M[i] / a);
      const dx = pdi.map((p, i) => 100 * Math.abs(p - mdi[i]) / (p + mdi[i]));
      return { adx: wild(dx, n).map((x, i) => i < 2 * n - 2 ? NaN : x), pdi, mdi };
    });
    D.macd = (f, s, g) => m('macd' + f + s + g, () => { const e1 = D.ema(f), e2 = D.ema(s), main = e1.map((x, i) => x - e2[i]); return { m: main, s: SMA(main, g) }; });
    D.sto = (kp, dp, sl, method, cc) => m('sto' + [kp, dp, sl, method, cc], () => {
      const H = cc ? D.c : D.h, L = cc ? D.c : D.l, N = D.n, num = nan(N), den = nan(N);
      for (let i = kp - 1; i < N; i++) { let hh = -Infinity, ll = Infinity; for (let j = i - kp + 1; j <= i; j++) { hh = Math.max(hh, H[j]); ll = Math.min(ll, L[j]); } num[i] = D.c[i] - ll; den[i] = hh - ll; }
      const sn = SMA(num, sl), sd = SMA(den, sl), K = sn.map((x, i) => sd[i] === 0 ? NaN : 100 * x / sd[i]);
      return { k: K, d: method === 'lwma' ? LWMA(K, dp) : SMA(K, dp) };
    });
    D.bb = (n, dev) => m('bb' + n + dev, () => { const mid = D.sma(n), sd = roll(D.c, n, (a, i) => { let s = 0; for (let j = i - n + 1; j <= i; j++) s += (a[j] - mid[i]) ** 2; return Math.sqrt(s / n); }); return { mid, lo: mid.map((x, i) => x - dev * sd[i]), up: mid.map((x, i) => x + dev * sd[i]) }; });
    D.cci = n => m('cci' + n, () => { const sm = SMA(D.tp, n); return roll(D.tp, n, (a, i) => { let md = 0; for (let j = i - n + 1; j <= i; j++) md += Math.abs(a[j] - sm[i]); md /= n; return md === 0 ? 0 : (a[i] - sm[i]) / (0.015 * md); }); });
    D.wpr = n => m('wpr' + n, () => roll(D.c, n, (a, i) => { let hh = -Infinity, ll = Infinity; for (let j = i - n + 1; j <= i; j++) { hh = Math.max(hh, D.h[j]); ll = Math.min(ll, D.l[j]); } return hh === ll ? NaN : -100 * (hh - a[i]) / (hh - ll); }));
    D.std = n => m('std' + n, () => roll(D.c, n, (a, i) => { let s = 0, mu = 0; for (let j = i - n + 1; j <= i; j++) mu += a[j]; mu /= n; for (let j = i - n + 1; j <= i; j++) s += (a[j] - mu) ** 2; return Math.sqrt(s / n); }));
    D.rvi = n => m('rvi' + n, () => {
      const N = D.n, nu = nan(N), de = nan(N), f = (x, y, i) => (x[i] - y[i] + 2 * (x[i - 1] - y[i - 1]) + 2 * (x[i - 2] - y[i - 2]) + (x[i - 3] - y[i - 3])) / 6;
      for (let i = 3; i < N; i++) { nu[i] = f(D.c, D.o, i); de[i] = f(D.h, D.l, i); }
      const a = SMA(nu, n), b = SMA(de, n), v = a.map((x, i) => x / b[i]);
      const s = v.map((_, i) => i < 3 ? NaN : (v[i] + 2 * v[i - 1] + 2 * v[i - 2] + v[i - 3]) / 6);
      return { v, s };
    });
    D.sar = (st, mx) => m('sar' + st + mx, () => SAR(D.h, D.l, st, mx));
    D.ha = () => m('ha', () => { const N = D.n, hc = nan(N), ho = nan(N); for (let i = 0; i < N; i++) { hc[i] = (D.o[i] + D.h[i] + D.l[i] + D.c[i]) / 4; ho[i] = i === 0 ? (D.o[0] + D.c[0]) / 2 : (ho[i - 1] + hc[i - 1]) / 2; } return hc.map((x, i) => x > ho[i] ? 1 : x < ho[i] ? -1 : 0); });
    D.st = (p, mult) => m('st' + p + mult, () => {
      const atr = D.atr(p), N = D.n, dir = nan(N); let fub = 0, flb = 0, d = 1, started = false;
      for (let i = 0; i < N; i++) {
        if (!fin(atr[i])) continue; const hl2 = (D.h[i] + D.l[i]) / 2, ub = hl2 + mult * atr[i], lb = hl2 - mult * atr[i];
        if (!started) { fub = ub; flb = lb; d = D.c[i] >= hl2 ? 1 : -1; started = true; dir[i] = d; continue; }
        const pc = D.c[i - 1], nub = (ub < fub || pc > fub) ? ub : fub, nlb = (lb > flb || pc < flb) ? lb : flb; fub = nub; flb = nlb;
        if (d < 0 && D.c[i] > fub) d = 1; else if (d > 0 && D.c[i] < flb) d = -1; dir[i] = d;
      }
      return dir;
    });
    return D;
  }
  const bad = (...v) => v.some(x => !fin(x));
  const minOf = (a, i, k0, k1) => { let r = Infinity; for (let k = k0; k <= k1; k++) r = Math.min(r, a[i - k]); return r; };
  const maxOf = (a, i, k0, k1) => { let r = -Infinity; for (let k = k0; k <= k1; k++) r = Math.max(r, a[i - k]); return r; };
  const anyK = (k0, k1, f) => { for (let k = k0; k <= k1; k++) if (f(k)) return true; return false; };

  // ================================================================ stratégies : état +1/-1/0 à l'indice i
  const STR = {
    2: ['Sidus (EMA/WMA)', (D, i) => {
      const e18 = D.ema(18), e28 = D.ema(28), w5 = D.lwma(5), w8 = D.lwma(8);
      if (bad(e18[i], e28[i], e18[i - 1], e28[i - 1], w5[i], w8[i], w5[i - 1], w8[i - 1])) return 0;
      const hi0 = Math.max(e18[i], e28[i]), lo0 = Math.min(e18[i], e28[i]), hi1 = Math.max(e18[i - 1], e28[i - 1]), lo1 = Math.min(e18[i - 1], e28[i - 1]);
      const upN = w5[i] > hi0 && w8[i] > hi0, upP = w5[i - 1] > hi1 && w8[i - 1] > hi1, dnN = w5[i] < lo0 && w8[i] < lo0, dnP = w5[i - 1] < lo1 && w8[i - 1] < lo1;
      return upN && !upP ? 1 : dnN && !dnP ? -1 : 0;
    }],
    3: ['Puria (MA + EMA5 + MACD)', (D, i) => {
      const e = D.ema(5), a = D.lwma(75, 'l'), b = D.lwma(85, 'l'), m = D.macd(15, 26, 1).m;
      if (bad(e[i], e[i - 1], a[i], a[i - 1], b[i], b[i - 1], m[i], m[i - 1], m[i - 2])) return 0;
      const hi0 = Math.max(a[i], b[i]), lo0 = Math.min(a[i], b[i]), hi1 = Math.max(a[i - 1], b[i - 1]), lo1 = Math.min(a[i - 1], b[i - 1]);
      if (e[i] > hi0 && e[i - 1] <= hi1 && (m[i] > 0 || m[i - 1] > 0 || m[i - 2] > 0)) return 1;
      if (e[i] < lo0 && e[i - 1] >= lo1 && (m[i] < 0 || m[i - 1] < 0 || m[i - 2] < 0)) return -1; return 0;
    }],
    5: ['Momentum de l\'aîné', (D, i) => {
      const e = D.ema(19), mo = D.mom(18), c = D.c; if (bad(e[i], mo[i], mo[i - 1])) return 0;
      return c[i] > e[i] && mo[i] > 100 && mo[i - 1] <= 100 ? 1 : c[i] < e[i] && mo[i] < 100 && mo[i - 1] >= 100 ? -1 : 0;
    }],
    6: ['Saint Graal (EMA20 + ADX)', (D, i) => {
      const e = D.ema(20), ax = D.adx(14).adx, c = D.c; if (bad(e[i], e[i - 3], ax[i], e[i - 3])) return 0;
      const below = anyK(1, 3, k => c[i - k] < e[i - k]), above = anyK(1, 3, k => c[i - k] > e[i - k]);
      return ax[i] > 30 && e[i] > e[i - 3] && c[i] > e[i] && below ? 1 : ax[i] > 30 && e[i] < e[i - 3] && c[i] < e[i] && above ? -1 : 0;
    }],
    8: ['Outside Bar', (D, i) => {
      const e = D.ema(9), pip = D.pip, h = D.h, l = D.l, c = D.c; if (bad(e[i], e[i - 5])) return 0;
      if (!(h[i] > h[i - 1] && l[i] < l[i - 1])) return 0;
      if (c[i] > h[i - 1] && l[i] > e[i] && (l[i] - e[i]) >= C.obMinPips * pip && (e[i] - e[i - 5]) >= C.obSlopePips * pip) return 1;
      if (c[i] < l[i - 1] && h[i] < e[i] && (e[i] - h[i]) >= C.obMinPips * pip && (e[i - 5] - e[i]) >= C.obSlopePips * pip) return -1; return 0;
    }],
    9: ['Stochastique + Bollinger', (D, i) => {
      const s = D.sto(5, 3, 3, 'sma', false), b = D.bb(20, 2), k = s.k, d = s.d, c = D.c; if (bad(k[i], k[i - 1], d[i], d[i - 1])) return 0;
      const cu = k[i] > d[i] && k[i - 1] <= d[i - 1], cd = k[i] < d[i] && k[i - 1] >= d[i - 1]; if (!cu && !cd) return 0;
      const tl = anyK(0, 2, j => D.l[i - j] <= b.lo[i - j]), tu = anyK(0, 2, j => D.h[i - j] >= b.up[i - j]);
      if (cu && Math.min(k[i - 1], d[i - 1]) <= C.stoOS && tl && c[i] > c[i - 1]) return 1;
      if (cd && Math.max(k[i - 1], d[i - 1]) >= C.stoOB && tu && c[i] < c[i - 1]) return -1; return 0;
    }],
    10: ['Kit universel (BB + RSI + ADX)', (D, i) => {
      const b = D.bb(20, 2), r = D.rsi(7), ax = D.adx(14).adx, c = D.c; if (bad(r[i], r[i - 1], r[i - 2], ax[i], b.lo[i], b.lo[i - 2])) return 0;
      const rmin = minOf(r, i, 0, 2), rmax = maxOf(r, i, 0, 2), tl = anyK(0, 2, j => D.l[i - j] <= b.lo[i - j]), tu = anyK(0, 2, j => D.h[i - j] >= b.up[i - j]);
      if (tl && c[i] > c[i - 1] && rmin <= 30 && r[i] > r[i - 1] && ax[i] <= 32) return 1;
      if (tu && c[i] < c[i - 1] && rmax >= 70 && r[i] < r[i - 1] && ax[i] <= 32) return -1; return 0;
    }],
    12: ['Parabolic SAR + MACD', (D, i) => {
      const mc = D.macd(12, 26, 9), sr = D.sar(0.02, 0.2), c = D.c, m = mc.m, g = mc.s; if (bad(m[i], g[i], m[i - 1], g[i - 1], sr[i])) return 0;
      const cu = m[i] > g[i] && m[i - 1] <= g[i - 1], cd = m[i] < g[i] && m[i - 1] >= g[i - 1]; if (!cu && !cd) return 0;
      const wa = anyK(1, 3, k => sr[i - k] > c[i - k]), wb = anyK(1, 3, k => sr[i - k] < c[i - k]);
      return cu && sr[i] < c[i] && wa ? 1 : cd && sr[i] > c[i] && wb ? -1 : 0;
    }],
    13: ['Scalp des bandes de Bollinger', (D, i) => {
      const b = D.bb(50, 3), r = D.rsi(8), s = D.sto(14, 3, 3, 'sma', false).k; if (bad(r[i], r[i - 1], s[i], s[i - 1], b.lo[i])) return 0;
      const rmin = minOf(r, i, 0, 2), rmax = maxOf(r, i, 0, 2), kmin = minOf(s, i, 0, 2), kmax = maxOf(s, i, 0, 2);
      const tl = anyK(0, 2, j => D.l[i - j] <= b.lo[i - j]), tu = anyK(0, 2, j => D.h[i - j] >= b.up[i - j]);
      if (tl && r[i] > r[i - 1] && rmin <= 30 && s[i] > s[i - 1] && kmin <= C.stoOS) return 1;
      if (tu && r[i] < r[i - 1] && rmax >= 70 && s[i] < s[i - 1] && kmax >= C.stoOB) return -1; return 0;
    }],
    14: ['Forex intelligent', (D, i) => {
      const k = D.sto(12, 12, 5, 'lwma', false).k, a = D.lwma(5, 'tp'), b = D.lwma(36, 'tp'); if (bad(a[i], a[i - 1], b[i], b[i - 1], k[i], k[i - 1], k[i - 4])) return 0;
      const kmin = minOf(k, i, 0, 4), kmax = maxOf(k, i, 0, 4);
      if (a[i] > b[i] && a[i - 1] <= b[i - 1] && k[i] > k[i - 1] && kmin < 40) return 1;
      if (a[i] < b[i] && a[i - 1] >= b[i - 1] && k[i] < k[i - 1] && kmax > 60) return -1; return 0;
    }],
    15: ['Système TDI', (D, i) => {
      const r = D.rsi(14), g = D.smaOn('rsi14', r, 2), rd = D.smaOn('rsi14', r, 7), k = D.sto(14, 3, 3, 'sma', true).k; if (bad(g[i], g[i - 1], rd[i], rd[i - 1], k[i])) return 0;
      if (k[i] > 50 && g[i] > rd[i] && g[i - 1] <= rd[i - 1]) return 1;
      if (k[i] < 50 && g[i] < rd[i] && g[i - 1] >= rd[i - 1]) return -1; return 0;
    }],
    17: ['Deux stochastiques', (D, i) => {
      const f = D.sto(5, 3, 3, 'sma', false), l = D.sto(21, 9, 9, 'sma', false); if (bad(l.k[i], l.d[i], l.k[i - 1], l.d[i - 1])) return 0;
      const su = l.k[i] > l.d[i] && l.k[i - 1] <= l.d[i - 1], sd = l.k[i] < l.d[i] && l.k[i - 1] >= l.d[i - 1]; if (!su && !sd) return 0;
      const fu = anyK(0, 5, k => f.k[i - k] > f.d[i - k] && f.k[i - k - 1] <= f.d[i - k - 1] && f.k[i - k - 1] <= 30);
      const fd = anyK(0, 5, k => f.k[i - k] < f.d[i - k] && f.k[i - k - 1] >= f.d[i - k - 1] && f.k[i - k - 1] >= 70);
      return su && fu ? 1 : sd && fd ? -1 : 0;
    }],
    18: ['CDMA', (D, i) => {
      const ss = D.smma(30), g = D.macd(25, 50, 9).s, fm = D.macd(6, 12, 1).m, c = D.c; if (bad(ss[i], g[i], g[i - 1], fm[i])) return 0;
      return g[i] > 0 && g[i - 1] <= 0 && fm[i] > 0 && c[i] > ss[i] ? 1 : g[i] < 0 && g[i - 1] >= 0 && fm[i] < 0 && c[i] < ss[i] ? -1 : 0;
    }],
    20: ['EMA + RVI', (D, i) => {
      const a = D.ema(18), b = D.ema(28), rv = D.rvi(100); if (bad(a[i], a[i - 1], b[i], b[i - 1], rv.v[i], rv.s[i])) return 0;
      return a[i] > b[i] && a[i - 1] <= b[i - 1] && rv.v[i] > rv.s[i] ? 1 : a[i] < b[i] && a[i - 1] >= b[i - 1] && rv.v[i] < rv.s[i] ? -1 : 0;
    }],
    21: ['Tunnel SMA233', (D, i) => {
      const hh = D.sma(233, 'h'), ll = D.sma(233, 'l'), lv = C.tunnelLvl * D.pip, c = D.c; if (bad(hh[i], hh[i - 1], ll[i], ll[i - 1])) return 0;
      return c[i] > hh[i] + lv && c[i - 1] <= hh[i - 1] + lv ? 1 : c[i] < ll[i] - lv && c[i - 1] >= ll[i - 1] - lv ? -1 : 0;
    }],
    22: ['Deux groupes de SMA', (D, i) => {
      const fp = [3, 5, 8, 10, 12, 15], sp = [30, 35, 40, 45, 50, 60];
      const f0 = fp.map(p => D.sma(p)[i]), f1 = fp.map(p => D.sma(p)[i - 1]), l0 = sp.map(p => D.sma(p)[i]), l1 = sp.map(p => D.sma(p)[i - 1]);
      if (bad(...f0, ...f1, ...l0, ...l1)) return 0;
      let up = true, dn = true, ri = true, fa = true;
      for (let k = 0; k < 5; k++) { if (!(f0[k] > f0[k + 1])) up = false; if (!(f0[k] < f0[k + 1])) dn = false; if (!(l0[k] > l0[k + 1])) up = false; if (!(l0[k] < l0[k + 1])) dn = false; }
      for (let k = 0; k < 6; k++) { if (!(f0[k] > f1[k]) || !(l0[k] > l1[k])) ri = false; if (!(f0[k] < f1[k]) || !(l0[k] < l1[k])) fa = false; }
      return up && ri ? 1 : dn && fa ? -1 : 0;
    }],
    24: ['Croisements du yen (EMA8/SMA21/ADX)', (D, i) => {
      const e = D.ema(8), uh = D.sma(21, 'h'), ul = D.sma(21, 'l'), A = D.adx(14), c = D.c; if (bad(e[i], e[i - 1], uh[i], uh[i - 1], ul[i], ul[i - 1], A.adx[i], A.adx[i - 1])) return 0;
      const du = anyK(0, 2, k => A.pdi[i - k] > A.mdi[i - k] && A.pdi[i - k - 1] <= A.mdi[i - k - 1]), dd = anyK(0, 2, k => A.mdi[i - k] > A.pdi[i - k] && A.mdi[i - k - 1] <= A.pdi[i - k - 1]);
      if (e[i] > uh[i] && e[i - 1] <= uh[i - 1] && c[i] > uh[i] && A.adx[i] > 15 && A.adx[i] > A.adx[i - 1] && du) return 1;
      if (e[i] < ul[i] && e[i - 1] >= ul[i - 1] && c[i] < ul[i] && A.adx[i] > 15 && A.adx[i] > A.adx[i - 1] && dd) return -1; return 0;
    }],
    25: ['Trois oscillateurs de Nial Fuller', (D, i) => {
      const r8 = D.rsi(8), r14 = D.rsi(14), r19 = D.rsi(19), s = D.sma(9), c = D.c; if (bad(r8[i], r14[i], r19[i], s[i])) return 0;
      return r8[i] > r14[i] && r14[i] > r19[i] && c[i] > s[i] ? 1 : r8[i] < r14[i] && r14[i] < r19[i] && c[i] < s[i] ? -1 : 0;
    }],
    27: ['4UJ (SMA48 + ATR)', (D, i) => {
      const s = D.sma(48), a = D.atr(7), m = D.smaOn('atr7', a, 30), c = D.c; if (bad(s[i], a[i], a[i - 1], m[i], m[i - 1])) return 0;
      return c[i] > s[i] && a[i] > m[i] && a[i - 1] <= m[i - 1] ? 1 : c[i] < s[i] && a[i] < m[i] && a[i - 1] >= m[i - 1] ? -1 : 0;
    }],
    28: ['CSBB (CCI + Stoch + Bulls/Bears)', (D, i) => {
      const cc = D.cci(120), k = D.sto(10, 3, 6, 'sma', false).k, e = D.ema(13); if (bad(cc[i], k[i], k[i - 1], e[i])) return 0;
      const bu = D.h[i] - e[i], be = D.l[i] - e[i];
      return cc[i] > 100 && k[i] > k[i - 1] && k[i] < 80 && bu > 0 ? 1 : cc[i] < -100 && k[i] < k[i - 1] && k[i] > 20 && be < 0 ? -1 : 0;
    }],
    30: ['TCA (SSMA90 + CCI + WPR + ATR)', (D, i) => {
      const ss = D.smma(90), cc = D.cci(12), w = D.wpr(11), a = D.atr(14), c = D.c; if (bad(ss[i], cc[i], cc[i - 1], w[i], a[i], w[i - 3], cc[i - 4])) return 0;
      const wmin = Math.min(0, minOf(w, i, 0, 3)), wmax = Math.max(-100, maxOf(w, i, 0, 3)), cmin = minOf(cc, i, 1, 4), cmax = maxOf(cc, i, 1, 4);
      return c[i] > ss[i] && a[i] > C.atrMin && wmin < -85 && cc[i] > cc[i - 1] && cmin < -100 ? 1 : c[i] < ss[i] && a[i] > C.atrMin && wmax > -15 && cc[i] < cc[i - 1] && cmax > 100 ? -1 : 0;
    }],
    31: ['3 EMA + Stochastique', (D, i) => {
      const e4 = D.ema(4), e13 = D.ema(13), e50 = D.ema(50), s = D.sto(12, 9, 5, 'sma', true); if (bad(e4[i], e13[i], e13[i - 1], e50[i], e50[i - 1], s.k[i], s.d[i], s.k[i - 8])) return 0;
      const kmin = minOf(s.k, i, 0, 8), kmax = maxOf(s.k, i, 0, 8);
      return e13[i] > e50[i] && e13[i - 1] <= e50[i - 1] && e4[i] > e50[i] && s.k[i] > s.d[i] && kmin <= 30 ? 1 : e13[i] < e50[i] && e13[i - 1] >= e50[i - 1] && e4[i] < e50[i] && s.k[i] < s.d[i] && kmax >= 70 ? -1 : 0;
    }],
    33: ['Double MACD', (D, i) => {
      const s = D.sma(60), a = D.macd(30, 60, 30).m, b = D.macd(6, 12, 5).m, c = D.c; if (bad(s[i], a[i], b[i])) return 0;
      return c[i] > s[i] && a[i] > 0 && b[i] > 0 ? 1 : c[i] < s[i] && a[i] < 0 && b[i] < 0 ? -1 : 0;
    }],
    34: ['2x2 (SSMA150 + RSI3 + Stoch + HA)', (D, i) => {
      const ss = D.smma(150), r = D.rsi(3), s = D.sto(6, 3, 3, 'sma', false), ha = D.ha(), c = D.c; if (bad(ss[i], s.k[i], s.d[i], s.k[i - 1], s.d[i - 1], r[i - 4])) return 0;
      const cu = s.k[i] > s.d[i] && s.k[i - 1] <= s.d[i - 1] && s.k[i - 1] < 30, cd = s.k[i] < s.d[i] && s.k[i - 1] >= s.d[i - 1] && s.k[i - 1] > 70; if (!cu && !cd) return 0;
      const ru = anyK(0, 3, k => r[i - k] > 20 && r[i - k - 1] <= 20), rd = anyK(0, 3, k => r[i - k] < 80 && r[i - k - 1] >= 80);
      return cu && ru && c[i] > ss[i] && ha[i] > 0 ? 1 : cd && rd && c[i] < ss[i] && ha[i] < 0 ? -1 : 0;
    }],
    35: ['Sardar (RVI + RSI + StdDev)', (D, i) => {
      const v = D.rvi(10).v, r = D.rsi(14), d = D.std(20); if (bad(v[i], v[i - 1], r[i], r[i - 1], d[i], d[i - 1])) return 0;
      return v[i] > 0 && v[i - 1] <= 0 && r[i] > r[i - 1] && d[i] > d[i - 1] ? 1 : v[i] < 0 && v[i - 1] >= 0 && r[i] < r[i - 1] && d[i] < d[i - 1] ? -1 : 0;
    }],
    36: ['Ranger (SAR + Stochastique)', (D, i) => {
      const sr = D.sar(0.04, 0.1), s = D.sto(5, 5, 5, 'sma', false), c = D.c; if (bad(sr[i], s.k[i], s.d[i], s.k[i - 1], s.d[i - 1])) return 0;
      return s.k[i] > s.d[i] && s.k[i - 1] <= s.d[i - 1] && Math.min(s.k[i - 1], s.d[i - 1]) <= 25 && sr[i] < c[i] ? 1 : s.k[i] < s.d[i] && s.k[i - 1] >= s.d[i - 1] && Math.max(s.k[i - 1], s.d[i - 1]) >= 75 && sr[i] > c[i] ? -1 : 0;
    }],
    39: ['Enveloppes + MACD', (D, i) => {
      const s = D.sma(21), m = D.macd(12, 26, 9).m, c = D.c, o = D.o, dv = 0.0007; if (bad(s[i], s[i - 1], s[i - 2], m[i])) return 0;
      const u = j => s[j] * (1 + dv), l = j => s[j] * (1 - dv);
      return c[i - 1] > u(i - 1) && c[i - 2] <= u(i - 2) && Math.min(o[i], c[i]) > u(i) && m[i] > 0 ? 1 : c[i - 1] < l(i - 1) && c[i - 2] >= l(i - 2) && Math.max(o[i], c[i]) < l(i) && m[i] < 0 ? -1 : 0;
    }],
    41: ['Supertrend + ADX + EMA200', (D, i) => {
      const A = D.adx(14), e = D.ema(200), st = D.st(C.stP, C.stM), c = D.c; if (bad(A.adx[i], A.pdi[i], A.mdi[i], e[i], st[i])) return 0;
      return st[i] > 0 && A.adx[i] >= C.adxMin && A.pdi[i] > A.mdi[i] && c[i] > e[i] ? 1 : st[i] < 0 && A.adx[i] >= C.adxMin && A.mdi[i] > A.pdi[i] && c[i] < e[i] ? -1 : 0;
    }],
    42: ['Squeeze TTM (Bollinger dans Keltner)', (D, i) => {
      const b = D.bb(20, 2), mid = D.sma(20), a = D.atr(20), n = 20;
      const on = j => b.up[j] < mid[j] + 1.5 * a[j] && b.lo[j] > mid[j] - 1.5 * a[j];
      if (i < 2 * n - 2 || bad(b.up[i], b.up[i - 1], mid[i], mid[i - 1], a[i], a[i - 1])) return 0;
      if (!(on(i - 1) && !on(i))) return 0;
      let sx = 0, sy = 0, sxy = 0, sxx = 0;
      for (let j = 0; j < n; j++) { const q = i - (n - 1 - j); let hh = -Infinity, ll = Infinity, sm = 0; for (let t = 0; t < n; t++) { hh = Math.max(hh, D.h[q - t]); ll = Math.min(ll, D.l[q - t]); sm += D.c[q - t]; } const y = D.c[q] - ((hh + ll) / 2 + sm / n) / 2; sx += j; sy += y; sxy += j * y; sxx += j * j; }
      const den = n * sxx - sx * sx, bb = (n * sxy - sx * sy) / den, aa = (sy - bb * sx) / n, mom = aa + bb * (n - 1);
      return mom > 0 ? 1 : mom < 0 ? -1 : 0;
    }],
    43: ['RSI(2) de Connors + SMA200', (D, i) => {
      const r = D.rsi(2), m200 = D.sma(200), m5 = D.sma(5), c = D.c; if (bad(r[i], m200[i], m5[i])) return 0;
      return c[i] > m200[i] && c[i] < m5[i] && r[i] < C.rsi2Lo ? 1 : c[i] < m200[i] && c[i] > m5[i] && r[i] > C.rsi2Hi ? -1 : 0;
    }],
    44: ['Cassure du canal Donchian + ADX', (D, i) => {
      const n = Math.max(5, C.donN), ax = D.adx(14).adx; if (bad(ax[i]) || i < n + 1) return 0;
      const hh = maxOf(D.h, i, 1, n), ll = minOf(D.l, i, 1, n);
      return D.c[i] > hh && ax[i] >= C.donAdx ? 1 : D.c[i] < ll && ax[i] >= C.donAdx ? -1 : 0;
    }],
    45: ['Repli en tendance (EMA + RSI + ATR)', (D, i) => {
      const e21 = D.ema(21), e50 = D.ema(50), e200 = D.ema(200), r = D.rsi(14), a = D.atr(14), c = D.c, h = D.h, l = D.l;
      if (i < 21 || bad(e50[i], e50[i - 5], e200[i], e21[i], r[i], r[i - 1], a[i], r[i - 4], e21[i - 4])) return 0;
      const lo1 = minOf(l, i, 1, 10), hi1 = maxOf(h, i, 1, 10), lo2 = minOf(l, i, 11, 20), hi2 = maxOf(h, i, 11, 20);
      const tu = anyK(0, 4, k => l[i - k] <= e21[i - k] + C.pbZone * a[i]), td = anyK(0, 4, k => h[i - k] >= e21[i - k] - C.pbZone * a[i]);
      const rmin = minOf(r, i, 0, 4), rmax = maxOf(r, i, 0, 4);
      if (e50[i] > e200[i] && e50[i] > e50[i - 5] && c[i] > e50[i] && lo1 > lo2 && tu && rmin <= C.pbRsi && r[i] > r[i - 1] && r[i] < 70 && c[i] > e21[i] && c[i] > h[i - 1]) return 1;
      if (e50[i] < e200[i] && e50[i] < e50[i - 5] && c[i] < e50[i] && hi1 < hi2 && td && rmax >= 100 - C.pbRsi && r[i] < r[i - 1] && r[i] > 30 && c[i] < e21[i] && c[i] < l[i - 1]) return -1; return 0;
    }],
    46: ['BMC : cassure de structure + EMA200', (D, i) => {
      const n = Math.max(5, C.bmcLook), e = D.ema(C.bmcEma), c = D.c, pt = D.pip / 10; if (i < n + 1 || bad(e[i])) return 0;
      const hi = maxOf(D.h, i, 1, n), lo = minOf(D.l, i, 1, n);
      if (c[i] > e[i] && c[i] > hi + C.bmcBuf * pt) { const sl = lo - C.bmcSL * pt, d = c[i] - sl; if (d <= 0) return 0; D.note = { 46: `SL ${sl.toFixed(5)} | TP ${(c[i] + d * C.bmcRR).toFixed(5)}` }; return 1; }
      if (c[i] < e[i] && c[i] < lo - C.bmcBuf * pt) { const sl = hi + C.bmcSL * pt, d = sl - c[i]; if (d <= 0) return 0; D.note = { 46: `SL ${sl.toFixed(5)} | TP ${(c[i] - d * C.bmcRR).toFixed(5)}` }; return -1; }
      return 0;
    }],
  };
  const IDS = Object.keys(STR).map(Number);

  // pip estimé (JPY ~ 0,01 ; sinon 0,0001)
  const pipOf = p => p > 20 ? 0.01 : 0.0001;

  // évalue toutes les stratégies en même temps : état à i, état à i-1 => signal si changement
  function evalAll(cs) {
    const D = mkCtx(cs, pipOf(cs[cs.length - 1].c)), i = D.n - 1, out = { sig: {}, state: {}, note: {} };
    for (const id of IDS) {
      if (S._only && !S._only.includes(id)) continue;
      let s1 = 0, s0 = 0;
      try { s1 = STR[id][1](D, i) || 0; const note = D.note; s0 = STR[id][1](D, i - 1) || 0; D.note = note; } catch (e) { s1 = 0; s0 = 0; }
      out.state[id] = s1; out.sig[id] = s1 !== 0 && s1 !== s0 ? s1 : 0;
      if (D.note && D.note[id]) out.note[id] = D.note[id];
    }
    return out;
  }
  const EXP = {2:'5m',3:'5m',5:'5m',6:'5m',8:'1m',9:'1m',10:'1m',12:'5m',13:'1m',14:'5m',15:'1m',17:'5m',18:'5m',20:'5m',21:'5m',22:'5m',24:'5m',25:'1m',27:'5m',28:'5m',30:'5m',31:'5m',33:'5m',34:'5m',35:'1m',36:'1m',39:'1m',41:'5m',42:'5m',43:'1m',44:'5m',45:'5m',46:'5m'};
  const stratExp = id => S.expMode !== 'auto' ? S.expMode : S.TF >= 180 ? '5m' : S.TF < 60 ? '1m' : (S._expOverrides[id] || EXP[id] || '1m');
  const tradePeriod = (sigs, dir) => {
    if (S.expMode === '1m' || S.expMode === '5m') return S.expMode;
    if (S.TF >= 180) return '5m';
    if (S.TF < 60) return '1m';
    const tgt = dir === 'CALL' ? 1 : dir === 'PUT' ? -1 : 0;
    let m1 = 0, m5 = 0;
    for (const id in sigs) {
      const v = sigs[id];
      if (!v || (tgt !== 0 && v !== tgt)) continue;
      const p = S._expOverrides[id] || EXP[id] || '1m';
      if (p === '5m') m5++; else m1++;
    }
    return m5 > m1 ? '5m' : '1m';
  };
  // confirmation : au moins C.minVotes stratégies (3 = plus de 2) dans le même sens, et plus nombreuses que le sens opposé
  const consensus = sigs => { let b = 0, s = 0; for (const id in sigs) { if (sigs[id] === 1) b++; if (sigs[id] === -1) s++; } const v = b >= C.minVotes && b > s ? 'CALL' : s >= C.minVotes && s > b ? 'PUT' : 'aucun'; return { b, s, v, exp: tradePeriod(sigs, v) }; };

  // ================================================================ horloge serveur & déclenchement à 00 pile
  const srvNowMs = () => Date.now() + S._srvOffsetMs;
  const bucketNow = () => Math.floor((srvNowMs() / 1000) / S.TF);
  let lastBucket = bucketNow(), provT = 0, openTimeout = null;

  function calibrateClock(ts) {
    const now = Date.now();
    // Si ts possède des décimales (ex: 1732250400.125), offset direct
    if (ts % 1 !== 0) {
      const off = ts * 1000 - now;
      if (Math.abs(off) < 120000) { S._srvOffsetMs = Math.round(off); S._srvSynced = true; }
      return;
    }
    // Si ts est entier, le moment exact où ts passe à ts+1 correspond au .000s serveur
    if (S._lastLiveTs > 0 && ts === S._lastLiveTs + 1) {
      const off = ts * 1000 - now;
      if (Math.abs(off) < 120000) { S._srvOffsetMs = Math.round(off); S._srvSynced = true; }
    }
    S._lastLiveTs = ts;
  }

  function scheduleNextOpen() {
    clearTimeout(openTimeout);
    const tfMs = S.TF * 1000;
    const nowMs = srvNowMs();
    const nextOpenMs = (Math.floor(nowMs / tfMs) + 1) * tfMs;
    const delay = Math.max(5, nextOpenMs - nowMs);
    openTimeout = setTimeout(() => {
      const b = bucketNow();
      if (b > lastBucket) {
        lastBucket = b;
        provT = Date.now();
        run(true, '00 pile');
      }
      scheduleNextOpen();
    }, delay);
  }

  function addTick(asset, ts, price, isLive) {
    S.active = asset; const a = S.ticks[asset] || (S.ticks[asset] = []);
    if (a.length && ts < a[a.length - 1][0]) S.needSort[asset] = true;
    a.push([ts, price]); if (a.length > S.MAXTICKS) a.splice(0, a.length - S.MAXTICKS);
    if (isLive && asset === (S.lock || S.active) && Math.abs(ts - Date.now() / 1000) < 120) {
      calibrateClock(ts);
      const tb = Math.floor(ts / S.TF);
      if (tb > lastBucket) {
        lastBucket = tb; provT = Date.now();
        scheduleNextOpen();
        run(true, 'ouverture 00');
      } else if (!S._gotOpenTick[asset + '|' + tb]) {
        S._gotOpenTick[asset + '|' + tb] = true;
        refreshProv();
      }
    }
  }
  function getTicks(asset) { const a = S.ticks[asset] || []; if (S.needSort[asset]) { a.sort((x, y) => x[0] - y[0]); S.needSort[asset] = false; } return a; }
  function build(ticks, TF) {
    const out = []; let cur = null;
    for (const [t, p] of ticks) { const b = Math.floor(t / TF) * TF; if (!cur || cur.t !== b) { if (cur) out.push(cur); cur = { t: b, o: p, h: p, l: p, c: p }; } else { if (p > cur.h) cur.h = p; if (p < cur.l) cur.l = p; cur.c = p; } }
    if (cur) out.push(cur); return out;
  }

  // ---- historique de bougies envoyé par la plateforme + agrégation + fusion avec les ticks live
  const NEED = {2:30,3:90,5:20,6:35,8:10,9:25,10:25,12:35,13:55,14:40,15:45,17:45,18:60,20:105,21:235,22:62,24:35,25:25,27:40,28:125,30:95,31:55,33:65,34:155,35:30,36:10,39:30,41:205,42:40,43:205,44:30,45:205,46:205};
  function addHist(asset, period, rows) {
    const ok = rows.filter(r => Array.isArray(r) && r.length >= 5 && typeof r[0] === 'number' && r[0] > 1e9 && r.slice(1, 5).every(v => typeof v === 'number'));
    if (ok.length < 2) return false;
    const T = r => r[0] > 1e12 ? Math.round(r[0] / 1000) : Math.floor(r[0]);
    if (!VALID_TF.includes(period)) { const d = []; for (let i = 1; i < Math.min(ok.length, 20); i++) d.push(T(ok[i]) - T(ok[i - 1])); d.sort((a, b) => a - b); period = d[d.length >> 1]; }
    if (!VALID_TF.includes(period)) return false;
    const key = asset + '|' + period, map = new Map((S.hist[key] || []).map(c => [c.t, c]));
    for (const r of ok) {
      const v = r.slice(1, 5), hi = Math.max(...v), lo = Math.min(...v); let o, c;
      if (r[2] === hi && r[3] === lo) { o = r[1]; c = r[4]; }
      else { o = r[1]; c = r[2]; }
      map.set(Math.floor(T(r) / period) * period, { t: Math.floor(T(r) / period) * period, o, h: hi, l: lo, c });
    }
    S.hist[key] = [...map.values()].sort((a, b) => a.t - b.t);
    S._dirty = true; return true;
  }
  function aggregate(cs, TF) {
    const out = []; let cur = null;
    for (const x of cs) { const b = Math.floor(x.t / TF) * TF; if (!cur || cur.t !== b) { if (cur) out.push(cur); cur = { t: b, o: x.o, h: x.h, l: x.l, c: x.c }; } else { cur.h = Math.max(cur.h, x.h); cur.l = Math.min(cur.l, x.l); cur.c = x.c; } }
    if (cur) out.push(cur); return out;
  }
  function candlesFor(asset, TF) {
    const tc = build(getTicks(asset), TF);
    let h = S.hist[asset + '|' + TF];
    if (!h || !h.length) {
      const ps = Object.keys(S.hist).filter(k => k.startsWith(asset + '|')).map(k => +k.split('|')[1]).filter(q => q < TF && TF % q === 0).sort((x, y) => y - x);
      if (ps.length) h = aggregate(S.hist[asset + '|' + ps[0]], TF);
    }
    if (!h || !h.length) return tc;
    const out = h.slice(), last = out[out.length - 1];
    for (const c of tc) {
      if (c.t === last.t) { last.h = Math.max(last.h, c.h); last.l = Math.min(last.l, c.l); last.c = c.c; }
      else if (c.t > last.t) out.push(c);
    }
    return out;
  }
  let schedT = null;
  const sched = () => { clearTimeout(schedT); schedT = setTimeout(() => { S._dirty = false; run(false, 'historique'); }, 450); };

  // ================================================================ envoi des signaux confirmés vers Telegram (@momotrad_bot)
  const escHtml = t => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  async function sendTelegramText(htmlText, proxyPayload) {
    if (!S.tgEnabled) return;
    if (S.tgToken && S.tgChatId) {
      const safeTok = encodeURIComponent(S.tgToken).replace(/%3A/gi, ':');
      const base = `https://api.telegram.org/bot${safeTok}/sendMessage`;
      try {
        const res = await fetch(base, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: S.tgChatId, text: htmlText, parse_mode: 'HTML', disable_web_page_preview: true })
        });
        if (!res.ok) console.warn('[qxSig] Telegram HTTP', res.status);
        else console.log('[qxSig] signal envoyé à @momotrad_bot');
      } catch (e) {
        try {
          const plain = htmlText.replace(/<[^>]+>/g, '');
          const img = new Image();
          img.src = `${base}?chat_id=${encodeURIComponent(S.tgChatId)}&text=${encodeURIComponent(plain)}`;
        } catch (_) {}
      }
      return;
    }
    if (S.tgProxyUrl && proxyPayload) {
      try {
        const res = await fetch(`${S.tgProxyUrl}/api/telegram/send`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(proxyPayload)
        });
        if (!res.ok) console.warn('[qxSig] relais Telegram HTTP', res.status, '— configurez __qxSig.setTelegram(TOKEN, CHAT_ID)');
        else console.log('[qxSig] signal relayé vers @momotrad_bot');
      } catch (e) { console.warn('[qxSig] proxy Telegram inaccessible — utilisez __qxSig.setTelegram(TOKEN, CHAT_ID)', e); }
    } else {
      console.warn('[qxSig] Telegram non configuré : exécutez __qxSig.setTelegram(TOKEN, CHAT_ID)');
    }
  }

  function notifyTelegram(asset, TF, cs, sig, note, price, lastT, fresh) {
    if (!S.tgEnabled || !fresh) return;
    const activeIds = Object.keys(sig).map(Number).filter(id => sig[id] !== 0);
    if (!activeIds.length) return;
    const hasConsensus = cs.v === 'CALL' || cs.v === 'PUT';
    if (!hasConsensus && !S.tgSendIndividual) return;
    const sentKey = `${asset}|${TF}|${lastT}|${cs.v}|${activeIds.join(',')}`;
    if (S._tgSent[sentKey]) return;
    S._tgSent[sentKey] = true;

    const dir = hasConsensus ? cs.v : (sig[activeIds[0]] === 1 ? 'CALL' : 'PUT');
    const exp = hasConsensus ? cs.exp : stratExp(activeIds[0]);
    const tfLbl = TF >= 60 ? Math.round(TF / 60) + 'm' : TF + 's';
    const arrow = dir === 'CALL' ? '🟢 CALL (HAUSSE)' : '🔴 PUT (BAISSE)';
    const timeStr = fmtMs(new Date());
    const sigItems = activeIds.slice(0, 10).map(id => ({
      id, name: STR[id][0], dir: sig[id] === 1 ? 'CALL' : 'PUT', exp: stratExp(id), note: note[id] || ''
    }));
    const lines = [
      `<b>${arrow}</b> · <b>${escHtml(asset)}</b>`,
      `Période transaction : <b>${exp}</b> | TF graphique : ${escHtml(tfLbl)}`,
      `Consensus : ${cs.b}↑ / ${cs.s}↓ | Prix : ${escHtml(price)}`,
      `Ouverture 00 pile : ${escHtml(timeStr)}`,
      '',
      '<b>Stratégies confirmées :</b>',
      ...sigItems.map(s => `• S${s.id} ${escHtml(s.name)} → ${s.dir} [${s.exp}]${s.note ? ' (' + escHtml(s.note) + ')' : ''}`)
    ];
    sendTelegramText(lines.join('\n'), {
      type: 'signal', asset, tf: TF, direction: dir, period: exp,
      calls: cs.b, puts: cs.s, price, time: timeStr, signals: sigItems
    });
  }

  // ================================================================ confirmation vocale + bip sonore (Web Speech API + AudioContext)
  let audioCtx = null;
  const getAudio = () => { try { if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)(); if (audioCtx.state === 'suspended') audioCtx.resume(); } catch (e) {} return audioCtx; };
  // les navigateurs exigent une interaction de l'utilisateur avant de jouer du son : on « débloque » au premier clic/touche
  const unlockAudio = () => { getAudio(); try { if (window.speechSynthesis) speechSynthesis.getVoices(); } catch (e) {} };
  const unlockEvents = ['click', 'keydown', 'touchstart'];
  unlockEvents.forEach(ev => document.addEventListener(ev, unlockAudio, true));

  function beep(dir) {
    if (!S.beepEnabled) return;
    const ctx = getAudio(); if (!ctx) return;
    const notes = dir === 'CALL' ? [660, 880] : [880, 660];   // montant = CALL, descendant = PUT
    notes.forEach((f, k) => {
      const o = ctx.createOscillator(), g = ctx.createGain(), t0 = ctx.currentTime + k * 0.16;
      o.type = 'sine'; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(Math.max(0.01, S.voiceVolume * 0.4), t0 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.15);
      o.connect(g); g.connect(ctx.destination); o.start(t0); o.stop(t0 + 0.16);
    });
  }
  const spellAsset = a => {
    const base = String(a).replace(/_otc$/i, ''), otc = /_otc$/i.test(a) ? ' O T C' : '';
    const m = base.match(/^([A-Za-z]{3})([A-Za-z]{3})$/);
    return (m ? m[1].split('').join(' ') + ', ' + m[2].split('').join(' ') : base) + otc;
  };
  function speak(text) {
    if (!S.voiceEnabled || !window.speechSynthesis) return;
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = S.voiceLang; u.rate = S.voiceRate; u.volume = S.voiceVolume;
      const vs = speechSynthesis.getVoices(), pre = S.voiceLang.split('-')[0];
      const v = vs.find(x => x.lang === S.voiceLang) || vs.find(x => x.lang && x.lang.startsWith(pre));
      if (v) u.voice = v;
      speechSynthesis.speak(u);
    } catch (e) {}
  }
  function notifyVoice(asset, TF, cs, lastT, fresh) {
    if (!fresh || (cs.v !== 'CALL' && cs.v !== 'PUT')) return;
    const key = `${asset}|${TF}|${lastT}|${cs.v}`;
    if (S._voiceSent[key]) return; S._voiceSent[key] = true;
    beep(cs.v);
    const per = cs.exp === '5m' ? 'cinq minutes' : 'une minute';
    const dirTxt = cs.v === 'CALL' ? 'Achat, hausse' : 'Vente, baisse';
    const n = cs.v === 'CALL' ? cs.b : cs.s;
    setTimeout(() => speak(`Signal confirmé. ${dirTxt}. ${spellAsset(asset)}. Période ${per}. ${n} stratégies d'accord.`), 350);
  }

  // ================================================================ DÉTECTION DES BOUTONS BUY / SELL (CALL / PUT) sur le terminal Quotex
  const visEl = el => {
    const r = el.getBoundingClientRect(), s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && +s.opacity > 0.1;
  };
  const cssPath = el => {
    if (!el || !el.tagName) return '';
    if (el.id) return '#' + CSS.escape(el.id);
    const cls = [...el.classList].filter(c => !/^\d|active|hover|disabled|focus|selected/i.test(c)).slice(0, 3).map(c => '.' + CSS.escape(c)).join('');
    let sel = el.tagName.toLowerCase() + cls;
    try { if (document.querySelectorAll(sel).length > 1 && el.parentElement) sel = cssPath(el.parentElement) + ' > ' + sel; } catch (e) {}
    return sel;
  };
  const parseRgb = bg => { const m = String(bg).match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/); return m ? { r: +m[1], g: +m[2], b: +m[3], a: m[4] === undefined ? 1 : +m[4] } : null; };
  const colorOf = el => {
    // couleur de fond de l'élément ou, à défaut, d'un de ses 2 parents proches
    for (let e = el, k = 0; e && k < 3; e = e.parentElement, k++) {
      const c = parseRgb(getComputedStyle(e).backgroundColor);
      if (c && c.a > 0.5) {
        if (c.g > c.r + 40 && c.g > c.b + 20) return 'green';
        if (c.r > c.g + 50 && c.r > c.b + 40) return 'red';
        return null;
      }
    }
    return null;
  };
  const RX_CALL_TXT = /^(up|call|higher|buy|haut|achat|hausse|acheter|monter)$/i, RX_PUT_TXT = /^(down|put|lower|sell|bas|vente|baisse|vendre|descendre)$/i;
  const RX_CALL_CLS = /(^|[\s_-])(call|up|success|buy|higher|green)([\s_-]|$)/i, RX_PUT_CLS = /(^|[\s_-])(put|down|danger|sell|lower|red)([\s_-]|$)/i;

  function scanTradeButtons() {
    const rows = [];
    document.querySelectorAll('button,[role="button"],a,div,span').forEach(el => {
      if (el.closest('#qx-box') || !visEl(el)) return;
      const r = el.getBoundingClientRect();
      if (r.width < 40 || r.height < 28 || r.width > 430 || r.height > 150) return;
      if (el.querySelectorAll('*').length > 12) return;
      const txt = (el.textContent || '').trim().replace(/\s+/g, ' ');
      if (txt.length > 18) return;
      const cls = ((el.className && el.className.baseVal !== undefined ? el.className.baseVal : el.className) || '').toString() + ' ' + (el.getAttribute('data-testid') || '') + ' ' + (el.getAttribute('aria-label') || '');
      const col = colorOf(el), st = getComputedStyle(el);
      const tCall = RX_CALL_TXT.test(txt), tPut = RX_PUT_TXT.test(txt), cCall = RX_CALL_CLS.test(cls), cPut = RX_PUT_CLS.test(cls);
      const click = (el.tagName === 'BUTTON' || el.getAttribute('role') === 'button' || st.cursor === 'pointer') ? 1 : 0;
      const right = r.left + r.width / 2 > innerWidth * 0.5 ? 1 : 0;
      const sC = (tCall ? 3 : 0) + (cCall ? 2 : 0) + (col === 'green' ? 2 : 0) - (tPut ? 5 : 0) - (cPut ? 3 : 0) - (col === 'red' ? 3 : 0);
      const sP = (tPut ? 3 : 0) + (cPut ? 2 : 0) + (col === 'red' ? 2 : 0) - (tCall ? 5 : 0) - (cCall ? 3 : 0) - (col === 'green' ? 3 : 0);
      const base = click + right + (el.tagName === 'BUTTON' ? 1 : 0);
      if (sC >= 2) rows.push({ dir: 'CALL', score: sC + base, el, txt, col, r });
      if (sP >= 2) rows.push({ dir: 'PUT', score: sP + base, el, txt, col, r });
    });
    const best = {};
    for (const d of ['CALL', 'PUT']) {
      const c = rows.filter(x => x.dir === d).sort((a, b) => b.score - a.score || (b.r.width * b.r.height) - (a.r.width * a.r.height));
      best[d] = c[0] || null;
    }
    return { rows, best };
  }

  function findTradeButton(dir) {
    // 1) sélecteur imposé par l'utilisateur (prioritaire)
    const customSel = dir === 'CALL' ? S.callSelector : S.putSelector;
    if (customSel) { try { const el = document.querySelector(customSel); if (el && visEl(el)) return el; } catch (e) {} }
    // 2) bouton mémorisé encore présent dans la page
    const cached = S._btnCache[dir];
    if (cached && cached.isConnected && visEl(cached)) return cached;
    // 3) nouveau scan (texte + classe + couleur + position)
    const best = scanTradeButtons().best[dir];
    if (best) { S._btnCache[dir] = best.el; return best.el; }
    return null;
  }

  function clearOutline() { S._outlined.forEach(e => { try { e.style.outline = e.__qxOld || ''; e.style.outlineOffset = ''; } catch (_) {} }); S._outlined = []; }
  function detectButtons() {
    clearOutline();
    const { rows, best } = scanTradeButtons();
    const view = rows.sort((a, b) => b.score - a.score).slice(0, 14).map(x => ({ sens: x.dir, score: x.score, texte: x.txt, couleur: x.col || '-', selecteur: cssPath(x.el), x: Math.round(x.r.left), y: Math.round(x.r.top), w: Math.round(x.r.width), h: Math.round(x.r.height) }));
    console.table(view);
    for (const d of ['CALL', 'PUT']) {
      const b = best[d]; if (!b) { console.warn('[qxSig] bouton ' + d + ' introuvable — réglez-le avec __qxSig.setButtons(\'SEL_VERT\',\'SEL_ROUGE\')'); continue; }
      S._btnCache[d] = b.el; b.el.__qxOld = b.el.style.outline; b.el.style.outline = '3px solid ' + (d === 'CALL' ? '#00ff9c' : '#ff3b4f'); b.el.style.outlineOffset = '2px'; S._outlined.push(b.el);
      console.log(`[qxSig] ${d} => ${cssPath(b.el)} (texte "${b.txt}", score ${b.score})`);
    }
    console.log('[qxSig] contour vert = CALL (achat), rouge = PUT (vente). Si faux : __qxSig.setButtons(sel_call, sel_put). Effacer : __qxSig.clearOutline()');
    return { call: best.CALL && cssPath(best.CALL.el), put: best.PUT && cssPath(best.PUT.el) };
  }

  const isDemo = () => /demo/i.test(location.href);
  function clickTrade(dir) {
    if (S.demoOnly && !isDemo()) { console.warn('[qxSig] clic BLOQUÉ : URL sans "demo" (S.demoOnly = true). __qxSig.setDemoOnly(false) pour lever la sécurité.'); return false; }
    const btn = findTradeButton(dir);
    if (!btn) { console.warn('[qxSig] bouton ' + dir + ' introuvable — lancez __qxSig.detectButtons()'); return false; }
    try {
      btn.scrollIntoView && btn.scrollIntoView({ block: 'nearest' });
      const r = btn.getBoundingClientRect(), o = { bubbles: true, cancelable: true, view: window, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 };
      ['pointerdown', 'mousedown', 'pointerup', 'mouseup'].forEach(t => { try { btn.dispatchEvent(new (t.startsWith('pointer') && window.PointerEvent ? PointerEvent : MouseEvent)(t, o)); } catch (_) {} });
      btn.click();
      return true;
    } catch (e) { console.warn('[qxSig] clic en échec', e); return false; }
  }

  function settleTrades(asset, price) {
    const now = srvNowMs();
    let changed = false;
    for (const t of S._trades) {
      if (t.status === 'open' && t.asset === asset && now >= t.expiresAtMs) {
        t.closePrice = price;
        if (price === t.entryPrice) t.status = 'tie';
        else if ((t.direction === 'CALL' && price > t.entryPrice) || (t.direction === 'PUT' && price < t.entryPrice)) t.status = 'win';
        else t.status = 'loss';
        changed = true;
        console.log(`[qxSig] CLÔTURE ${t.direction} ${t.asset} [${t.period}] => ${t.status.toUpperCase()} (entrée ${t.entryPrice} / sortie ${price})`);
      }
    }
    return changed;
  }

  function applyConfirmedTrade(asset, TF, cs, price, lastT, fresh, isManual = false) {
    if (!isManual && (!fresh || (cs.v !== 'CALL' && cs.v !== 'PUT'))) return;
    const dir = cs.v;
    const key = `${asset}|${TF}|${lastT}|${dir}`;
    if (!isManual && S._tradeSent[key]) return;
    if (!isManual) S._tradeSent[key] = true;

    const period = cs.exp || tradePeriod({}, dir);
    const durMs = (period === '5m' ? 300 : 60) * 1000;
    const now = srvNowMs();
    let clicked = false;
    if (S.autoTrade || isManual) clicked = clickTrade(dir);
    S._trades.unshift({
      asset, direction: dir, period, entryPrice: price, entryTimeMs: now, expiresAtMs: now + durMs,
      status: 'open', clicked, source: isManual ? 'manuel' : 'auto'
    });
    if (S._trades.length > 20) S._trades.length = 20;
    console.log(`%c[qxSig] TRANSACTION CONFIRMÉE SUR GRAPHIQUE : ${dir} ${asset} [${period}] @ ${price}${clicked ? ' (bouton Quotex cliqué)' : S.autoTrade ? ' (bouton Quotex non cliqué — suivi visuel actif)' : ' (suivi visuel)'}`, 'font-weight:bold');
  }

  // ================================================================ test synchronisé à 00 pile sur l'ouverture
  function run(onOpen = false, src = '') {
    const a = S.lock || S.active; if (!a) return;
    let all = candlesFor(a, S.TF); if (all.length > S.MAXC) all = all.slice(-S.MAXC);
    if (all.length < 3) { S.last = { asset: a, TF: S.TF, time: new Date(), n: all.length, wait: true, onOpen, src }; render(); return; }
    const curOpen = Math.floor((srvNowMs() / 1000) / S.TF) * S.TF;
    const hasOpen = all[all.length - 1].t >= curOpen;
    const closed = hasOpen ? all.slice(0, -1) : all;
    if (closed.length < 2) { S.last = { asset: a, TF: S.TF, time: new Date(), n: closed.length, wait: true, onOpen, src }; render(); return; }
    const lastT = closed[closed.length - 1].t, key = a + '|' + S.TF;
    const pk = lastT + '|' + closed.length;
    const curPrice = all[all.length - 1].c;
    settleTrades(a, curPrice);
    if (S._proc[key] !== pk) {
      const r = evalAll(closed); const sig = {};
      for (const id of IDS) {
        const d = r.sig[id] || 0; if (!d) continue; const ck = key + '|' + id, c0 = S.cool[ck];
        const same = c0 && c0.d === d && c0.t === lastT;
        if (!same && c0 && c0.d === d && (lastT - c0.t) < C.cooldown * S.TF) continue;
        S.cool[ck] = { d, t: lastT }; sig[id] = d; if (!same) (r.fresh || (r.fresh = {}))[id] = 1;
      }
      S._proc[key] = pk; S._confCache[key] = { sig, state: r.state, note: r.note };
      const cs = consensus(sig);
      for (const id in sig) if (r.fresh && r.fresh[id]) console.log(`%c[qxSig] OUVERTURE 00 PILE ${a} TF${S.TF}s S${id} ${STR[id][0]} => ${sig[id] === 1 ? 'CALL' : 'PUT'} [Période ${stratExp(id)}]${r.note[id] ? ' | ' + r.note[id] : ''}`, 'font-weight:bold');
      if (cs.v !== 'aucun' && r.fresh) console.log(`%c[qxSig] CONSENSUS ${a} => ${cs.v} (${cs.b} CALL / ${cs.s} PUT) | Période transaction : ${cs.exp}`, 'font-weight:bold;font-size:14px');
      applyConfirmedTrade(a, S.TF, cs, curPrice, lastT, r.fresh, false);
      notifyTelegram(a, S.TF, cs, sig, r.note, curPrice, lastT, r.fresh);
      notifyVoice(a, S.TF, cs, lastT, r.fresh);
    }
    const conf = S._confCache[key] || { sig: {}, state: evalAll(closed).state, note: {} }, prov = evalAll(all);
    S.last = { asset: a, TF: S.TF, time: new Date(), price: curPrice, n: closed.length, conf, prov, ready: IDS.filter(id => NEED[id] <= closed.length).length, onOpen, src };
    if (onOpen) flashBorder();
    render();
  }

  function refreshProv() {
    const a = S.lock || S.active; if (!a || !S.last || S.last.wait || S.last.asset !== a || S.last.TF !== S.TF) return;
    const all = candlesFor(a, S.TF).slice(-S.MAXC); if (all.length < 3) return;
    S.last.prov = evalAll(all); S.last.price = all[all.length - 1].c; S.last.time = new Date(); render();
  }

  // ================================================================ mise à jour automatique des stratégies (toutes les 2 minutes)
  function fullRefresh(src = 'auto 2 min') {
    const a = S.lock || S.active;
    S._lastRefreshMs = Date.now();
    S._nextRefreshMs = S._lastRefreshMs + S.refreshEverySec * 1000;
    if (!a) return;
    // invalide le cache de la dernière évaluation => recalcul complet de toutes les stratégies.
    // Les signaux déjà envoyés ne sont pas renvoyés (cooldown + _tgSent + _tradeSent).
    const key = a + '|' + S.TF;
    delete S._proc[key];
    delete S._confCache[key];
    run(false, src);
    console.log('[qxSig] mise à jour des stratégies (' + src + ') à ' + new Date().toLocaleTimeString());
  }
  S._nextRefreshMs = Date.now() + S.refreshEverySec * 1000;
  const refreshTimer = setInterval(() => {
    if (S.autoRefresh && Date.now() >= S._nextRefreshMs) fullRefresh();
  }, 1000);

  scheduleNextOpen();
  const uiTimer = setInterval(() => {
    const b = bucketNow();
    if (b > lastBucket) { lastBucket = b; provT = Date.now(); scheduleNextOpen(); run(true, '00 pile'); }
    else { updateHeader(); if (Date.now() - provT > Math.max(5, S.TF / 6) * 1000) { provT = Date.now(); refreshProv(); } }
  }, 250);

  // ================================================================ surveillance graphique (DOM, TF et <canvas>)
  const toSec = txt => { const t = String(txt).trim().toLowerCase(); const m = t.match(/^(\d+)\s*(s|sec|m|min|h|d)$/) || t.match(/^([smhd])\s*(\d+)$/); if (!m) return null; let n, u; if (/\d/.test(m[1])) { n = +m[1]; u = m[2]; } else { u = m[1]; n = +m[2]; } const sec = n * ({ s: 1, sec: 1, m: 60, min: 60, h: 3600, d: 86400 }[u]); return VALID_TF.includes(sec) ? sec : null; };
  const isActive = el => { for (let e = el, k = 0; e && k < 4; e = e.parentElement, k++) { if (/active|selected|current|checked/i.test(e.className && e.className.toString())) return true; if (e.getAttribute && e.getAttribute('aria-selected') === 'true') return true; } return false; };
  function setTFauto(sec, src) { if (!S.tfAuto || !sec || sec === S.TF) return; S.TF = sec; lastBucket = bucketNow(); scheduleNextOpen(); console.log('[qxSig] bascule de timeframe détectée (' + src + ') : ' + sec + 's'); run(false, 'TF ' + sec + 's'); sched(); }
  const candidates = () => { const out = []; document.querySelectorAll('button,div,span,li,a,p').forEach(el => { if (el.children.length || (el.closest && el.closest('#qx-box'))) return; const tx = el.textContent.trim(); if (tx.length > 8) return; const s = toSec(tx); if (s) out.push({ el, s, tx, active: isActive(el) }); }); return out; };
  function detectDom() {
    if (!S.tfAuto) return;
    if (S.tfSelector) { const el = document.querySelector(S.tfSelector); if (el) { const s = toSec(el.textContent); if (s) setTFauto(s, 'sélecteur'); return; } }
    const set = [...new Set(candidates().filter(x => x.active).map(x => x.s))];
    if (set.length === 1) setTFauto(set[0], 'DOM');
  }
  const domTimer = setInterval(detectDom, 1000);
  const onClick = ev => { if (!S.tfAuto) return; for (let e = ev.target, k = 0; e && k < 4; e = e.parentElement, k++) { if (e.id === 'qx-box') return; const tx = (e.textContent || '').trim(); if (tx.length <= 8) { const s = toSec(tx); if (s) { setTFauto(s, 'clic'); break; } } } setTimeout(detectDom, 400); };
  if (document.addEventListener) document.addEventListener('click', onClick, true);
  let mo = null, moPending = false;
  try { mo = new MutationObserver(() => { if (moPending) return; moPending = true; setTimeout(() => { moPending = false; detectDom(); }, 300); }); mo.observe(document.body, { subtree: true, attributes: true, attributeFilter: ['class', 'aria-selected'] }); } catch (e) {}
  S.detectNow = () => { const c = candidates().map(x => ({ texte: x.tx, secondes: x.s, actif: x.active, classe: (x.el.className || '').toString().slice(0, 60) })); console.table(c); return c; };
  S.tfSelector = null;

  // ================================================================ lecture des messages WebSocket
  function extract(x, out, inHist) {
    if (Array.isArray(x)) { if (x.length >= 3 && typeof x[0] === 'string' && typeof x[1] === 'number' && x[1] > 1e9 && x[1] < 4e9 && typeof x[2] === 'number') out.push([x[0], x[1], x[2], !inHist]); else x.forEach(y => extract(y, out, inHist)); }
    else if (x && typeof x === 'object') {
      if (typeof x.asset === 'string' && Array.isArray(x.history)) x.history.forEach(r => { if (Array.isArray(r) && typeof r[0] === 'number' && r[0] > 1e9 && typeof r[1] === 'number') out.push([x.asset, r[0], r[1], false]); });
      if (typeof x.asset === 'string' && Array.isArray(x.candles)) addHist(x.asset, typeof x.period === 'number' ? x.period : 0, x.candles);
      if (typeof x.period === 'number') setTFauto(VALID_TF.includes(x.period) ? x.period : null, 'message');
      Object.values(x).forEach(y => extract(y, out, inHist || Array.isArray(x.history)));
    }
  }
  function handleText(txt) { if (S.raw.length < 30) S.raw.push(txt.slice(0, 300)); const i = txt.search(/[\[{]/); if (i < 0) return; let j; try { j = JSON.parse(txt.slice(i)); } catch (e) { return; } const out = []; extract(j, out, false); out.forEach(([a, t, p, live]) => { const fresh = !S.ticks[a]; addTick(a, t, p, live); if (fresh) S._dirty = true; }); if (S._dirty) sched(); }
  const handleData = d => { if (typeof d === 'string') handleText(d); else if (d instanceof ArrayBuffer) handleText(new TextDecoder().decode(d)); else if (typeof Blob !== 'undefined' && d instanceof Blob) d.text().then(handleText); };
  const seen = new WeakSet(), origSend = WebSocket.prototype.send, OrigWS = window.WebSocket;
  WebSocket.prototype.send = function (...a) {
    if (!seen.has(this)) { seen.add(this); this.addEventListener('message', ev => handleData(ev.data)); console.log('[qxSig] socket branché', this.url); }
    try { if (typeof a[0] === 'string') { const m = a[0].match(/"period"\s*:\s*(\d+)/); if (m) setTFauto(VALID_TF.includes(+m[1]) ? +m[1] : null, 'requête'); } } catch (e) {}
    return origSend.apply(this, a);
  };
  window.WebSocket = new Proxy(OrigWS, { construct(t, args) { const ws = new t(...args); seen.add(ws); ws.addEventListener('message', ev => handleData(ev.data)); return ws; } });

  // ================================================================ panneau transparent centré sur le graphique
  const box = document.createElement('div'); box.id = 'qx-box';
  // style « terminal renseignement » : vert phosphore, lignes de balayage, coins cadrés, fond transparent
  const styleEl = document.createElement('style'); styleEl.id = 'qx-style';
  styleEl.textContent = `
    @keyframes qxBlink { 0%,49% { opacity:1 } 50%,100% { opacity:0 } }
    @keyframes qxScan { 0% { background-position:0 0 } 100% { background-position:0 4px } }
    #qx-box { scrollbar-width:thin; scrollbar-color:rgba(0,255,120,.4) transparent; }
    #qx-box::-webkit-scrollbar { width:4px } #qx-box::-webkit-scrollbar-thumb { background:rgba(0,255,120,.4) }
    #qx-box .qx-cur { animation:qxBlink 1s steps(1) infinite; color:#00ff9c }
    #qx-box .qx-c { position:absolute; width:12px; height:12px; border:2px solid #00ff9c; filter:drop-shadow(0 0 3px #00ff9c); pointer-events:none }
    #qx-box .qx-c1 { top:-1px; left:-1px; border-right:0; border-bottom:0 }
    #qx-box .qx-c2 { top:-1px; right:-1px; border-left:0; border-bottom:0 }
    #qx-box .qx-c3 { bottom:-1px; left:-1px; border-right:0; border-top:0 }
    #qx-box .qx-c4 { bottom:-1px; right:-1px; border-left:0; border-top:0 }
    #qx-box .qx-ban { color:#00ff9c; font-weight:bold; letter-spacing:2px; font-size:10px; border-bottom:1px solid rgba(0,255,120,.35); padding-bottom:3px; margin-bottom:4px; display:flex; justify-content:space-between }
    #qx-box .qx-ban i { color:#ff3b4f; font-style:normal }
    #qx-box table td { padding:0 3px }
  `;
  document.head.appendChild(styleEl);
  const SCAN = 'repeating-linear-gradient(0deg, rgba(0,255,120,0.06) 0px, rgba(0,255,120,0.06) 1px, transparent 1px, transparent 3px)';
  box.style.cssText = [
    'position:fixed',
    'left:50%',
    'top:50%',
    'transform:translate(-50%,-50%)',
    'z-index:2147483647',
    `background-color:rgba(0,14,7,${S.opacity})`,
    `background-image:${SCAN}`,
    `backdrop-filter:blur(${S.blurPx}px)`,
    `-webkit-backdrop-filter:blur(${S.blurPx}px)`,
    'border:1px solid rgba(0,255,120,0.35)',
    'color:#9dffc8',
    'text-shadow:0 0 4px rgba(0,255,120,0.55), 0 1px 3px rgba(0,0,0,0.9)',
    "font:11px/1.45 'Courier New', Consolas, monospace",
    'letter-spacing:0.3px',
    'padding:10px 14px',
    'border-radius:2px',
    'width:370px',
    'max-height:66vh',
    'overflow:auto',
    'box-shadow:0 0 18px rgba(0,255,120,0.18), inset 0 0 22px rgba(0,255,120,0.06)',
    `pointer-events:none`,
    'transition:border-color 0.25s ease'
  ].join(';');
  box.innerHTML = '<i class="qx-c qx-c1"></i><i class="qx-c qx-c2"></i><i class="qx-c qx-c3"></i><i class="qx-c qx-c4"></i>'
    + '<div class="qx-ban"><span>▌QXSIG // SIGINT v6.2</span><i>● TRÈS SECRET</i></div>'
    + '<div><span style="color:#3f9f68">&gt;</span> <span id="qx-h">surveillance graphique…</span><span class="qx-cur">█</span></div>'
    + '<div id="qx-ctrl" style="pointer-events:auto;margin:5px 0 3px;padding:4px 0;border-top:1px dashed rgba(0,255,120,0.3);border-bottom:1px dashed rgba(0,255,120,0.3);display:flex;flex-direction:column;gap:4px;font-size:10px"></div><div id="qx-b"></div>';
  document.body.appendChild(box);

  function findChartEl() {
    let best = null, bestArea = 0;
    document.querySelectorAll('canvas').forEach(cv => {
      const r = cv.getBoundingClientRect();
      if (r.width > 200 && r.height > 150) {
        const area = r.width * r.height;
        if (area > bestArea) { bestArea = area; best = cv; }
      }
    });
    return best;
  }
  function positionBox() {
    const cv = findChartEl();
    if (cv) {
      const r = cv.getBoundingClientRect();
      box.style.left = Math.round(r.left + r.width / 2) + 'px';
      box.style.top = Math.round(r.top + r.height / 2) + 'px';
    } else {
      box.style.left = '50%';
      box.style.top = '50%';
    }
    box.style.transform = 'translate(-50%, -50%)';
  }
  let ro = null, observedCanvas = null;
  function syncChartObserver() {
    positionBox();
    const cv = findChartEl();
    if (cv && cv !== observedCanvas && typeof ResizeObserver !== 'undefined') {
      if (ro) ro.disconnect();
      ro = new ResizeObserver(positionBox);
      ro.observe(cv);
      observedCanvas = cv;
    }
  }
  syncChartObserver();
  window.addEventListener('resize', positionBox);
  const posTimer = setInterval(syncChartObserver, 1500);

  let flashT = null;
  function flashBorder() {
    clearTimeout(flashT);
    box.style.borderColor = 'rgba(0, 255, 156, 0.95)';
    flashT = setTimeout(() => { box.style.borderColor = 'rgba(0,255,120,0.35)'; }, 750);
  }

  const vt = v => v === 1 ? '<span style="color:#00ff9c;font-weight:bold">CALL</span>' : v === -1 ? '<span style="color:#ff3b4f;font-weight:bold">PUT</span>' : '<span style="color:#3f9f68">-</span>';
  const ct = c => c === 'CALL' ? '#00ff9c' : c === 'PUT' ? '#ff3b4f' : '#5fd68f';
  const fmtMs = d => d.toLocaleTimeString() + '.' + String(d.getMilliseconds()).padStart(3, '0');
  const btnStyle = (active, accent) => `cursor:pointer;border:1px solid ${active ? accent : 'rgba(0,255,120,0.28)'};background:${active ? 'rgba(0,255,120,0.18)' : 'rgba(0,20,10,0.5)'};color:${active ? '#eafff3' : '#5fd68f'};border-radius:1px;padding:1px 6px;font:10px/1.4 'Courier New',monospace;text-transform:uppercase;`;
  function updateCtrl() {
    const el = document.getElementById('qx-ctrl'); if (!el) return;
    const tfs = [['auto', 'Auto'], [15, '15s'], [30, '30s'], [60, '1m'], [300, '5m'], [900, '15m']];
    const exps = [['auto', 'Auto'], ['1m', '1m'], ['5m', '5m']];
    const tfBtns = tfs.map(([v, lbl]) => {
      const act = v === 'auto' ? S.tfAuto : (!S.tfAuto && S.TF === v);
      return `<button type="button" data-qx-tf="${v}" style="${btnStyle(act, '#00ff9c')}">${lbl}</button>`;
    }).join('');
    const expBtns = exps.map(([v, lbl]) => `<button type="button" data-qx-exp="${v}" style="${btnStyle(S.expMode === v, '#00e5ff')}">${lbl}</button>`).join('');
    const autoBtn = `<button type="button" data-qx-autotrade="1" style="${btnStyle(S.autoTrade, '#f59e0b')}">Auto-exec : ${S.autoTrade ? 'ON' : 'OFF'}</button>`;
    const refBtn = `<button type="button" data-qx-refresh="1" style="${btnStyle(S.autoRefresh, '#a78bfa')}">Maj ${S.refreshEverySec >= 60 ? Math.round(S.refreshEverySec / 60) + 'min' : S.refreshEverySec + 's'} : ${S.autoRefresh ? 'ON' : 'OFF'}</button>`;
    const voiceBtn = `<button type="button" data-qx-voice="1" style="${btnStyle(S.voiceEnabled, '#f472b6')}">Voix : ${S.voiceEnabled ? 'ON' : 'OFF'}</button>`;
    const detBtn = `<button type="button" data-qx-detect="1" style="${btnStyle(false, '#e879f9')}">Détecter BUY/SELL</button>`;
    const tCall = `<button type="button" data-qx-test="CALL" style="${btnStyle(false, '#00ff9c')}">Test CALL</button>`;
    const tPut = `<button type="button" data-qx-test="PUT" style="${btnStyle(false, '#ff3b4f')}">Test PUT</button>`;
    el.innerHTML = `<div style="display:flex;align-items:center;gap:4px;flex-wrap:wrap"><span style="color:#3f9f68;min-width:34px">TF&gt;</span>${tfBtns}</div><div style="display:flex;align-items:center;gap:4px;flex-wrap:wrap"><span style="color:#3f9f68;min-width:34px">PER&gt;</span>${expBtns}${autoBtn}${refBtn}${voiceBtn}</div><div style="display:flex;align-items:center;gap:4px;flex-wrap:wrap"><span style="color:#3f9f68;min-width:34px">BTN&gt;</span>${detBtn}${tCall}${tPut}</div>`;
  }
  updateCtrl();
  const onBoxClick = ev => {
    const btn = ev.target && ev.target.closest ? ev.target.closest('button') : null;
    if (!btn) return;
    const tfAttr = btn.getAttribute('data-qx-tf');
    if (tfAttr) {
      ev.stopPropagation();
      if (tfAttr === 'auto') S.autoTF();
      else S.setTF(Number(tfAttr));
      return;
    }
    const expAttr = btn.getAttribute('data-qx-exp');
    if (expAttr) {
      ev.stopPropagation();
      S.setExp(expAttr);
      return;
    }
    if (btn.getAttribute('data-qx-autotrade')) {
      ev.stopPropagation();
      S.setAutoTrade(!S.autoTrade);
      return;
    }
    if (btn.getAttribute('data-qx-voice')) {
      ev.stopPropagation();
      S.voiceToggle(!S.voiceEnabled);
      return;
    }
    if (btn.getAttribute('data-qx-detect')) {
      ev.stopPropagation();
      S.detectButtons();
      return;
    }
    const testAttr = btn.getAttribute('data-qx-test');
    if (testAttr) {
      ev.stopPropagation();
      S.testClick(testAttr);
      return;
    }
    if (btn.getAttribute('data-qx-refresh')) {
      ev.stopPropagation();
      S.setRefresh(S.refreshEverySec, !S.autoRefresh);
    }
  };
  box.addEventListener('click', onBoxClick);

  function updateHeader() {
    const a = S.lock || S.active, h = document.getElementById('qx-h'); if (!h) return;
    const remSec = Math.max(0, Math.ceil(S.TF - ((srvNowMs() / 1000) % S.TF)));
    const fm = x => x >= 3600 ? Math.floor(x / 3600) + 'h' + String(Math.floor(x % 3600 / 60)).padStart(2, '0') : String(Math.floor(x / 60)).padStart(2, '0') + ':' + String(x % 60).padStart(2, '0');
    const syncLbl = S._srvSynced ? `Δ${S._srvOffsetMs >= 0 ? '+' : ''}${S._srvOffsetMs}ms` : 'horloge';
    const rf = S.autoRefresh ? ' | maj dans ' + Math.max(0, Math.ceil((S._nextRefreshMs - Date.now()) / 1000)) + 's' : '';
    h.textContent = (a ? `${a} | TF ${S.TF >= 60 ? S.TF / 60 + 'm' : S.TF + 's'}${S.tfAuto ? ' (auto)' : ' (manuel)'} | 00 dans ${fm(remSec)} (${syncLbl})` : `TF ${S.TF >= 60 ? S.TF / 60 + 'm' : S.TF + 's'}${S.tfAuto ? ' (auto)' : ' (manuel)'} — en attente de ticks…`) + rf;
    if (a && S.last && !S.last.wait) { if (settleTrades(a, S.last.price)) render(); }
  }
  function render() {
    updateCtrl();
    updateHeader();
    const r = S.last, b = document.getElementById('qx-b'); if (!r || !b) return;
    if (r.wait) { b.innerHTML = `<div style="color:#ffe600">TF ${r.TF}s : ${r.n} bougie(s) — surveillance graphique active (test à 00 pile dès 3 bougies)</div>`; return; }
    const cc = consensus(r.conf.sig), cp = consensus(r.prov.sig);
    const bull = Object.values(r.conf.state).filter(x => x === 1).length, bear = Object.values(r.conf.state).filter(x => x === -1).length;
    let h = `<div>${fmtMs(r.time)}${r.onOpen ? ' [00 pile]' : ''} | prix ${r.price} | ${r.n} bougies fermées</div>`;
    h += `<div>CONSENSUS ≥${C.minVotes} : <b style="color:${ct(cc.v)};font-size:15px">${cc.v}</b> (${cc.b}↑ ${cc.s}↓) &nbsp; PROV : <b style="color:${ct(cp.v)}">${cp.v}</b></div>`;
    h += `<div>Période transaction : <b style="color:#00e5ff">${cc.v !== 'aucun' ? cc.exp : cp.v !== 'aucun' ? cp.exp : tradePeriod(r.conf.sig, 'aucun')}</b>${S.expMode !== 'auto' ? ' (manuel)' : ' (auto)'}</div>`;
    const tgStat = !S.tgEnabled ? 'inactif' : (S.tgToken && S.tgChatId) ? 'actif' : S.tgProxyUrl ? 'relais' : 'configurer setTelegram()';
    h += `<div style="color:#5fd68f">${r.ready}/${IDS.length} stratégies prêtes | TG @momotrad_bot : ${tgStat}</div>`;
    h += `<div style="color:#5fd68f">États : ${bull} haussiers / ${bear} baissiers sur ${Object.keys(r.conf.state).length} testées</div>`;
    const bC = S._btnCache.CALL && S._btnCache.CALL.isConnected, bP = S._btnCache.PUT && S._btnCache.PUT.isConnected;
    h += `<div style="color:#5fd68f">Boutons Quotex : CALL ${S.callSelector ? 'sél.' : bC ? 'détecté' : '?'} | PUT ${S.putSelector ? 'sél.' : bP ? 'détecté' : '?'} | clic démo seul : ${S.demoOnly ? 'oui' : 'non'}</div>`;
    const curTrades = S._trades.slice(0, 3);
    if (curTrades.length) {
      const now = srvNowMs();
      h += '<div style="margin-top:4px;padding-top:4px;border-top:1px solid rgba(0,255,120,0.22);font-size:11px">' + curTrades.map(t => {
        const rem = Math.max(0, Math.ceil((t.expiresAtMs - now) / 1000));
        const stColor = t.status === 'win' ? '#00ff9c' : t.status === 'loss' ? '#ff3b4f' : '#00e5ff';
        const stLbl = t.status === 'open' ? String(Math.floor(rem / 60)).padStart(2, '0') + ':' + String(rem % 60).padStart(2, '0') : t.status.toUpperCase();
        return `<div><b style="color:${ct(t.direction)}">${t.direction}</b> ${t.asset} [${t.period}] @ ${t.entryPrice} · <b style="color:${stColor}">${stLbl}</b></div>`;
      }).join('') + '</div>';
    }
    const ids = IDS.filter(id => (r.conf.sig[id] || r.prov.sig[id]));
    h += ids.length ? '<table style="width:100%;margin-top:4px"><tr style="color:#5fd68f"><td>signal</td><td>pér.</td><td>conf.</td><td>prov.</td></tr>' + ids.map(id => `<tr><td>S${id} ${STR[id][0]}</td><td style="color:#00e5ff">${stratExp(id)}</td><td>${vt(r.conf.sig[id] || 0)}</td><td>${vt(r.prov.sig[id] || 0)}</td></tr>`).join('') + '</table>' : '<div style="color:#3f9f68;margin-top:4px">aucun signal de changement d\'état</div>';
    b.innerHTML = h;
  }

  S.addTick = addTick; S.addHist = addHist; S.candlesFor = candlesFor; S.run = run; S.STR = STR; S.evalAll = evalAll; S.build = build;
  S.center = positionBox;
  S.detectButtons = detectButtons; S.clearOutline = clearOutline; S.scanButtons = scanTradeButtons;
  S.setButtons = (callSel, putSel) => { S.callSelector = callSel || null; S.putSelector = putSel || null; S._btnCache = {}; console.log('[qxSig] sélecteurs boutons : CALL =', S.callSelector, '| PUT =', S.putSelector); render(); };
  S.setDemoOnly = on => { S.demoOnly = !!on; console.log('[qxSig] clic limité aux pages "demo" =', S.demoOnly); render(); };
  S.testClick = dir => { const d = dir === 'PUT' ? 'PUT' : 'CALL'; const ok = clickTrade(d); console.log('[qxSig] test clic ' + d + ' =>', ok ? 'envoyé (vérifiez qu\'un trade démo s\'est ouvert)' : 'non envoyé'); return ok; };
  S.setTelegram = (token, chatId) => { S.tgToken = String(token || '').trim(); S.tgChatId = String(chatId || '').trim(); S.tgEnabled = true; console.log('[qxSig] Telegram @momotrad_bot configuré'); render(); };
  S.setProxy = url => { S.tgProxyUrl = String(url || '').replace(/\/+$/, ''); console.log('[qxSig] relais Telegram =', S.tgProxyUrl); render(); };
  S.tgToggle = on => { S.tgEnabled = !!on; console.log('[qxSig] Telegram', S.tgEnabled ? 'activé' : 'désactivé'); render(); };
  S.tgTest = () => sendTelegramText('<b>qxSig v6.2</b> · Test connexion @momotrad_bot réussi (déclenchement 00 pile).', { type: 'test' });
  S.setExp = m => { S.expMode = (m === '1m' || m === '5m') ? m : 'auto'; console.log('[qxSig] période transaction =', S.expMode); render(); };
  S.setStratExp = (id, exp) => { if (exp === '1m' || exp === '5m') S._expOverrides[id] = exp; else delete S._expOverrides[id]; render(); };
  S.setAutoTrade = on => {
    S.autoTrade = !!on;
    console.log('[qxSig] exécution auto sur Quotex =', S.autoTrade ? 'ON' : 'OFF');
    if (S.autoTrade) {
      if (S.demoOnly && !isDemo()) console.warn('[qxSig] ATTENTION : URL sans "demo" => aucun clic ne sera envoyé tant que demoOnly = true');
      if (!findTradeButton('CALL') || !findTradeButton('PUT')) console.warn('[qxSig] boutons non trouvés — lancez __qxSig.detectButtons() ou __qxSig.setButtons(...)');
    }
    render();
  };
  S.setRefresh = (sec, on = true) => { S.refreshEverySec = Math.max(10, Number(sec) || 120); S.autoRefresh = !!on; S._nextRefreshMs = Date.now() + S.refreshEverySec * 1000; console.log('[qxSig] maj auto des stratégies =', S.autoRefresh ? 'toutes les ' + S.refreshEverySec + 's' : 'OFF'); render(); };
  S.refreshNow = () => fullRefresh('manuel');
  S.voiceToggle = on => { S.voiceEnabled = !!on; if (S.voiceEnabled) { unlockAudio(); speak('Voix activée'); } else { try { speechSynthesis.cancel(); } catch (e) {} } console.log('[qxSig] confirmation vocale', S.voiceEnabled ? 'activée' : 'désactivée'); render(); };
  S.beepToggle = on => { S.beepEnabled = !!on; console.log('[qxSig] bip sonore', S.beepEnabled ? 'activé' : 'désactivé'); };
  S.setVoice = (lang, rate, volume) => { if (lang) S.voiceLang = String(lang); if (rate) S.voiceRate = Math.min(2, Math.max(0.5, Number(rate) || 1)); if (volume !== undefined) S.voiceVolume = Math.min(1, Math.max(0, Number(volume))); console.log('[qxSig] voix =', S.voiceLang, '| vitesse', S.voiceRate, '| volume', S.voiceVolume); };
  S.voiceTest = () => { unlockAudio(); beep('CALL'); setTimeout(() => speak('Test de la confirmation vocale. Signal confirmé. Achat, hausse. E U R, U S D. Période une minute. 3 stratégies d\'accord.'), 350); };
  S.voices = () => { const v = (window.speechSynthesis ? speechSynthesis.getVoices() : []).map(x => ({ nom: x.name, langue: x.lang })); console.table(v); return v; };
  S.applyTrade = dir => { const a = S.lock || S.active; if (!a || !S.last) return; const d = dir === 'PUT' ? 'PUT' : 'CALL'; const p = S.last.prov ? consensus(S.last.prov.sig).exp : tradePeriod({}, d); applyConfirmedTrade(a, S.TF, { v: d, exp: p }, S.last.price, Math.floor(srvNowMs() / 1000), { manual: 1 }, true); render(); };
  S.setOpacity = a => { S.opacity = Math.min(0.95, Math.max(0.05, Number(a) || 0.28)); box.style.backgroundColor = `rgba(0,14,7,${S.opacity})`; };
  S.clickThrough = on => { S.isClickThrough = !!on; box.style.pointerEvents = S.isClickThrough ? 'none' : 'auto'; };
  S.only = ids => { S._only = ids && ids.length ? ids : null; console.log('[qxSig] stratégies actives :', S._only || 'toutes'); run(false, 'filtre'); };
  S.sample = () => { console.log(S.raw); return S.raw; };
  S.setTF = s => { S.TF = s; S.tfAuto = false; lastBucket = bucketNow(); scheduleNextOpen(); updateCtrl(); updateHeader(); console.log('[qxSig] TF manuel =', s, 's (autoTF() pour revenir à la détection)'); run(false, 'TF manuel'); };
  S.autoTF = () => { S.tfAuto = true; updateCtrl(); updateHeader(); detectDom(); console.log('[qxSig] détection auto du TF réactivée'); run(false, 'TF auto'); };
  S.setAsset = a => { S.lock = a || null; console.log('[qxSig] actif verrouillé :', S.lock); run(false, 'actif'); };
  S.stop = () => {
    clearTimeout(openTimeout); clearInterval(uiTimer); clearInterval(domTimer); clearInterval(posTimer); clearInterval(refreshTimer); clearTimeout(flashT);
    clearOutline();
    window.removeEventListener('resize', positionBox);
    box.removeEventListener('click', onBoxClick);
    unlockEvents.forEach(ev => document.removeEventListener(ev, unlockAudio, true));
    try { if (window.speechSynthesis) speechSynthesis.cancel(); } catch (e) {}
    try { if (audioCtx) audioCtx.close(); } catch (e) {}
    if (ro) ro.disconnect();
    if (document.removeEventListener) document.removeEventListener('click', onClick, true);
    if (mo) mo.disconnect();
    WebSocket.prototype.send = origSend; window.WebSocket = OrigWS;
    box.remove(); try { styleEl.remove(); } catch (e) {} delete window.__qxSig; console.log('[qxSig] arrêté');
  };
  console.log('[qxSig v6.2] surveillance graphique active — ' + IDS.length + ' stratégies déclenchées à 00 pile, confirmation à ≥' + C.minVotes + ' stratégies, maj auto toutes les ' + S.refreshEverySec + 's. Boutons : lancez __qxSig.detectButtons() puis __qxSig.testClick("CALL").');
})();