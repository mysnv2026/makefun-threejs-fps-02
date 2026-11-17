// Weapons: one loadout, its fire/reload cycle and the spread model.
// One job: answer "can I shoot now, and how wild is the shot?" plus the
// per-weapon numbers the HUD and the tracer draw from. It never raycasts;
// combat.js turns a fired round into a hit.
import { WEAPONS } from './config.js';
import { clamp } from './rng.js';

export function createLoadout() {
  const owned = { p9: true, vk9: false, ar77: false, lr90: false };
  const grenades = { count: 0 };
  const state = {
    current: 'p9',
    mag: WEAPONS.p9.mag,
    reserve: WEAPONS.p9.reserve,
    cooldownMs: 0, // time until the next round may leave the barrel
    reloadUntilMs: 0, // 0 when not reloading
    bloom: 0, // 0..1, grows while firing, decays while calm
    lastShotMs: 0,
  };

  function def() {
    return WEAPONS[state.current];
  }

  function canFire(nowMs) {
    return nowMs >= state.cooldownMs && state.reloadUntilMs === 0 && state.mag > 0;
  }

  function ready(nowMs) {
    return nowMs >= state.cooldownMs && state.reloadUntilMs === 0;
  }

  // Consume one round and set the cooldown. Returns the weapon def, or null.
  function takeRound(nowMs) {
    if (!canFire(nowMs)) return null;
    state.mag -= 1;
    state.cooldownMs = nowMs + 60000 / def().rpm;
    state.lastShotMs = nowMs;
    state.bloom = clamp(state.bloom + (def().auto ? 0.16 : 0.22), 0, 1);
    return def();
  }

  function reload(nowMs) {
    const d = def();
    if (state.reloadUntilMs !== 0 || state.mag >= d.mag || state.reserve <= 0) return false;
    state.reloadUntilMs = nowMs + d.reloadMs;
    return true;
  }

  function finishReload(nowMs) {
    if (state.reloadUntilMs === 0 || nowMs < state.reloadUntilMs) return false;
    const d = def();
    const need = d.mag - state.mag;
    const take = Math.min(need, state.reserve);
    state.mag += take;
    state.reserve -= take;
    state.reloadUntilMs = 0;
    return true;
  }

  function switchTo(id, nowMs) {
    if (!owned[id] || id === state.current) return false;
    const d = WEAPONS[id];
    state.current = id;
    state.mag = d.mag;
    state.reserve = d.reserve;
    state.cooldownMs = nowMs + 250;
    state.reloadUntilMs = 0;
    state.bloom = 0;
    return true;
  }

  // Spread in radians: base + movement + bloom + crouch/aim modifiers.
  function spread(moveSpeed, crouched, aiming) {
    const d = def();
    const moveFrac = clamp(moveSpeed / 5.2, 0, 1);
    let s = d.spread + d.moveSpread * moveFrac + state.bloom * 0.016;
    if (crouched) s *= 0.7;
    if (aiming) s *= 0.45;
    return s;
  }

  function step(nowMs, dt) {
    if (nowMs - state.lastShotMs > 260) {
      state.bloom = Math.max(0, state.bloom - dt * 2.4);
    }
    finishReload(nowMs);
  }

  function refill() {
    const d = def();
    state.mag = d.mag;
    state.reserve = d.reserve;
    state.reloadUntilMs = 0;
    state.cooldownMs = 0;
    state.bloom = 0;
  }

  function buy(id) {
    if (owned[id]) return false;
    owned[id] = true;
    return true;
  }

  function buyGrenade() {
    grenades.count += 1;
    return true;
  }

  function throwGrenade() {
    if (grenades.count <= 0) return false;
    grenades.count -= 1;
    return true;
  }

  return {
    state, owned, grenades, def, canFire, ready, takeRound, reload,
    switchTo, spread, step, refill, buy, buyGrenade, throwGrenade,
  };
}
