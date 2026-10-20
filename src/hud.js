// HUD, whispers and the title / game-over / pause panels.
import { marsLeft } from './game.js';

const $ = id => document.getElementById(id);

export function fmtKm(L) {
  if (L >= 100) return `${Math.round(L).toLocaleString('en-US')} km`;
  if (L >= 1) return `${L.toFixed(3)} km`;
  if (L < 1e-12) return `${L.toExponential(3)} km`;
  return `${L.toFixed(Math.min(14, 3 - Math.floor(Math.log10(L))))} km`;
}
const fmtM = m => Math.floor(m).toLocaleString('en-US');

const MILESTONES = [
  [60, 'keep going'], [200, "it's getting redder"], [420, 'you can see the ice cap'],
  [700, 'you can see the canyon'], [1050, 'past the moons'], [1500, 'almost there'],
  [2100, 'you can see olympus mons'], [2900, 'it was right there a second ago'],
  [3900, 'any moment now'], [5200, 'nearly'], [7000, 'keep going'],
];
const HINTS = {
  rock: ['steer round it', 'drag to steer'],
  cluster: ['thread through', 'thread through'],
  satellite: ['mind the panels', 'mind the panels'],
  girder: ['go round the girder', 'go round the girder'],
  belt: ['find the gap', 'find the gap'],
  shard: ['shards', 'shards'],
};
const DEATH = {
  rock: 'you hit a rock', cluster: 'you hit a rock', belt: 'you hit a rock',
  satellite: 'you hit a dead satellite', girder: 'you hit a girder', shard: 'you hit a shard',
};

export function createHud(store) {
  const el = {
    hud: $('hud'), dist: $('dist'), mars: $('mars'), whisper: $('whisper'),
    title: $('title'), bestTitle: $('best-title'),
    over: $('over'), overHead: $('over-head'), overDist: $('over-dist'), overMars: $('over-mars'), overBest: $('over-best'),
    paused: $('paused'), pauseBtn: $('pause'), snd: $('snd'), error: $('error'), errorMsg: $('error-msg'),
  };
  let best = Number(store.get('nt2-best')) || 0;
  let milestone = 0;
  let timer = 0;
  let last = '';
  const hinted = {};

  function whisper(text, ms = 2600) {
    el.whisper.textContent = text;
    el.whisper.classList.add('on');
    clearTimeout(timer);
    timer = setTimeout(() => el.whisper.classList.remove('on'), ms);
  }

  if (best) {
    el.bestTitle.hidden = false;
    el.bestTitle.textContent = `Your best: ${fmtM(best)} m. Mars was ${fmtKm(marsLeft(best))} away.`;
  }

  return {
    start() {
      milestone = 0; last = '';
      el.title.hidden = true; el.over.hidden = true; el.paused.hidden = true;
      el.hud.hidden = false; el.pauseBtn.hidden = false; el.pauseBtn.textContent = 'Pause';
    },
    progress(m) {
      const t = `${fmtM(m)} m|${fmtKm(marsLeft(m))}`;
      if (t !== last) {
        last = t;
        const [d, l] = t.split('|');
        el.dist.textContent = d;
        el.mars.textContent = l;
      }
      const ms = MILESTONES[milestone];
      if (ms && m >= ms[0]) { milestone++; whisper(ms[1]); return true; }
      return false;
    },
    approach(kind, touch) {
      if (hinted[kind] || !HINTS[kind]) return;
      hinted[kind] = true;
      whisper(HINTS[kind][touch ? 1 : 0], 1800);
    },
    die() { el.pauseBtn.hidden = true; },
    over(kind, m) {
      const isBest = m > best;
      if (isBest) { best = m; store.set('nt2-best', String(Math.floor(m))); }
      el.overHead.textContent = DEATH[kind] || 'you stopped';
      el.overDist.textContent = `${fmtM(m)} m`;
      el.overMars.textContent = `Mars is still ${fmtKm(marsLeft(m))} away.`;
      el.overBest.textContent = isBest && m > 0 ? 'Your farthest flight yet.' : `Your best: ${fmtM(best)} m`;
      el.hud.hidden = true; el.over.hidden = false;
    },
    pause(p) {
      el.paused.hidden = !p;
      el.pauseBtn.textContent = p ? 'Resume' : 'Pause';
    },
    sound(muted) { el.snd.textContent = muted ? 'Sound off' : 'Sound on'; },
    error(msg) {
      el.title.hidden = true;
      el.error.hidden = false;
      el.errorMsg.textContent = msg;
    },
    buttons: { pause: el.pauseBtn, sound: el.snd },
  };
}
