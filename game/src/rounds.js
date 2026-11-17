// Rounds: the match state machine, the economy and the charge objective.
// One job: own the phase (buy / live / post / over), the score, the money
// and the bomb, and tell everyone else what phase it is. It never renders
// and never moves a body; main.js and bots.js act on what it reports.
import { ECONOMY, ROUND, TEAMS, PLAYER_HP } from './config.js';

export function createRounds(deps) {
  const { map, player, bots, hud, audio, loadout, random } = deps;

  const state = {
    round: 1,
    phase: 'buy', // buy | live | post | over
    phaseT: ROUND.buySeconds,
    score: { amber: 0, cobalt: 0 },
    money: ECONOMY.startMoney,
    lossStreak: 0,
    kills: 0,
    deaths: 0,
    bomb: {
      state: 'with-player', // with-player | with-bot | dropped | planted | gone
      carrier: null, // bot ref when with-bot
      site: 'a',
      x: 0,
      z: 0,
      fuse: ROUND.detonateSeconds,
      plantProgress: 0,
    },
    matchWinner: null,
    playerAlive: true,
    playerHp: 100,
    playerArmor: 0,
  };

  function targetSiteObj() {
    return map.sites[state.bomb.site];
  }

  function plansForRound() {
    const site = random() < 0.5 ? 'a' : 'b';
    state.bomb.site = site;
    const other = site === 'a' ? 'b' : 'a';
    // Waypoint lanes: A = 15 -> 9 -> 11 (or 13), B = 16 -> 10 -> 12, Mid = 8.
    const laneA = [15, 9, 11];
    const laneB = [16, 10, 12];
    const laneMid = [8, site === 'a' ? 13 : 14];
    const plans = {
      Bram: { route: site === 'a' ? laneA : laneB, role: 'attack' },
      Kestrel: { route: laneMid, role: 'attack' },
      Onyx: { route: site === 'a' ? laneB : laneA, role: 'attack' },
      Vesper: { route: site === 'a' ? [5, 13, 11] : [6, 14, 12], role: 'defend', holdAt: { yaw: Math.PI } },
      Heron: { route: site === 'a' ? [6, 14, 12] : [5, 13, 11], role: 'defend', holdAt: { yaw: Math.PI } },
      Moss: { route: [4, 8], role: 'defend', holdAt: { yaw: 0 } },
      Quill: { route: site === 'a' ? [7, 13, 11] : [7, 14, 12], role: 'defend', holdAt: { yaw: Math.PI } },
    };
    return plans;
  }

  function startMatch() {
    state.round = 1;
    state.score = { amber: 0, cobalt: 0 };
    state.money = ECONOMY.startMoney;
    state.lossStreak = 0;
    state.kills = 0;
    state.deaths = 0;
    state.matchWinner = null;
    loadout.refill();
    startRound();
  }

  function startRound() {
    state.phase = 'buy';
    state.phaseT = ROUND.buySeconds;
    state.bomb.state = 'with-player';
    state.bomb.carrier = null;
    state.bomb.fuse = ROUND.detonateSeconds;
    state.bomb.plantProgress = 0;
    state.playerAlive = true;
    state.playerHp = PLAYER_HP;
    state.playerArmor = loadout.armor || 0;
    const plans = plansForRound();
    const spawns = {
      amber: map.spawns.amber.map((s) => ({ ...s })),
      cobalt: map.spawns.cobalt.map((s) => ({ ...s })),
    };
    // Player takes the first Amber spawn; bots take the rest.
    const playerSpawn = spawns.amber.shift();
    player.reset(playerSpawn);
    bots.resetRound(spawns, plans);
    hud.setScore(state.score.amber, state.score.cobalt, state.round);
    hud.setMoney(state.money);
    hud.setHealth(state.playerHp, state.playerArmor);
    hud.setAlive(4, 4);
    hud.setObjective(`Plant the charge at Site ${state.bomb.site.toUpperCase()} — or eliminate Cobalt`);
    hud.setBomb('CHARGE READY', false);
    hud.showBuy(state.money, loadout.owned, loadout.grenades.count);
    hud.banner(`ROUND ${state.round}`, 'Buy phase — press B to open the buy menu');
  }

  function endRound(winner, reason) {
    if (state.phase !== 'live') return;
    state.phase = 'post';
    state.phaseT = ROUND.postSeconds;
    state.score[winner === TEAMS.AMBER ? 'amber' : 'cobalt'] += 1;
    const won = winner === TEAMS.AMBER;
    if (won) {
      state.money = Math.min(ECONOMY.maxMoney, state.money + ECONOMY.winBonus);
      state.lossStreak = 0;
      audio.play('round-win');
    } else {
      state.lossStreak += 1;
      const bonus = state.lossStreak >= 2 ? ECONOMY.lossBonusStreak : ECONOMY.lossBonus;
      state.money = Math.min(ECONOMY.maxMoney, state.money + bonus);
      audio.play('round-lose');
    }
    hud.setMoney(state.money);
    hud.setScore(state.score.amber, state.score.cobalt, state.round);
    hud.hideBuy();
    const reasonText = {
      eliminated: won ? 'Cobalt team eliminated' : 'Amber team eliminated',
      detonated: 'The charge detonated — Site ' + state.bomb.site.toUpperCase() + ' is gone',
      defused: 'Cobalt defused the charge',
      time: 'Time expired — Cobalt holds the yard',
    }[reason] || reason;
    hud.banner(won ? 'ROUND WON' : 'ROUND LOST', reasonText);
    state.bomb.state = 'gone';
    if (state.score.amber >= ROUND.winRounds || state.score.cobalt >= ROUND.winRounds || state.round >= ROUND.maxRounds) {
      state.matchWinner = state.score.amber > state.score.cobalt ? TEAMS.AMBER : TEAMS.COBALT;
    }
  }

  function beginLive() {
    state.phase = 'live';
    state.phaseT = ROUND.roundSeconds;
    hud.hideBuy();
    hud.banner('GO', `Plant at Site ${state.bomb.site.toUpperCase()} — ${ROUND.roundSeconds}s on the clock`);
  }

  function onPlayerKilled() {
    state.playerAlive = false;
    state.deaths += 1;
    if (state.bomb.state === 'with-player') {
      state.bomb.state = 'dropped';
      state.bomb.x = player.state.position.x;
      state.bomb.z = player.state.position.z;
      hud.setBomb('CHARGE DROPPED', true);
      hud.setObjective('A teammate must recover the charge');
    }
  }

  function onKillByPlayer(headshot) {
    state.kills += 1;
    state.money = Math.min(ECONOMY.maxMoney, state.money + ECONOMY.killReward);
    hud.setMoney(state.money);
  }

  function buy(id) {
    if (state.phase !== 'buy') return false;
    if (id === 'armor') {
      if (state.money < 650 || state.playerArmor >= 50) return false;
      state.money -= 650;
      state.playerArmor = 50;
      loadout.armor = 50;
    } else if (id === 'spark') {
      if (state.money < 300 || loadout.grenades.count >= 2) return false;
      state.money -= 300;
      loadout.buyGrenade();
    } else {
      const def = { p9: 0, vk9: 1500, ar77: 2700, lr90: 4750 }[id];
      if (def === undefined || state.money < def || loadout.owned[id]) return false;
      state.money -= def;
      loadout.buy(id);
    }
    hud.setMoney(state.money);
    audio.play('buy');
    hud.showBuy(state.money, loadout.owned, loadout.grenades.count);
    return true;
  }

  // Player planting: hold E inside a site while carrying the charge.
  function playerPlant(dt, holdingKey) {
    if (state.bomb.state !== 'with-player' || state.phase !== 'live' || !state.playerAlive) return;
    const site = targetSiteObj();
    const p = player.state.position;
    const d = Math.hypot(p.x - site.x, p.z - site.z);
    if (d < site.r && holdingKey) {
      state.bomb.plantProgress += dt;
      hud.setBomb(`PLANTING ${Math.ceil((state.bomb.plantProgress / ROUND.plantSeconds) * 100)}%`, true);
      if (Math.floor(state.bomb.plantProgress * 4) !== Math.floor((state.bomb.plantProgress - dt) * 4)) audio.play('plant-beep');
      if (state.bomb.plantProgress >= ROUND.plantSeconds) {
        state.bomb.state = 'planted';
        state.bomb.fuse = ROUND.detonateSeconds;
        state.money = Math.min(ECONOMY.maxMoney, state.money + ECONOMY.plantBonus);
        hud.setMoney(state.money);
        hud.setBomb('CHARGE PLANTED — DEFEND IT', true);
        hud.setObjective(`Charge planted at Site ${state.bomb.site.toUpperCase()} — hold until detonation`);
        audio.play('plant-done');
        hud.banner('CHARGE PLANTED', `${ROUND.detonateSeconds}s to detonation`);
      }
    } else {
      state.bomb.plantProgress = 0;
      if (state.bomb.state === 'with-player') hud.setBomb('CHARGE READY', false);
    }
  }

  // A dropped charge is recovered by the nearest living Amber bot.
  function recoverBomb(dt) {
    if (state.bomb.state !== 'dropped') return;
    let best = null;
    let bestD = 1e9;
    for (const bot of bots.list) {
      if (bot.team !== TEAMS.AMBER || !bot.alive) continue;
      const d = Math.hypot(bot.pos.x - state.bomb.x, bot.pos.z - state.bomb.z);
      if (d < bestD) { bestD = d; best = bot; }
    }
    if (!best) return;
    if (bestD < 1.6) {
      state.bomb.state = 'with-bot';
      state.bomb.carrier = best;
      best.carriesBomb = true;
      // Route the carrier to the target site to plant.
      const site = state.bomb.site;
      best.route = site === 'a' ? [9, 11] : [10, 12];
      best.wpIdx = 0;
      hud.setBomb('TEAMMATE HAS THE CHARGE', true);
      hud.setObjective('Your teammate carries the charge — cover them');
      return;
    }
    // Steer the nearest bot toward the dropped charge.
    if (!best.goto || Math.hypot(best.goto.x - state.bomb.x, best.goto.z - state.bomb.z) > 1) {
      best.goto = { x: state.bomb.x, z: state.bomb.z };
    }
  }

  function update(dt, nowMs, world) {
    const { input } = world;
    if (state.phase === 'buy') {
      state.phaseT -= dt;
      hud.setTimer(Math.max(0, state.phaseT), false);
      if (input.state.keys.has('KeyB')) hud.showBuy(state.money, loadout.owned, loadout.grenades.count);
      // Keyboard buying: 1-4 weapons, 5 grenade, 6 armor.
      for (const [code, id] of [['Digit1', 'p9'], ['Digit2', 'vk9'], ['Digit3', 'ar77'], ['Digit4', 'lr90'], ['Digit5', 'spark'], ['Digit6', 'armor']]) {
        if (input.state.keys.has(code)) buy(id);
      }
      if (state.phaseT <= 0) beginLive();
      return;
    }
    if (state.phase === 'post') {
      state.phaseT -= dt;
      if (state.phaseT <= 0) {
        if (state.matchWinner) {
          state.phase = 'over';
          const won = state.matchWinner === TEAMS.AMBER;
          hud.showOverlay('match', {
            title: won ? 'AMBER TAKES THE MATCH' : 'COBALT TAKES THE MATCH',
            text: `Final score Amber ${state.score.amber} — ${state.score.cobalt} Cobalt · ${state.kills} eliminations, ${state.deaths} deaths.`,
          });
          if (input.releaseLock) input.releaseLock();
        } else {
          state.round += 1;
          startRound();
        }
      }
      return;
    }
    if (state.phase !== 'live') return;

    state.phaseT -= dt;
    const planted = state.bomb.state === 'planted';
    hud.setTimer(planted ? state.bomb.fuse : Math.max(0, state.phaseT), planted);

    // Planting, recovery and the fuse.
    playerPlant(dt, input.state.keys.has('KeyE'));
    recoverBomb(dt);
    if (planted) {
      state.bomb.fuse -= dt;
      if (state.bomb.fuse <= 0) {
        audio.play('explosion');
        endRound(TEAMS.AMBER, 'detonated');
        return;
      }
    }

    // Win conditions.
    const amberAlive = (state.playerAlive ? 1 : 0) + bots.aliveCount(TEAMS.AMBER);
    const cobaltAlive = bots.aliveCount(TEAMS.COBALT);
    hud.setAlive(amberAlive, cobaltAlive);
    if (!planted && amberAlive === 0) { endRound(TEAMS.COBALT, 'eliminated'); return; }
    if (!planted && cobaltAlive === 0) { endRound(TEAMS.AMBER, 'eliminated'); return; }
    if (planted && cobaltAlive === 0) {
      // Nobody left to defuse: the fuse decides it.
      return;
    }
    if (!planted && state.phaseT <= 0) { endRound(TEAMS.COBALT, 'time'); }
  }

  return {
    state, startMatch, startRound, endRound, onPlayerKilled, onKillByPlayer,
    buy, update, targetSiteObj,
  };
}
