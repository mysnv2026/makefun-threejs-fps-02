// HUD: every DOM readout the player sees, plus the buy menu and banners.
// One job: reflect the sim state in the page. It never decides game rules;
// rounds.js and main.js call these setters, and clicks/keys come back out
// through the callbacks.
import { WEAPONS, WEAPON_ORDER, ARMOR_PRICE } from './config.js';

export function createHud(callbacks = {}) {
  const $ = (id) => document.getElementById(id);
  const el = {
    health: $('health-value'), healthBar: $('health-bar'), armor: $('armor-value'),
    ammoMag: $('ammo-mag'), ammoReserve: $('ammo-reserve'), ammo: $('ammo'),
    money: $('money-value'), timer: $('timer'), timerBox: $('timer'),
    scoreAmber: $('score-amber'), scoreCobalt: $('score-cobalt'),
    aliveAmber: $('alive-amber'), aliveCobalt: $('alive-cobalt'),
    killfeed: $('killfeed'), crosshair: $('crosshair'), hitmarker: $('hitmarker'),
    damage: $('damage'), flash: $('flash'), bomb: $('bomb-status'),
    overlay: $('overlay'), overlayTitle: $('overlay-title'), overlayCopy: $('overlay-copy'),
    play: $('play'),
    buy: $('buy-menu'), buyGrid: $('buy-grid'), buyMoney: $('buy-money'),
    banner: $('banner'), bannerText: $('banner-text'), bannerSub: $('banner-sub'),
    roundLabel: $('round-label'), objective: $('objective'),
  };

  let hitTimer = 0;

  function setHealth(hp, armor) {
    el.health.textContent = String(Math.max(0, Math.ceil(hp)));
    el.healthBar.style.width = `${Math.max(0, Math.min(100, hp))}%`;
    el.armor.textContent = armor > 0 ? `+${Math.ceil(armor)}` : '—';
    el.healthBar.style.background = hp > 50 ? 'var(--ink)' : hp > 25 ? 'var(--accent)' : 'var(--danger)';
  }

  function setAmmo(mag, reserve, reloading) {
    el.ammoMag.textContent = String(mag);
    el.ammoReserve.textContent = `/ ${reserve}${reloading ? ' · reloading' : ''}`;
    el.ammo.classList.toggle('empty', mag === 0);
  }

  function setMoney(m) {
    el.money.textContent = `$${m}`;
    if (el.buyMoney) el.buyMoney.textContent = `$${m}`;
  }

  function setTimer(seconds, planted) {
    const s = Math.max(0, Math.ceil(seconds));
    el.timer.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    el.timerBox.classList.toggle('planted', !!planted);
  }

  function setScore(amber, cobalt, round) {
    el.scoreAmber.textContent = String(amber);
    el.scoreCobalt.textContent = String(cobalt);
    el.roundLabel.textContent = `ROUND ${round}`;
  }

  function setAlive(amber, cobalt) {
    el.aliveAmber.textContent = `●`.repeat(Math.max(0, amber));
    el.aliveCobalt.textContent = `●`.repeat(Math.max(0, cobalt));
  }

  function setObjective(text) {
    el.objective.textContent = text;
  }

  function setBomb(text, active) {
    el.bomb.textContent = text;
    el.bomb.classList.toggle('active', !!active);
  }

  function setCrosshairSpread(px) {
    el.crosshair.style.setProperty('--gap', `${px.toFixed(1)}px`);
  }

  function hitMarker(kill) {
    el.hitmarker.classList.add('on');
    el.hitmarker.classList.toggle('kill', !!kill);
    clearTimeout(hitTimer);
    hitTimer = setTimeout(() => el.hitmarker.classList.remove('on', 'kill'), kill ? 320 : 130);
  }

  function damageFlash() {
    el.damage.classList.add('on');
    setTimeout(() => el.damage.classList.remove('on'), 220);
  }

  function flashWhite(strength = 1) {
    el.flash.style.opacity = String(0.85 * strength);
    setTimeout(() => { el.flash.style.opacity = '0'; }, 420);
  }

  function killfeed(killer, victim, headshot, weaponName) {
    const row = document.createElement('div');
    row.className = 'feed-row';
    row.innerHTML = `<span class="feed-killer"></span><span class="feed-weapon"></span><span class="feed-victim"></span>`;
    row.querySelector('.feed-killer').textContent = killer;
    row.querySelector('.feed-weapon').textContent = headshot ? `⌖ ${weaponName || ''}` : (weaponName || '');
    row.querySelector('.feed-victim').textContent = victim;
    el.killfeed.prepend(row);
    while (el.killfeed.children.length > 5) el.killfeed.lastChild.remove();
    setTimeout(() => row.remove(), 6000);
  }

  function banner(text, sub = '') {
    el.bannerText.textContent = text;
    el.bannerSub.textContent = sub;
    el.banner.classList.remove('hidden');
    el.banner.classList.add('show');
    clearTimeout(banner._t);
    banner._t = setTimeout(() => el.banner.classList.add('hidden'), 3200);
  }

  function hideBanner() {
    el.banner.classList.add('hidden');
  }

  function showOverlay(kind, data = {}) {
    const copy = {
      start: ['SANDLINE', 'Foundry Yard — Amber attacks, Cobalt defends two charge sites. Plant the charge or eliminate the enemy team. Click to play.'],
      paused: ['Paused', `Round ${data.round || 1} · Amber ${data.amber ?? 0} — ${data.cobalt ?? 0} Cobalt · Score ${data.score ?? 0}. Click to resume.`],
      end: ['Round over', data.text || ''],
      match: [data.title || 'Match over', data.text || ''],
    }[kind] || ['SANDLINE', ''];
    el.overlayTitle.textContent = copy[0];
    el.overlayCopy.textContent = copy[1];
    el.overlay.hidden = false;
    el.play.textContent = kind === 'start' ? 'Click to play' : kind === 'match' ? 'Play again' : 'Click to resume';
  }

  function hideOverlay() {
    el.overlay.hidden = true;
  }

  function showBuy(money, owned, grenades) {
    el.buyGrid.innerHTML = '';
    for (const id of WEAPON_ORDER) {
      const w = WEAPONS[id];
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'buy-card';
      card.disabled = owned[id] || money < w.price;
      card.innerHTML = `<b></b><span class="buy-price"></span><span class="buy-meta"></span>`;
      card.querySelector('b').textContent = `${w.key} · ${w.name}`;
      card.querySelector('.buy-price').textContent = owned[id] ? 'OWNED' : `$${w.price}`;
      card.querySelector('.buy-meta').textContent = `DMG ${w.damage} · ${w.mag} rounds · ${w.auto ? 'AUTO' : 'SEMI'}`;
      card.addEventListener('click', () => callbacks.onBuy && callbacks.onBuy(id));
      el.buyGrid.appendChild(card);
    }
    const armor = document.createElement('button');
    armor.type = 'button';
    armor.className = 'buy-card';
    armor.disabled = money < ARMOR_PRICE;
    armor.innerHTML = `<b>6 · Plated Vest</b><span class="buy-price">$${ARMOR_PRICE}</span><span class="buy-meta">+50 armor · absorbs half of damage</span>`;
    armor.addEventListener('click', () => callbacks.onBuy && callbacks.onBuy('armor'));
    el.buyGrid.appendChild(armor);
    const nade = document.createElement('button');
    nade.type = 'button';
    nade.className = 'buy-card';
    nade.disabled = money < 300 || grenades >= 2;
    nade.innerHTML = `<b>5 · Spark Grenade</b><span class="buy-price">$300</span><span class="buy-meta">Blinding flash · ${grenades}/2 carried</span>`;
    nade.addEventListener('click', () => callbacks.onBuy && callbacks.onBuy('spark'));
    el.buyGrid.appendChild(nade);
    el.buy.classList.remove('hidden');
  }

  function hideBuy() {
    el.buy.classList.add('hidden');
  }

  if (el.play) el.play.addEventListener('click', () => callbacks.onPlay && callbacks.onPlay());

  return {
    setHealth, setAmmo, setMoney, setTimer, setScore, setAlive, setObjective,
    setBomb, setCrosshairSpread, hitMarker, damageFlash, flashWhite, killfeed,
    banner, hideBanner, showOverlay, hideOverlay, showBuy, hideBuy,
  };
}
