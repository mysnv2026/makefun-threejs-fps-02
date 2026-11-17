// Bots: seven AI teammates and opponents with routes, holds, reactions,
// bursts of fire, and the plant/defuse objective.
// One job: decide what each bot does on the fixed step and move its mesh.
// It never owns the round; rounds.js tells it the plan and the bomb state.
import * as THREE from 'three';
import { WEAPONS, MOVE, TEAM_COLOR, TEAMS } from './config.js';
import { clamp, turnToward, angleDelta } from './rng.js';
import { collideCircle } from './map.js';
import { hasLineOfSight } from './combat.js';

const BOT_DEFS = [
  { name: 'Bram', team: TEAMS.AMBER, skill: 0.55 },
  { name: 'Kestrel', team: TEAMS.AMBER, skill: 0.6 },
  { name: 'Onyx', team: TEAMS.AMBER, skill: 0.5 },
  { name: 'Vesper', team: TEAMS.COBALT, skill: 0.58 },
  { name: 'Heron', team: TEAMS.COBALT, skill: 0.62 },
  { name: 'Moss', team: TEAMS.COBALT, skill: 0.5 },
  { name: 'Quill', team: TEAMS.COBALT, skill: 0.56 },
];

const _eye = new THREE.Vector3();
const _targetEye = new THREE.Vector3();
const _to = new THREE.Vector3();
const _dir = new THREE.Vector3();

function buildBotMesh(team) {
  const color = TEAM_COLOR[team];
  const g = new THREE.Group();
  const cloth = new THREE.MeshStandardMaterial({ color: 0x3a3f45, roughness: 0.9 });
  const accent = new THREE.MeshStandardMaterial({ color, roughness: 0.6, emissive: color, emissiveIntensity: 0.35 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xc9a37e, roughness: 0.8 });

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.62, 0.3), cloth);
  torso.position.y = 1.12;
  torso.castShadow = true;
  torso.userData.part = 'body';
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.1, 0.32), accent);
  stripe.position.y = 1.32;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.34, 0.34), skin);
  head.position.y = 1.62;
  head.castShadow = true;
  head.userData.part = 'head';
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.1, 0.36), accent);
  visor.position.y = 1.64;
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.78, 0.22), cloth);
  legL.position.set(-0.14, 0.39, 0);
  const legR = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.78, 0.22), cloth);
  legR.position.set(0.14, 0.39, 0);
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.12, 0.72), new THREE.MeshStandardMaterial({ color: 0x1c1f22, roughness: 0.5, metalness: 0.6 }));
  gun.position.set(0.22, 1.22, 0.3);
  g.add(torso, stripe, head, visor, legL, legR, gun);
  return { group: g, torso, head, legL, legR, gun };
}

