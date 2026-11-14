'use strict';
(() => {
  const CLUB = {
    ARS: ['#EF0107', 'Arsenal'], AVL: ['#7A1E46', 'Aston Villa'], BHA: ['#0057B8', 'Brighton'], BOU: ['#DA291C', 'Bournemouth'],
    BRE: ['#E30613', 'Brentford'], CHE: ['#034694', 'Chelsea'], COV: ['#3EA6D6', 'Coventry'], CRY: ['#1B458F', 'Crystal Palace'],
    EVE: ['#003399', 'Everton'], FUL: ['#5b5b5b', 'Fulham'], HUL: ['#F5A12D', 'Hull'], IPS: ['#3A64A3', 'Ipswich'],
    LEE: ['#D4A800', 'Leeds'], LIV: ['#C8102E', 'Liverpool'], MCI: ['#4E9AD3', 'Man City'], MUN: ['#DA291C', 'Man Utd'],
    NEW: ['#3a3a3a', 'Newcastle'], NFO: ['#DD0000', "Nott'm Forest"], SUN: ['#EB172B', 'Sunderland'], TOT: ['#132257', 'Spurs'],
  };
  const CHIP_NAMES = { wildcard: 'Wildcard', freehit: 'Free Hit', bboost: 'Bench Boost', '3xc': 'Triple Captain' };
  const POS = { 1: 'GK', 2: 'DEF', 3: 'MID', 4: 'FWD' };
  const ME_KEY = 'lmbyf-me';
  const $ = (id) => document.getElementById(id);
  let D = null, M = new Map(), me = null, replayTimer = null;

  // Every value from the data is set as text, never as HTML.
  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
    return el;
  }
  const svgNS = 'http://www.w3.org/2000/svg';
  function s(tag, attrs, ...kids) {
    const el = document.createElementNS(svgNS, tag);
    for (const [k, v] of Object.entries(attrs || {})) if (v != null) { if (k === 'text') el.textContent = v; else el.setAttribute(k, v); }
    kids.flat().forEach((k) => k && el.append(k));
    return el;
  }
  const ord = (n) => n + ((n % 100 >= 11 && n % 100 <= 13) ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th'));
  const fmtTime = (iso, o) => new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', ...o }).format(new Date(iso));
  const store = { get: (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } } };
  const player = (el) => D.players[String(el)] || { n: '?', t: '', p: 3, c: 0, gw: 0, s: 'a', news: '' };
  const clubBadge = (code) => code && CLUB[code] ? (() => { const b = h('span', { class: 'badge', text: code }); b.style.background = CLUB[code][0]; return b; })() : null;
  const isMe = (id) => me != null && id === me;
  const half = () => (D.meta.next_gw || D.meta.gw) <= 19 ? 1 : 2;
  const chipsLeft = (m) => Object.keys(CHIP_NAMES).filter((c) => !m.chips[`${c}_${half()}`]);

  const tip = $('tip');
  function showTip(ev, text) {
    tip.textContent = text; tip.hidden = false;
    const x = Math.min(ev.clientX + 12, window.innerWidth - tip.offsetWidth - 8);
    tip.style.left = Math.max(8, x) + 'px'; tip.style.top = Math.max(8, ev.clientY - tip.offsetHeight - 12) + 'px';
  }
  const hideTip = () => { tip.hidden = true; };

  async function copyText(btn, text) {
    try { await navigator.clipboard.writeText(text); btn.textContent = 'Copied'; }
    catch (e) { btn.textContent = 'Copy failed'; }
    setTimeout(() => { btn.textContent = 'Copy for the group'; }, 1600);
  }

  // ---------- header ----------
  function renderHeader() {
    const m = D.meta;
    document.title = `${m.title} HQ`;
    $('title').textContent = m.title;
    $('kicker').textContent = m.live ? `Gameweek ${m.gw} in play` : `Mini-league HQ · ${D.managers.length} managers`;
    $('gw-pill').textContent = m.live ? `GW${m.gw}` : `GW${m.gw} done`;
    $('live-pill').hidden = !m.live;
    const mine = M.get(me);
    $('me-chip').textContent = mine ? `You: ${mine.name}` : 'Pick your team';
    $('deadline').hidden = !m.next_deadline;
    if (m.next_deadline) $('deadline-time').textContent = `GW${m.next_gw} · ${fmtTime(m.next_deadline, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`;
    tick();
    $('updated').textContent = `Last change spotted ${fmtTime(m.updated_at, { weekday: 'short', hour: '2-digit', minute: '2-digit' })}.`;
    $('contact').textContent = m.contact ? `Rather not be on here? Message ${m.contact} and you'll be removed at the next update.` : '';
  }
  function tick() {
    const m = D && D.meta;
    if (!m || !m.next_deadline) return;
    const ms = new Date(m.next_deadline) - Date.now();
    if (ms <= 0) { $('deadline-count').textContent = 'Deadline passed'; return; }
    const d = Math.floor(ms / 864e5), hr = Math.floor(ms / 36e5) % 24, mi = Math.floor(ms / 6e4) % 60;
    $('deadline-count').textContent = d ? `${d}d ${hr}h ${mi}m to go` : `${hr}h ${mi}m to go`;
  }

  // ---------- table ----------
  function renderTable() {
    const rows = D.managers.slice().sort((a, b) => a.rank - b.rank);
    const leader = rows[0];
    const hero = $('hero'); hero.replaceChildren();
    const gwRows = D.managers.slice().sort((a, b) => b.gw_points - a.gw_points);
    const mine = M.get(me);
    hero.append(
      h('div', { class: 'stat feature' }, h('span', { class: 'lab', text: 'Top of the league' }), h('span', { class: 'big', text: leader.name }), h('span', { class: 'sub', text: `${leader.team} · ${leader.total} pts` })),
      h('div', { class: 'stat' }, h('span', { class: 'lab', text: D.meta.live ? `Leading GW${D.meta.gw} (live)` : `Won GW${D.meta.gw}` }), h('span', { class: 'big', text: gwRows[0].name }), h('span', { class: 'sub', text: `${gwRows[0].gw_points} points` })),
    );
    if (mine) {
      const gap = leader.total - mine.total;
      hero.append(h('div', { class: 'stat' }, h('span', { class: 'lab', text: 'You' }), h('span', { class: 'big', text: ord(mine.rank) }), h('span', { class: 'sub', text: gap ? `${gap} behind ${leader.name}` : 'Top of the pile' })));
    } else {
      const spread = rows[1] ? rows[1].total - rows[Math.min(6, rows.length - 1)].total : 0;
      hero.append(h('div', { class: 'stat' }, h('span', { class: 'lab', text: 'The chasing pack' }), h('span', { class: 'big', text: `${spread} pts` }), h('span', { class: 'sub', text: '2nd to 7th place' })));
    }
    $('table-title').textContent = D.meta.live ? `Live table: GW${D.meta.gw}` : 'The table';
    $('table-note').textContent = D.meta.live
      ? 'Live points include provisional bonus and automatic substitutions. Updated about every 10 minutes during matches.'
      : 'Arrows show the move since last gameweek. Dots are first-half chips still in hand.';
    const list = $('standings'); list.replaceChildren();
    rows.forEach((m) => {
      const mv = (m.last_rank ?? m.rank) - m.rank;
      const cap = m.captain ? player(m.captain) : null;
      const left = chipsLeft(m);
      const pips = h('span', { class: 'pips', 'aria-label': `${left.length} chips left` }, [0, 1, 2, 3].map((i) => h('span', { class: 'pip' + (i < left.length ? ' on' : '') })));
      const extra = h('div', { class: 'st-extra' },
        h('span', {}, 'Gap ', h('b', { text: leader.total - m.total ? `-${leader.total - m.total}` : '–' })),
        cap ? h('span', {}, 'Captain ', h('b', { text: `${cap.n} ${cap.gw * (m.active_chip === '3xc' ? 3 : 2)}` })) : null,
        h('span', { title: left.map((c) => CHIP_NAMES[c]).join(', ') || 'None left' }, 'Chips ', pips),
        m.active_chip ? h('span', {}, 'Playing ', h('b', { text: CHIP_NAMES[m.active_chip] })) : null,
        m.subs && m.subs.length ? h('span', {}, 'Auto-subs ', h('b', { text: m.subs.map(([o, i]) => `${player(i).n} for ${player(o).n}`).join(', ') })) : null,
      );
      list.append(h('li', { class: 'st' + (isMe(m.id) ? ' me' : '') },
        h('div', { class: 'st-rank' }, String(m.rank), h('span', { class: 'st-move ' + (mv > 0 ? 'up' : mv < 0 ? 'down' : 'flat'), text: mv > 0 ? `▲${mv}` : mv < 0 ? `▼${-mv}` : '–' })),
        h('div', { class: 'st-who' }, h('div', { class: 'st-team', text: m.team }), h('div', { class: 'st-name' }, m.name, clubBadge(m.club))),
        h('div', { class: 'st-pts' }, h('div', { class: 'st-total', text: m.total }), h('div', { class: 'st-gw', text: `${D.meta.live ? 'Live ' : 'GW '}${m.gw_points}` })),
        extra));
    });
    setupReplay();
  }

  // ---------- season replay (bump chart) ----------
  function setupReplay() {
    const gws = [...new Set(D.history.map((r) => r.gw))].sort((a, b) => a - b);
    const slider = $('replay-slider');
    slider.max = gws.length; slider.min = 1;
    if (!slider.dataset.init) { slider.value = gws.length; slider.dataset.init = '1'; }
    slider.oninput = () => { stopReplay(); drawReplay(+slider.value); };
    $('replay-play').onclick = () => {
      if (replayTimer) { stopReplay(); return; }
      let k = +slider.value >= gws.length ? 1 : +slider.value;
      $('replay-play').textContent = 'Pause';
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const step = () => { slider.value = k; drawReplay(k); if (k >= gws.length) { stopReplay(); return; } k += 1; };
      step();
      replayTimer = setInterval(step, reduce ? 1200 : 700);
    };
    drawReplay(+slider.value);
  }
  function stopReplay() { clearInterval(replayTimer); replayTimer = null; $('replay-play').textContent = 'Play'; }
  function drawReplay(upto) {
    const box = $('replay-chart');
    const gws = [...new Set(D.history.map((r) => r.gw))].sort((a, b) => a - b).slice(0, upto);
    const n = D.managers.length;
    const W = Math.max(box.clientWidth, 320), rowH = 26, H = n * rowH + 30, padL = 26, padR = Math.min(140, W * 0.32);
    const x = (g) => padL + (gws.length > 1 ? (g - gws[0]) / (gws[gws.length - 1] - gws[0]) : 0.5) * (W - padL - padR);
    const y = (r) => 14 + (r - 1) * rowH;
    const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': `League positions from gameweek 1 to ${gws[gws.length - 1]}` });
    for (let r = 1; r <= n; r++) svg.append(s('text', { x: 4, y: y(r) + 4, text: r }));
    gws.forEach((g) => svg.append(s('text', { x: x(g), y: H - 6, 'text-anchor': 'middle', text: gws.length > 12 && g % 2 ? '' : `${g}` })));
    const by = new Map();
    D.history.forEach((r) => { if (gws.includes(r.gw)) { if (!by.has(r.id)) by.set(r.id, []); by.get(r.id).push(r); } });
    const order = [...by.entries()].sort(([a], [b]) => (isMe(a) ? 1 : 0) - (isMe(b) ? 1 : 0));
    order.forEach(([id, pts]) => {
      pts.sort((a, b) => a.gw - b.gw);
      const m = M.get(id);
      const color = isMe(id) ? 'var(--me)' : (m.club && CLUB[m.club] ? CLUB[m.club][0] : 'var(--muted-line)');
      const d = pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.gw).toFixed(1)},${y(p.rank).toFixed(1)}`).join('');
      const path = s('path', { d, fill: 'none', stroke: color, 'stroke-width': isMe(id) ? 4 : 2.2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round', opacity: isMe(id) ? 1 : 0.75 });
      const last = pts[pts.length - 1];
      const dot = s('circle', { cx: x(last.gw), cy: y(last.rank), r: isMe(id) ? 5 : 3.5, fill: color });
      const label = s('text', { x: x(last.gw) + 8, y: y(last.rank) + 4, text: `${m.name} · ${last.total}` });
      if (isMe(id)) { label.style.fill = 'var(--me)'; label.style.fontWeight = '700'; }
      const g = s('g', {}, path, dot, label);
      g.style.cursor = 'pointer';
      g.addEventListener('pointermove', (ev) => showTip(ev, `${m.name} (${m.team}): ${ord(last.rank)} after GW${last.gw}, ${last.total} pts`));
      g.addEventListener('pointerleave', hideTip);
      svg.append(g);
    });
    box.replaceChildren(svg);
    $('replay-gw').textContent = `GW${gws[gws.length - 1]}`;
  }

  // ---------- awards ----------
  const GOOD = new Set(['motw', 'cap_hero', 'transfer_best']);
  function renderAwards() {
    const gws = [...new Set(D.awards.map((a) => a.gw))].sort((a, b) => b - a);
    const sel = $('award-gw');
    const keep = sel.value;
    sel.replaceChildren(...gws.map((g) => new Option(`Gameweek ${g}`, g)));
    if (keep && gws.includes(+keep)) sel.value = keep;
    sel.onchange = drawAwards;
    drawAwards();
    // cabinet
    const tb = $('cabinet').tBodies[0]; tb.replaceChildren();
    const trophy = () => s('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': 2 }, s('path', { d: 'M7 4h10v4a5 5 0 0 1-10 0zM12 13v4M8 20h8' }));
    const cab = D.managers.map((m) => ({
      m, wins: D.awards.filter((a) => a.award === 'motw' && a.id === m.id).length,
      spoons: D.awards.filter((a) => a.award === 'spoon' && a.id === m.id).length,
      best: Math.max(...D.history.filter((r) => r.id === m.id).map((r) => r.points)),
    })).sort((a, b) => b.wins - a.wins || a.spoons - b.spoons || b.best - a.best);
    cab.forEach(({ m, wins, spoons, best }) => {
      const t = h('span', { class: 'trophy up' }); for (let i = 0; i < Math.min(wins, 6); i++) t.append(trophy());
      tb.append(h('tr', { class: isMe(m.id) ? 'me' : '' },
        h('td', { class: 'l' }, `${m.name} `, h('span', { class: 'note', text: m.team })),
        h('td', {}, t, ` ${wins}`), h('td', { class: spoons ? 'down' : '' }, String(spoons)), h('td', {}, String(best))));
    });
    // month
    const months = D.months;
    const cur = months[months.length - 1];
    if (cur) {
      $('month-title').textContent = `Manager of the Month: ${cur.name}`;
      $('month-note').textContent = cur.complete ? `GW${cur.start} to GW${cur.stop}. Final.` : `GW${cur.start} to GW${cur.stop}. Still in play.`;
      const ol = $('month-list'); ol.replaceChildren();
      cur.standings.forEach((r, i) => { const m = M.get(r.id); if (m) ol.append(h('li', { class: isMe(r.id) ? 'me' : '' }, h('span', { class: 'pos', text: i + 1 }), h('span', {}, `${m.name} · ${m.team}`), h('b', { text: r.points }))); });
      const past = $('past-months'); past.replaceChildren();
      months.filter((mo) => mo.complete).reverse().forEach((mo) => {
        const w = M.get(mo.standings[0].id);
        if (w) past.append(h('span', { class: 'past-month' }, `${mo.name}: `, h('b', { text: w.name }), ` (${mo.standings[0].points})`));
      });
    }
  }
  function drawAwards() {
    const g = +$('award-gw').value;
    const grid = $('award-grid'); grid.replaceChildren();
    const byAward = new Map();
    D.awards.filter((a) => a.gw === g).forEach((a) => { if (!byAward.has(a.award)) byAward.set(a.award, []); byAward.get(a.award).push(a); });
    const order = ['motw', 'spoon', 'cap_hero', 'cap_fail', 'bench', 'transfer_best', 'transfer_worst', 'hit_backfired'];
    order.filter((k) => byAward.has(k)).forEach((k) => {
      const list = byAward.get(k);
      const names = list.map((a) => M.get(a.id)?.name).filter(Boolean);
      let who = names.length > 3 ? `${names.length} managers` : names.join(' & ');
      if (names.length > 3 && k === 'cap_fail') who = `${names.length} managers (herd mentality)`;
      const what = names.length > 3 ? `${list[0].text}: ${names.join(', ')}` : list.map((a) => a.text).filter((t, i, arr) => arr.indexOf(t) === i).join(' · ');
      const card = h('div', { class: `award ${GOOD.has(k) ? 'good' : 'bad'}${list.some((a) => isMe(a.id)) ? ' me' : ''}` },
        h('span', { class: 'lab', text: list[0].label }), h('span', { class: 'who', text: who }), h('span', { class: 'what', text: what }));
      const btn = h('button', { class: 'copy', type: 'button', text: 'Copy for the group' });
      btn.addEventListener('click', () => copyText(btn, `GW${g} ${list[0].label}: ${who}. ${what}`));
      card.append(btn);
      grid.append(card);
    });
    if (!grid.children.length) grid.append(h('p', { class: 'note', text: 'Awards appear once a gameweek has finished.' }));
  }

  // ---------- fans ----------
  function renderFans() {
    const box = $('fanbase'); box.replaceChildren();
    const groups = new Map();
    D.managers.forEach((m) => { if (m.club) { if (!groups.has(m.club)) groups.set(m.club, []); groups.get(m.club).push(m); } });
    if (groups.size < 2) {
      box.append(h('div', { class: 'card' }, h('p', { class: 'note', text: `The fanbase league appears once ${D.meta.contact || 'the organiser'} has added which club everyone supports.` })));
    } else {
      const rows = [...groups.entries()].map(([club, ms]) => ({ club, ms, avg: ms.reduce((a, m) => a + m.total, 0) / ms.length, gwAvg: ms.reduce((a, m) => a + m.gw_points, 0) / ms.length }))
        .sort((a, b) => b.avg - a.avg);
      const max = rows[0].avg, min = Math.min(...rows.map((r) => r.avg));
      rows.forEach((r, i) => {
        const el = h('div', { class: 'fan' },
          h('span', { class: 'fan-pos', text: i + 1 }),
          h('span', { class: 'fan-name', text: `${(CLUB[r.club] || [, r.club])[1]} fans` }),
          h('span', { class: 'fan-score' }, Math.round(r.avg).toString(), h('small', { text: `avg · GW ${r.gwAvg.toFixed(1)}` })),
          h('span', { class: 'fan-members', text: r.ms.map((m) => m.name).join(', ') }),
          h('span', { class: 'fan-bar' }, (() => { const b = h('span'); b.style.width = `${max === min ? 100 : 30 + 70 * (r.avg - min) / (max - min)}%`; return b; })()));
        if (CLUB[r.club]) el.style.setProperty('--club', CLUB[r.club][0]);
        box.append(el);
      });
    }
    // results
    const res = $('results'); res.replaceChildren();
    const clubs = [...new Set(['ARS', 'LIV', 'CHE', 'TOT', 'MUN', ...D.managers.map((m) => m.club).filter(Boolean)])];
    const nm = (code) => (D.pltable.find((t) => t.team === code) || { name: code }).name;
    clubs.forEach((c) => {
      const r = D.last_result[c]; if (!r) return;
      const pos = D.pltable.find((t) => t.team === c);
      const verb = r.res === 'W' ? 'beat' : r.res === 'L' ? 'lost to' : 'drew with';
      const line = `${nm(c)} ${verb} ${nm(r.opp)} ${r.gf}-${r.ga} ${r.ha === 'H' ? 'at home' : 'away'}. Now ${ord(pos.pos)} on ${pos.pts} points.`;
      const fans = D.managers.filter((m) => m.club === c).map((m) => m.name);
      const card = h('div', { class: `result ${r.res}` },
        h('span', {}, clubBadge(c), fans.length ? h('span', { class: 'fan-tag', text: `${fans.join(', ')}` }) : null),
        h('span', { class: 'score', text: `${r.ha === 'H' ? c : r.opp} ${r.ha === 'H' ? r.gf : r.ga}-${r.ha === 'H' ? r.ga : r.gf} ${r.ha === 'H' ? r.opp : c}` }),
        h('span', { class: 'line', text: line }));
      const btn = h('button', { class: 'copy', type: 'button', text: 'Copy for the group' });
      btn.addEventListener('click', () => copyText(btn, line));
      card.append(btn);
      res.append(card);
    });
    // PL table
    const fanClubs = new Set(clubs);
    const tb = $('pl').tBodies[0]; tb.replaceChildren();
    D.pltable.forEach((t) => {
      const fans = D.managers.filter((m) => m.club === t.team).map((m) => m.name);
      tb.append(h('tr', { class: t.pos >= 18 ? 'zone' : '' },
        h('td', { text: t.pos }),
        h('td', { class: 'l' }, fanClubs.has(t.team) ? h('b', { text: t.name }) : t.name, fans.length ? h('span', { class: 'fan-tag', text: fans.join(', ') }) : null),
        h('td', { text: t.p }), h('td', { text: t.w }), h('td', { text: t.d }), h('td', { text: t.l }),
        h('td', { text: (t.gd > 0 ? '+' : '') + t.gd }), h('td', {}, h('b', { text: t.pts })), h('td', { class: 'l', text: t.form })));
    });
  }

  // ---------- rivals ----------
  function renderRivals() {
    const a = $('vs-a'), b = $('vs-b');
    const opts = () => D.managers.slice().sort((x, y) => x.rank - y.rank).map((m) => new Option(`${m.rank}. ${m.name} · ${m.team}`, m.id));
    const ka = a.value, kb = b.value;
    a.replaceChildren(...opts()); b.replaceChildren(...opts());
    const sorted = D.managers.slice().sort((x, y) => x.rank - y.rank);
    const defA = me ?? sorted[0].id;
    const defB = sorted.find((m) => m.id !== defA && (me == null || m.rank < M.get(me).rank))?.id ?? sorted.find((m) => m.id !== defA).id;
    a.value = ka || defA; b.value = kb || defB;
    a.onchange = b.onchange = drawRivals;
    drawRivals();
  }
  function drawRivals() {
    const A = M.get(+$('vs-a').value), B = M.get(+$('vs-b').value);
    if (!A || !B) return;
    const ha = D.history.filter((r) => r.id === A.id), hb = D.history.filter((r) => r.id === B.id);
    let wa = 0, wb = 0, dr = 0;
    ha.forEach((r) => { const o = hb.find((q) => q.gw === r.gw); if (!o) return; if (r.points > o.points) wa++; else if (r.points < o.points) wb++; else dr++; });
    const best = (hh) => Math.max(...hh.map((r) => r.points));
    const capTot = (hh) => hh.reduce((x, r) => x + r.captain_pts, 0);
    const row = (k, va, vb, higherWins = true) => {
      const aw = higherWins ? va > vb : va < vb, bw = higherWins ? vb > va : vb < va;
      return h('div', { class: 'vs-row' }, h('span', { class: aw ? 'win' : '', text: va }), h('span', { class: 'k', text: k }), h('span', { class: bw ? 'win' : '', text: vb }));
    };
    const board = $('vs-board'); board.replaceChildren(
      h('div', { class: 'vs-side' }, h('span', { class: 'vs-team', text: A.team }), h('span', { class: 'note', text: A.name }), h('span', { class: 'vs-big', text: A.total })),
      h('div', { class: 'vs-mid' }, `${Math.abs(A.total - B.total)} pts`, h('br'), 'apart'),
      h('div', { class: 'vs-side b' }, h('span', { class: 'vs-team', text: B.team }), h('span', { class: 'note', text: B.name }), h('span', { class: 'vs-big', text: B.total })),
      h('div', { class: 'vs-rows' },
        row('Gameweeks won', wa, wb), row('League position', ord(A.rank), ord(B.rank), false),
        row('Best week', best(ha), best(hb)), row('Captain points', capTot(ha), capTot(hb)),
        row('Points on bench', A.bench_total, B.bench_total, false), row('Hits taken', A.hits ? `-${A.hits}` : 0, B.hits ? `-${B.hits}` : 0),
        row('Chips in hand', chipsLeft(A).length, chipsLeft(B).length),
        dr ? h('p', { class: 'note', text: `${dr} gameweek${dr > 1 ? 's' : ''} drawn.` }) : null));
    $('vs-chart-title').textContent = `${A.name}'s lead over ${B.name}, week by week`;
    drawGap($('vs-chart'), ha, hb, A, B);
    const pa = new Set(A.picks.map((p) => p.el)), pb = new Set(B.picks.map((p) => p.el));
    const list = (title, els) => h('div', { class: 'card' }, h('h3', { class: 'card-title', text: title }),
      h('div', { class: 'chips-list' }, els.length ? els.map((e) => h('span', { class: 'chip', text: `${player(e).n} (${player(e).t})` })) : h('span', { class: 'note', text: 'None' })));
    $('vs-squads').replaceChildren(
      list(`Only ${A.name} has`, [...pa].filter((e) => !pb.has(e))),
      list('Both have', [...pa].filter((e) => pb.has(e))),
      list(`Only ${B.name} has`, [...pb].filter((e) => !pa.has(e))));
  }
  function drawGap(box, ha, hb, A, B) {
    const pts = ha.map((r) => ({ gw: r.gw, d: r.total - (hb.find((q) => q.gw === r.gw)?.total ?? 0) }));
    const W = Math.max(box.clientWidth, 300), H = 200, pl = 34, pr = 10, pt = 10, pb = 22;
    const ext = Math.max(10, ...pts.map((p) => Math.abs(p.d)));
    const x = (g) => pl + (pts.length > 1 ? (g - pts[0].gw) / (pts[pts.length - 1].gw - pts[0].gw) : 0.5) * (W - pl - pr);
    const y = (v) => pt + (1 - (v + ext) / (2 * ext)) * (H - pt - pb);
    const bw = Math.max(4, (W - pl - pr) / pts.length * 0.6);
    const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': `Bar chart of ${A.name}'s points lead over ${B.name} after each gameweek` });
    [-ext, 0, ext].forEach((v) => { svg.append(s('line', { x1: pl, x2: W - pr, y1: y(v), y2: y(v), class: 'grid' })); svg.append(s('text', { x: pl - 6, y: y(v) + 4, 'text-anchor': 'end', text: v > 0 ? `+${v}` : v })); });
    pts.forEach((p) => {
      const r = s('rect', { x: x(p.gw) - bw / 2, width: bw, y: Math.min(y(0), y(p.d)), height: Math.max(1, Math.abs(y(p.d) - y(0))), rx: 2, fill: p.d >= 0 ? 'var(--accent)' : 'var(--down)' });
      r.addEventListener('pointermove', (ev) => showTip(ev, `After GW${p.gw}: ${p.d === 0 ? 'level' : p.d > 0 ? `${A.name} ahead by ${p.d}` : `${B.name} ahead by ${-p.d}`}`));
      r.addEventListener('pointerleave', hideTip);
      svg.append(r);
      if (pts.length <= 20 || p.gw % 2 === 0) svg.append(s('text', { x: x(p.gw), y: H - 6, 'text-anchor': 'middle', text: p.gw }));
    });
    box.replaceChildren(svg);
  }

  // ---------- squads ----------
  function renderSquads() {
    const sel = $('squad-pick');
    const keep = sel.value;
    sel.replaceChildren(...D.managers.slice().sort((a, b) => a.rank - b.rank).map((m) => new Option(`${m.rank}. ${m.name} · ${m.team}`, m.id)));
    sel.value = keep || (me ?? D.managers.slice().sort((a, b) => a.rank - b.rank)[0].id);
    sel.onchange = drawPitch;
    drawPitch();
    // chips
    const hf = half();
    $('chips-note').textContent = hf === 1 ? 'First-half chips expire at the GW19 deadline. Everyone gets a fresh four from GW20.' : 'Second-half chips, usable until GW38.';
    const tb = $('chips').tBodies[0]; tb.replaceChildren();
    D.managers.slice().sort((a, b) => a.rank - b.rank).forEach((m) => {
      tb.append(h('tr', { class: isMe(m.id) ? 'me' : '' }, h('td', { class: 'l', text: m.name }),
        Object.keys(CHIP_NAMES).map((c) => { const g = m.chips[`${c}_${hf}`]; return h('td', {}, g ? h('span', { class: 'used', text: `GW${g}` }) : h('span', { class: 'inhand', text: 'In hand' })); })));
    });
    // transfers
    const g = D.meta.gw;
    $('moves-note').textContent = `Every move made for GW${g}, with what each player scored that week.`;
    const mt = $('moves').tBodies[0]; mt.replaceChildren();
    const all = D.transfers.filter((t) => t.gw === g);
    const ts = all.filter((t) => !['wildcard', 'freehit'].includes(t.chip));
    if (!all.length) mt.append(h('tr', {}, h('td', { class: 'l', colspan: 4, text: 'Nobody made a transfer.' })));
    const chipMoves = new Map();
    all.filter((t) => ['wildcard', 'freehit'].includes(t.chip)).forEach((t) => { const k = `${t.id}|${t.chip}`; if (!chipMoves.has(k)) chipMoves.set(k, []); chipMoves.get(k).push(t); });
    chipMoves.forEach((list, k) => {
      const [id, chip] = k.split('|');
      const net = list.reduce((a, t) => a + t.pts_in - t.pts_out, 0);
      mt.append(h('tr', { class: isMe(+id) ? 'me' : '' }, h('td', { class: 'l', text: `${M.get(+id)?.name} (${CHIP_NAMES[chip]})` }),
        h('td', { class: 'l', colspan: 2, text: `${list.length} changes, in: ${list.map((t) => player(t.el_in).n).join(', ')}` }),
        h('td', { class: net > 0 ? 'up' : net < 0 ? 'down' : '', text: net > 0 ? `+${net}` : net })));
    });
    ts.forEach((t) => {
      const net = t.pts_in - t.pts_out;
      mt.append(h('tr', { class: isMe(t.id) ? 'me' : '' }, h('td', { class: 'l', text: M.get(t.id)?.name }),
        h('td', { class: 'l down', text: `${player(t.el_out).n} ${t.pts_out}` }), h('td', { class: 'l up', text: `${player(t.el_in).n} ${t.pts_in}` }),
        h('td', { class: net > 0 ? 'up' : net < 0 ? 'down' : '', text: net > 0 ? `+${net}` : net })));
    });
    // fixtures
    const next = D.fixtures.filter((f) => f.gw >= (D.meta.next_gw || D.meta.gw));
    const gws = [...new Set(next.map((f) => f.gw))].sort((a, b) => a - b).slice(0, 6);
    const thead = $('fdr').tHead; thead.replaceChildren(h('tr', {}, h('th', { class: 'l', text: 'Club' }), gws.map((x) => h('th', { text: `GW${x}` }))));
    const clubs = Object.keys(CLUB).filter((c) => D.pltable.some((t) => t.team === c));
    const rows = clubs.map((c) => {
      const cells = gws.map((x) => next.filter((f) => f.gw === x && (f.h === c || f.a === c)).map((f) => f.h === c ? { o: f.a, home: true, d: f.hd } : { o: f.h, home: false, d: f.ad }));
      return { c, cells, score: cells.flat().reduce((a, f) => a + f.d, 0) / Math.max(1, cells.flat().length) };
    }).sort((a, b) => a.score - b.score);
    const ft = $('fdr').tBodies[0]; ft.replaceChildren();
    rows.forEach((r) => ft.append(h('tr', {}, h('td', { class: 'l' }, clubBadge(r.c)), r.cells.map((fx) => {
      const td = h('td', { class: 'f' + (fx.length ? ` f${Math.round(fx.reduce((a, f) => a + f.d, 0) / fx.length)}` : ''), text: fx.length ? fx.map((f) => f.home ? f.o : f.o.toLowerCase()).join('+') : 'Blank' });
      return td;
    }))));
  }
  function drawPitch() {
    const m = M.get(+$('squad-pick').value);
    const pitch = $('pitch'); pitch.replaceChildren();
    if (!m || !m.picks.length) { pitch.append(h('p', { class: 'note', text: 'No team picked yet.' })); return; }
    const subbedOut = new Set((m.subs || []).map(([o]) => o)), subbedIn = new Set((m.subs || []).map(([, i]) => i));
    const card = (p) => {
      const pl = player(p.el);
      const mult = p.el === m.captain ? (m.active_chip === '3xc' ? 3 : 2) : 1;
      const el = h('div', { class: 'pl' + (p.el === m.captain ? ' cap' : '') + (pl.s !== 'a' ? ' flag' : '') + (subbedOut.has(p.el) ? ' subbed' : ''), title: pl.news || null },
        h('b', { text: pl.n + (p.c ? ' (C)' : p.v ? ' (V)' : '') }), h('small', { text: `${pl.t} · £${pl.c.toFixed(1)}m` }),
        h('span', { class: 'pts', text: mult > 1 ? `${pl.gw}×${mult}` : pl.gw }),
        subbedIn.has(p.el) ? h('small', { text: 'Auto-sub in' }) : subbedOut.has(p.el) ? h('small', { text: 'Subbed off' }) : null);
      return el;
    };
    const xi = m.picks.filter((p) => p.slot <= 11), bench = m.picks.filter((p) => p.slot > 11);
    [1, 2, 3, 4].forEach((pos) => pitch.append(h('div', { class: 'pline' }, xi.filter((p) => player(p.el).p === pos).map(card))));
    pitch.append(h('div', { class: 'bench-label', text: m.active_chip === 'bboost' ? 'Bench (Bench Boost: these count)' : 'Bench' }), h('div', { class: 'pline bench' }, bench.map(card)));
    const value = m.picks.reduce((a, p) => a + player(p.el).c, 0);
    $('squad-note').textContent = `${m.team} · ${D.meta.live ? 'live' : `GW${D.meta.gw}`} ${m.gw_points} pts · bank £${m.bank.toFixed(1)}m · ${m.free_transfers} free transfer${m.free_transfers === 1 ? '' : 's'} · squad £${value.toFixed(1)}m`;
  }

  // ---------- me picker ----------
  function openSheet() {
    const list = $('sheet-list'); list.replaceChildren();
    D.managers.slice().sort((a, b) => a.name.localeCompare(b.name)).forEach((m) => list.append(
      h('button', { type: 'button', onclick: () => { me = m.id; store.set(ME_KEY, String(m.id)); closeSheet(); renderAll(); } }, h('b', { text: m.name }), h('span', { text: m.team }))));
    $('sheet').hidden = false;
  }
  function closeSheet() { $('sheet').hidden = true; store.set(ME_KEY + '-asked', '1'); }
  $('me-chip').addEventListener('click', () => D && openSheet());
  $('sheet-skip').addEventListener('click', () => { me = null; store.set(ME_KEY, ''); closeSheet(); renderAll(); });
  $('sheet').addEventListener('click', (e) => { if (e.target === $('sheet')) closeSheet(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('sheet').hidden) closeSheet(); });

  // ---------- routing ----------
  const VIEWS = ['table', 'awards', 'fans', 'rivals', 'squads'];
  function route() {
    const v = VIEWS.includes(location.hash.slice(1)) ? location.hash.slice(1) : 'table';
    VIEWS.forEach((x) => { $(x).hidden = x !== v || !D; });
    document.querySelectorAll('.tabs a').forEach((a) => a.classList.toggle('on', a.dataset.tab === v));
    if (D) { if (v === 'table') drawReplay(+$('replay-slider').value); if (v === 'rivals') drawRivals(); }
  }
  window.addEventListener('hashchange', () => { route(); window.scrollTo(0, 0); });

  function renderAll() {
    M = new Map(D.managers.map((m) => [m.id, m]));
    if (me != null && !M.has(me)) me = null;
    renderHeader(); renderTable(); renderAwards(); renderFans(); renderRivals(); renderSquads(); route();
  }

  async function load(first) {
    try {
      const r = await fetch(`data.json?t=${Date.now()}`, { cache: 'no-store' });
      if (!r.ok) throw new Error(r.status);
      const data = await r.json();
      if (D && data.meta.hash === D.meta.hash) return;
      D = data;
      $('loading').hidden = true; $('error').hidden = true;
      renderAll();
      if (first && !store.get(ME_KEY + '-asked')) openSheet();
    } catch (e) {
      if (!D) { $('loading').hidden = true; $('error').hidden = false; }
    }
  }
  const saved = store.get(ME_KEY);
  me = saved ? +saved : null;
  load(true);
  setInterval(tick, 30000);
  setInterval(() => { if (document.visibilityState === 'visible') load(false); }, 120000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') load(false); });
  let rz; window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => { if (D) { drawReplay(+$('replay-slider').value); drawRivals(); } }, 200); });
})();