export function createBots(scene, map, random) {
  const list = [];
  const shootables = [];

  for (const def of BOT_DEFS) {
    const mesh = buildBotMesh(def.team);
    scene.add(mesh.group);
    const bot = {
      ...def,
      mesh,
      pos: new THREE.Vector3(0, 0, 0),
      yaw: 0,
      pitch: 0,
      hp: 100,
      armor: 0,
      alive: true,
      weaponId: 'ar77',
      route: [],
      wpIdx: 0,
      role: 'attack',
      holdAt: null,
      state: 'route',
      target: null,
      lastSeen: new THREE.Vector3(),
      lastSeenMs: -1e9,
      reactUntilMs: 0,
      burstLeft: 0,
      nextShotMs: 0,
      strafeDir: 1,
      strafeUntilMs: 0,
      walkPhase: 0,
      plantProgress: 0,
      defuseProgress: 0,
      carriesBomb: false,
      speed: 3.4 + random() * 0.5,
      blindUntilMs: 0,
      fallen: false,
    };
    mesh.torso.userData.bot = bot;
    mesh.head.userData.bot = bot;
    shootables.push(mesh.torso, mesh.head);
    list.push(bot);
  }

  function resetRound(spawns, plans) {
    for (const bot of list) {
      const plan = plans[bot.name] || { route: [8], role: 'hold' };
      const spawn = spawns[bot.team].shift();
      bot.pos.set(spawn.x, 0, spawn.z);
      bot.yaw = bot.team === TEAMS.AMBER ? 0 : Math.PI;
      bot.pitch = 0;
      bot.hp = 100;
      bot.armor = 0;
      bot.alive = true;
      bot.fallen = false;
      bot.weaponId = bot.team === TEAMS.AMBER ? 'ar77' : 'ar77';
      bot.route = plan.route;
      bot.wpIdx = 0;
      bot.role = plan.role;
      bot.holdAt = plan.holdAt || null;
      bot.state = 'route';
      bot.target = null;
      bot.plantProgress = 0;
      bot.defuseProgress = 0;
      bot.carriesBomb = !!plan.carriesBomb;
      bot.blindUntilMs = 0;
      bot.burstLeft = 0;
      bot.goto = null;
      bot.mesh.group.visible = true;
      bot.mesh.group.rotation.set(0, bot.yaw, 0);
      bot.mesh.group.position.copy(bot.pos);
      bot.mesh.torso.visible = true;
      bot.mesh.head.visible = true;
    }
  }

  function eyeOf(bot) {
    _eye.set(bot.pos.x, bot.pos.y + 1.55, bot.pos.z);
    return _eye;
  }

  function perceive(bot, ctx, nowMs) {
    // Nearest visible enemy inside 55 m and a ~110-degree cone.
    let best = null;
    let bestDist = 55;
    const enemies = ctx.enemiesOf(bot);
    for (const e of enemies) {
      if (!e.alive) continue;
      const ep = e.isPlayer ? ctx.playerEye : _targetEye.set(e.pos.x, e.pos.y + 1.4, e.pos.z);
      _to.subVectors(ep, eyeOf(bot));
      const dist = _to.length();
      if (dist > bestDist) continue;
      const yawTo = Math.atan2(-_to.x, -_to.z);
      if (Math.abs(angleDelta(bot.yaw, yawTo)) > 1.05 && dist > 6) continue;
      if (!hasLineOfSight(ctx.raycaster, map.occluders, eyeOf(bot), ep)) continue;
      best = e;
      bestDist = dist;
    }
    if (best) {
      bot.target = best;
      bot.lastSeen.copy(best.isPlayer ? ctx.playerEye : _targetEye.set(best.pos.x, best.pos.y + 1.4, best.pos.z));
      bot.lastSeenMs = nowMs;
      if (bot.state !== 'engage') {
        bot.state = 'engage';
        bot.reactUntilMs = nowMs + 320 + (1 - bot.skill) * 420;
        bot.burstLeft = 0;
      }
    } else if (bot.state === 'engage' && nowMs - bot.lastSeenMs > 2600) {
      bot.state = 'route';
      bot.target = null;
    }
    return best;
  }

  function moveToward(bot, tx, tz, dt, speedMul = 1) {
    _to.set(tx - bot.pos.x, 0, tz - bot.pos.z);
    const dist = Math.hypot(_to.x, _to.z);
    if (dist < 0.25) return true;
    _to.multiplyScalar(1 / dist);
    const speed = bot.speed * speedMul;
    bot.pos.x += _to.x * speed * dt;
    bot.pos.z += _to.z * speed * dt;
    collideCircle(bot.pos, MOVE.radius, map.colliders);
    bot.pos.x = clamp(bot.pos.x, map.bounds.minX, map.bounds.maxX);
    bot.pos.z = clamp(bot.pos.z, map.bounds.minZ, map.bounds.maxZ);
    const targetYaw = Math.atan2(-_to.x, -_to.z);
    bot.yaw = turnToward(bot.yaw, targetYaw, dt * 6);
    bot.walkPhase += dt * speed * 2.4;
    return dist < 0.6;
  }

  function fireAt(bot, ctx, nowMs) {
    const def = WEAPONS[bot.weaponId];
    if (nowMs < bot.nextShotMs) return;
    if (bot.burstLeft <= 0) {
      bot.burstLeft = 3 + Math.floor(random() * 3);
      bot.nextShotMs = nowMs + 500 + random() * 700;
      return;
    }
    bot.burstLeft -= 1;
    bot.nextShotMs = nowMs + 60000 / def.rpm + random() * 40;
    const target = bot.target;
    if (!target) return;
    const tp = target.isPlayer ? ctx.playerEye : _targetEye.set(target.pos.x, target.pos.y + 1.35, target.pos.z);
    // Aim error: skill, distance and target speed all widen it.
    const dist = eyeOf(bot).distanceTo(tp);
    const moving = target.isPlayer ? ctx.playerSpeed : 2.5;
    const err = (0.028 + dist * 0.0011 + moving * 0.004) * (1.25 - bot.skill);
    _dir.subVectors(tp, eyeOf(bot)).normalize();
    _dir.x += (random() * 2 - 1) * err;
    _dir.y += (random() * 2 - 1) * err * 0.7;
    _dir.z += (random() * 2 - 1) * err;
    _dir.normalize();
    ctx.botShoot(bot, _dir.clone(), def);
  }

  function update(dt, ctx, nowMs) {
    for (const bot of list) {
      if (!bot.alive) continue;
      const blind = nowMs < bot.blindUntilMs;
      if (blind) {
        bot.target = null;
        bot.state = 'route';
      } else {
        perceive(bot, ctx, nowMs);
      }

      if (bot.state === 'engage' && bot.target && !blind) {
        // Face the target, strafe to be a harder mark, fire in bursts.
        const tp = bot.target.isPlayer ? ctx.playerEye : _targetEye.set(bot.target.pos.x, bot.target.pos.y + 1.35, bot.target.pos.z);
        _to.subVectors(tp, eyeOf(bot));
        const yawTo = Math.atan2(-_to.x, -_to.z);
        bot.yaw = turnToward(bot.yaw, yawTo, dt * 7);
        bot.pitch = clamp(Math.asin(clamp(_to.y / (_to.length() || 1), -1, 1)), -1.2, 1.2);
        if (nowMs > bot.strafeUntilMs) {
          bot.strafeDir = random() < 0.5 ? -1 : 1;
          bot.strafeUntilMs = nowMs + 700 + random() * 900;
        }
        const strafe = bot.strafeDir * 1.4;
        bot.pos.x += Math.cos(bot.yaw) * strafe * dt;
        bot.pos.z += -Math.sin(bot.yaw) * strafe * dt;
        collideCircle(bot.pos, MOVE.radius, map.colliders);
        if (nowMs >= bot.reactUntilMs) fireAt(bot, ctx, nowMs);
        bot.walkPhase += dt * 4;
      } else if (!blind) {
        // Objective behaviour first: plant / defuse when in place.
        let busy = false;
        const bombSite = ctx.bomb.site ? map.sites[ctx.bomb.site] : null;
        if (bot.carriesBomb && ctx.bomb.state === 'with-bot' && bombSite) {
          const d = Math.hypot(bot.pos.x - bombSite.x, bot.pos.z - bombSite.z);
          if (d < bombSite.r) {
            busy = true;
            bot.plantProgress += dt;
            ctx.onPlantProgress(bot, bot.plantProgress);
            if (bot.plantProgress >= 4) ctx.onPlanted(bot);
          }
        }
        if (!busy && ctx.bomb.state === 'planted' && bot.team === TEAMS.COBALT && bombSite) {
          const d = Math.hypot(bot.pos.x - bombSite.x, bot.pos.z - bombSite.z);
          if (d < bombSite.r) {
            busy = true;
            bot.defuseProgress += dt;
            ctx.onDefuseProgress(bot, bot.defuseProgress);
            if (bot.defuseProgress >= 5) ctx.onDefused(bot);
          }
        }
        if (!busy) {
          bot.plantProgress = 0;
          bot.defuseProgress = 0;
          // A goto overrides the route: walk to a heard shot, a dropped
          // charge, or a last-seen enemy, then resume the route.
          if (bot.goto) {
            const arrived = moveToward(bot, bot.goto.x, bot.goto.z, dt);
            if (arrived) bot.goto = null;
          } else if (bot.wpIdx < bot.route.length) {
            const wp = map.waypoints[bot.route[bot.wpIdx]];
            const arrived = moveToward(bot, wp.x, wp.z, dt);
            if (arrived) bot.wpIdx += 1;
          } else if (bot.holdAt) {
            const targetYaw = bot.holdAt.yaw ?? bot.yaw;
            bot.yaw = turnToward(bot.yaw, targetYaw, dt * 2);
            bot.walkPhase += dt * 0.4;
          }
        }
      }

      // Write the mesh from the sim state (one place, every frame).
      const m = bot.mesh.group;
      m.position.set(bot.pos.x, bot.pos.y, bot.pos.z);
      m.rotation.y = bot.yaw;
      const swing = Math.sin(bot.walkPhase) * 0.45;
      bot.mesh.legL.rotation.x = swing;
      bot.mesh.legR.rotation.x = -swing;
    }
  }

  // Damage arrives pre-multiplied (headshots included): the caller owns the
  // weapon's numbers, this only owns armor and death. Returns true on a kill.
  function damage(bot, amount) {
    if (!bot.alive) return false;
    let dmg = amount;
    if (bot.armor > 0) {
      const absorbed = Math.min(bot.armor, dmg * 0.5);
      bot.armor -= absorbed;
      dmg -= absorbed;
    }
    bot.hp -= dmg;
    if (bot.hp <= 0) {
      bot.hp = 0;
      bot.alive = false;
      bot.fallen = true;
      bot.mesh.group.rotation.set(0, bot.yaw, Math.PI / 2 * 0.9);
      bot.mesh.group.position.y = 0.25;
      return true;
    }
    return false;
  }

  function aliveCount(team) {
    return list.filter((b) => b.team === team && b.alive).length;
  }

  return { list, shootables, resetRound, update, damage, aliveCount, eyeOf };
}
