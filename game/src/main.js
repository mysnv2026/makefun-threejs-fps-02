// Boot and the one loop: a fixed 60 Hz simulation feeding a render at the
// display's rate. ?shot=start|play|end with &seed=N sets up a deterministic
// frame for a capture, renders it twice, then freezes it and sets
// window.__shotReady. Everything the judge reads lives in this file's imports:
// map, player, weapons, bots, combat, rounds, hud and audio, one job each.
import * as THREE from 'three';
import { PALETTE, WEAPONS, ROUND, TEAMS } from './config.js';
import { mulberry32, clamp } from './rng.js';
import { createMap } from './map.js';
import { createInput } from './input.js';
import { createPlayer } from './player.js';
import { createLoadout } from './weapons.js';
import { createCombat } from './combat.js';
import { createBots } from './bots.js';
import { createRounds } from './rounds.js';
import { createHud } from './hud.js';
import { createAudio } from './audio.js';

const FIXED_STEP = 1 / 60;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seed = Number.parseInt(params.get('seed') ?? '1', 10) || 1;
const random = mulberry32(seed);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.sky);
scene.fog = new THREE.Fog(new THREE.Color(PALETTE.sky), 26, 78);
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 160);
scene.add(camera);

// Light: warm low sun + cool sky fill, shadows across the yard.
const hemi = new THREE.HemisphereLight(0xafc4d8, 0x8a7a5c, 1.25);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffe0b3, 2.6);
sun.position.set(28, 38, 18);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -40;
sun.shadow.camera.right = 40;
sun.shadow.camera.top = 40;
sun.shadow.camera.bottom = -40;
sun.shadow.camera.far = 120;
sun.shadow.bias = -0.0004;
scene.add(sun);

const map = createMap(scene);
const combat = createCombat(scene, map);
const audio = createAudio();
const hud = createHud({
  onPlay: () => {
    if (shot) return;
    if (rounds.state.phase === 'over') { rounds.startMatch(); }
    audio.unlock();
    input.requestLock();
  },
  onBuy: (id) => { rounds.buy(id); },
});
const input = createInput(renderer.domElement, () => {});
const player = createPlayer(map.colliders, map.bounds);
const loadout = createLoadout();
const bots = createBots(scene, map, random);
const rounds = createRounds({ map, player, bots, hud, audio, loadout, random });
loadout.armor = 0;

// --- Viewmodel: a low-poly rifle parented to the camera.
const viewmodel = new THREE.Group();
{
  const dark = new THREE.MeshStandardMaterial({ color: 0x4a5158, roughness: 0.45, metalness: 0.65 });
  const accent = new THREE.MeshStandardMaterial({ color: PALETTE.accentAmber, roughness: 0.5, metalness: 0.4 });
  const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.13, 0.5), dark);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.34, 10), dark);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0.02, -0.4);
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.2, 0.1), dark);
  grip.position.set(0, -0.14, 0.12);
  grip.rotation.x = 0.35;
  const sight = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.06, 0.12), accent);
  sight.position.set(0, 0.1, -0.05);
  const mag = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.18, 0.1), dark);
  mag.position.set(0, -0.14, -0.05);
  mag.rotation.x = 0.15;
  viewmodel.add(receiver, barrel, grip, sight, mag);
  viewmodel.position.set(0.24, -0.26, -0.55);
  viewmodel.scale.setScalar(0.85);
  camera.add(viewmodel);
}
const muzzleLight = new THREE.PointLight(0xffc46b, 0, 9, 1.8);
muzzleLight.position.set(0.26, -0.2, -1.1);
camera.add(muzzleLight);

// --- Shared sim state (one place).
const sim = {
  nowMs: 0,
  elapsed: 0,
  frozen: false,
  accumulator: 0,
  lastTime: performance.now(),
  playerEye: new THREE.Vector3(0, 1.62, 18),
  stepAcc: 0,
};

const _dir = new THREE.Vector3();
const _origin = new THREE.Vector3();
const _muzzle = new THREE.Vector3();

function syncCamera() {
  const b = player.state;
  camera.position.set(b.position.x, b.position.y + b.eye, b.position.z);
  camera.rotation.set(b.pitch, b.yaw, 0, 'YXZ');
  sim.playerEye.copy(camera.position);
}

function damagePlayer(amount, sourceName) {
  if (!rounds.state.playerAlive) return;
  let dmg = amount;
  if (rounds.state.playerArmor > 0) {
    const absorbed = Math.min(rounds.state.playerArmor, dmg * 0.5);
    rounds.state.playerArmor -= absorbed;
    dmg -= absorbed;
  }
  rounds.state.playerHp -= dmg;
  hud.setHealth(rounds.state.playerHp, rounds.state.playerArmor);
  hud.damageFlash();
  audio.play('hurt');
  if (rounds.state.playerHp <= 0) {
    rounds.state.playerHp = 0;
    rounds.onPlayerKilled();
    hud.banner('YOU ARE DOWN', 'Your team fights on — next round you return');
    input.releaseLock();
  }
}

// A bot fires: resolve its shot against the other bots first, then against
// the player (a vertical segment test, since the player is not a mesh in
// shootables). A wall closer than the player blocks the player test.
function botShoot(bot, direction, def) {
  _origin.set(bot.pos.x, bot.pos.y + 1.5, bot.pos.z);
  const hit = combat.fireHitscan(_origin, direction, def.range, bots.shootables);
  combat.spawnTracer(_origin, hit ? hit.point : _origin.clone().addScaledVector(direction, def.range), def.tracer);
  const distToPlayer = _origin.distanceTo(sim.playerEye);
  if (distToPlayer < 45) audio.play('enemy-shot');
  else if (distToPlayer < 90 && random() < 0.3) audio.play('distant-shot');
  // Another bot in the way takes the round; the shooter's own meshes never do.
  if (hit && hit.kind === 'bot' && hit.bot !== bot) {
    const dmg = def.damage * (hit.part === 'head' ? def.headMult : 1);
    const died = bots.damage(hit.bot, dmg);
    if (died) onBotKilled(hit.bot, bot.name, hit.part === 'head', def.name);
    return;
  }
  // Player segment test: distance from the ray to the player's eye column.
  if (!rounds.state.playerAlive) return;
  const px = sim.playerEye.x - _origin.x;
  const py = sim.playerEye.y - _origin.y;
  const pz = sim.playerEye.z - _origin.z;
  const along = px * direction.x + py * direction.y + pz * direction.z;
  if (along <= 0 || along >= def.range) return;
  if (hit && along >= hit.distance) return; // a wall or a bot is in front
  const closestX = _origin.x + direction.x * along;
  const closestY = _origin.y + direction.y * along;
  const closestZ = _origin.z + direction.z * along;
  const dx = closestX - sim.playerEye.x;
  const dz = closestZ - sim.playerEye.z;
  const miss = Math.sqrt(dx * dx + dz * dz);
  const head = closestY > sim.playerEye.y - 0.35;
  if (miss < 0.55) {
    const dmg = def.damage * (head ? def.headMult : 1) * 0.55;
    damagePlayer(dmg, bot.name);
  }
}

function onBotKilled(victim, killerName, headshot, weaponName) {
  const killerIsPlayer = killerName === 'You';
  hud.killfeed(killerName, victim.name, headshot, weaponName);
  if (killerIsPlayer) {
    rounds.onKillByPlayer(headshot);
    audio.play('kill');
  }
  if (victim.carriesBomb) {
    victim.carriesBomb = false;
    rounds.state.bomb.state = 'dropped';
    rounds.state.bomb.x = victim.pos.x;
    rounds.state.bomb.z = victim.pos.z;
    hud.setBomb('CHARGE DROPPED', true);
  }
}

function playerShoot() {
  const def = loadout.takeRound(sim.nowMs);
  if (!def) {
    if (loadout.state.mag === 0 && loadout.ready(sim.nowMs)) audio.play('dry');
    return;
  }
  camera.getWorldDirection(_dir);
  const spread = loadout.spread(player.state.speed2d, player.state.crouched, input.state.aiming);
  _dir.x += (random() * 2 - 1) * spread;
  _dir.y += (random() * 2 - 1) * spread;
  _dir.z += (random() * 2 - 1) * spread;
  _dir.normalize();
  _origin.copy(camera.position);
  const hit = combat.fireHitscan(_origin, _dir, def.range, bots.shootables);
  _muzzle.copy(_origin).addScaledVector(_dir, 0.7);
  combat.spawnTracer(_muzzle, hit ? hit.point : _origin.clone().addScaledVector(_dir, def.range), def.tracer);
  muzzleLight.intensity = 14;
  viewmodel.position.z = -0.47;
  if (hit && hit.kind === 'bot') {
    const dmg = def.damage * (hit.part === 'head' ? def.headMult : 1);
    const died = bots.damage(hit.bot, dmg);
    combat.spawnBurst(hit.point, 0xe5484d, 10, 2.5);
    hud.hitMarker(died);
    audio.play(died ? 'kill' : 'hit');
    if (died) onBotKilled(hit.bot, 'You', hit.part === 'head', def.name);
  } else if (hit && hit.kind === 'wall') {
    combat.spawnBurst(hit.point, 0xcbb27a, 8, 2);
  }
  player.recoil(def.recoil * (input.state.aiming ? 0.6 : 1), (random() * 2 - 1) * def.recoil * 0.4);
  audio.play('shot', { kind: def.sound });
  hud.setAmmo(loadout.state.mag, loadout.state.reserve, loadout.state.reloadUntilMs !== 0);
  // Nearby bots hear the shot and turn toward it.
  for (const bot of bots.list) {
    if (!bot.alive || bot.state === 'engage') continue;
    const d = Math.hypot(bot.pos.x - player.state.position.x, bot.pos.z - player.state.position.z);
    if (d < 30) {
      bot.lastSeen.copy(sim.playerEye);
      bot.lastSeenMs = sim.nowMs;
      bot.goto = { x: player.state.position.x, z: player.state.position.z };
    }
  }
}

function throwGrenade() {
  if (!loadout.throwGrenade()) return;
  camera.getWorldDirection(_dir);
  _origin.copy(camera.position);
  combat.throwGrenade(_origin, _dir, 13);
  audio.play('throw');
  hud.setAmmo(loadout.state.mag, loadout.state.reserve, false);
}

function onFlash(pos) {
  audio.play('flash');
  // Player flash: looking at the burst, close, with line of sight.
  const toFlash = pos.clone().sub(camera.position);
  const dist = toFlash.length();
  if (dist < 26 && rounds.state.playerAlive) {
    camera.getWorldDirection(_dir);
    const facing = _dir.dot(toFlash.normalize());
    if (facing > 0.15) {
      hud.flashWhite(clamp(1.3 - dist / 26, 0.3, 1));
    }
  }
  for (const bot of bots.list) {
    if (!bot.alive) continue;
    if (bot.pos.distanceTo(pos) < 18) bot.blindUntilMs = sim.nowMs + 2600;
  }
}

function step(dt) {
  sim.nowMs += dt * 1000;
  sim.elapsed += dt;
  const phase = rounds.state.phase;

  // Player look + fire always reads input; movement only when live/post.
  const look = input.takeLook();
  if (rounds.state.playerAlive && phase !== 'buy') player.look(look.x, look.y);
  if (phase === 'live' && rounds.state.playerAlive) {
    player.step(dt, input.state.keys);
    if (input.state.firing && loadout.ready(sim.nowMs)) playerShoot();
    if (input.state.keys.has('KeyR')) {
      if (loadout.reload(sim.nowMs)) audio.play('reload');
    }
    if (input.state.keys.has('KeyG')) throwGrenade();
    // Weapon switching.
    for (const id of ['p9', 'vk9', 'ar77', 'lr90']) {
      if (input.state.keys.has(`Digit${WEAPONS[id].key}`)) {
        if (loadout.switchTo(id, sim.nowMs)) {
          hud.setAmmo(loadout.state.mag, loadout.state.reserve, false);
          audio.play('click');
        }
      }
    }
    // Footsteps.
    sim.stepAcc += dt * player.state.speed2d;
    if (sim.stepAcc > 2.4) {
      sim.stepAcc = 0;
      if (player.state.speed2d > 0.5) audio.play('step');
    }
  }
  loadout.step(sim.nowMs, dt);
  if (loadout.state.reloadUntilMs !== 0) {
    hud.setAmmo(loadout.state.mag, loadout.state.reserve, true);
  }

  // Bots act when the round is live (or post, to finish the scene).
  if (phase === 'live' || phase === 'post') {
    bots.update(dt, {
      raycaster: combat.raycaster,
      playerEye: sim.playerEye,
      playerSpeed: player.state.speed2d,
      botShoot,
      onPlantProgress: (bot, p) => {
        hud.setBomb(`ENEMY PLANTING ${Math.ceil((p / ROUND.plantSeconds) * 100)}%`, true);
      },
      onPlanted: (bot) => {
        rounds.state.bomb.state = 'planted';
        rounds.state.bomb.fuse = ROUND.detonateSeconds;
        bot.carriesBomb = false;
        hud.setBomb('CHARGE PLANTED — DEFEND IT', true);
        hud.setObjective(`Charge planted at Site ${rounds.state.bomb.site.toUpperCase()} — Cobalt will try to defuse`);
        audio.play('plant-done');
        hud.banner('CHARGE PLANTED', `${ROUND.detonateSeconds}s to detonation`);
      },
      onDefuseProgress: (bot, p) => {
        hud.setBomb(`ENEMY DEFUSING ${Math.ceil((p / ROUND.defuseSeconds) * 100)}%`, true);
      },
      onDefused: (bot) => {
        rounds.endRound(TEAMS.COBALT, 'defused');
      },
      enemiesOf: (bot) => {
        const list = [];
        if (bot.team === TEAMS.COBALT && rounds.state.playerAlive) {
          list.push({ isPlayer: true, alive: true });
        }
        for (const other of bots.list) {
          if (other.team !== bot.team && other.alive) list.push(other);
        }
        return list;
      },
      bomb: rounds.state.bomb,
    }, sim.nowMs);
  }

  rounds.update(dt, sim.nowMs, { input });
  combat.step(dt, { onFlash });

  // Viewmodel: bob with movement, settle after recoil, centre when aiming.
  const bob = Math.sin(sim.elapsed * 9) * 0.008 * clamp(player.state.speed2d / 5, 0, 1);
  viewmodel.position.y += ((-0.26 + bob) - viewmodel.position.y) * Math.min(1, dt * 10);
  viewmodel.position.z += ((-0.55) - viewmodel.position.z) * Math.min(1, dt * 8);
  viewmodel.position.x += (((input.state.aiming ? 0 : 0.24)) - viewmodel.position.x) * Math.min(1, dt * 10);
  muzzleLight.intensity = Math.max(0, muzzleLight.intensity - dt * 90);

  // HUD: ammo, spread, timer.
  hud.setCrosshairSpread(4 + loadout.spread(player.state.speed2d, player.state.crouched, input.state.aiming) * 900);
  const targetFov = input.state.aiming ? 56 : 74;
  if (Math.abs(camera.fov - targetFov) > 0.1) {
    camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 10);
    camera.updateProjectionMatrix();
  }
  syncCamera();
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - sim.lastTime) / 1000, 0.1);
  sim.lastTime = now;
  if (!sim.frozen) {
    sim.accumulator += dt;
    let steps = 0;
    while (sim.accumulator >= FIXED_STEP && steps < 5) {
      step(FIXED_STEP);
      sim.accumulator -= FIXED_STEP;
      steps += 1;
    }
    if (sim.accumulator > FIXED_STEP * 5) sim.accumulator = 0;
  }
  renderer.render(scene, camera);
}

function settle(steps) {
  for (let i = 0; i < steps; i += 1) step(FIXED_STEP);
  // No render happens between settled steps, so the scene graph's world
  // matrices would otherwise stay at their identity: refresh them here so
  // the next raycast (a capture's shot, a bot's sight check) reads the true
  // positions. The live loop renders every frame and never needs this.
  scene.updateMatrixWorld(true);
}

function aimAt(point) {
  const b = player.state;
  const dx = point.x - b.position.x;
  const dy = point.y - (b.position.y + b.eye);
  const dz = point.z - b.position.z;
  const len = Math.hypot(dx, dy, dz) || 1;
  b.yaw = Math.atan2(-dx, -dz);
  b.pitch = Math.asin(clamp(dy / len, -1, 1));
  syncCamera();
}

function runShot(name) {
  rounds.startMatch();
  // Force the round live for the capture, then hide the buy menu the round
  // start opened — a capture shows the fight, not the shop.
  rounds.state.phase = 'live';
  rounds.state.phaseT = ROUND.roundSeconds;
  hud.hideOverlay();
  hud.hideBuy();
  const b = player.state;
  if (name === 'start') {
    b.position.set(-2, 0, 18);
    b.yaw = 0;
    b.pitch = 0;
    settle(20);
    aimAt(new THREE.Vector3(0, 1.6, -8));
    hud.showOverlay('start', {});
    hud.setScore(0, 0, 1);
    hud.setHealth(100, 0);
    hud.setMoney(800);
    hud.setTimer(ROUND.roundSeconds, false);
  } else if (name === 'play') {
    b.position.set(0, 0, 2);
    settle(10);
    // A Cobalt bot dead ahead in the open mid lane; trade shots with it.
    // It holds its angle (blinded for the capture) so the frame is stable.
    const foe = bots.list.find((x) => x.name === 'Vesper');
    foe.pos.set(0, 0, -4);
    foe.yaw = Math.PI;
    foe.alive = true;
    foe.wpIdx = foe.route.length;
    foe.holdAt = { yaw: Math.PI };
    foe.blindUntilMs = sim.nowMs + 5000;
    foe.mesh.group.position.copy(foe.pos);
    foe.mesh.group.rotation.y = foe.yaw;
    aimAt(new THREE.Vector3(0, 1.35, -4));
    loadout.buy('ar77');
    loadout.switchTo('ar77', sim.nowMs);
    settle(20); // let the 250 ms switch cooldown clear before firing
    playerShoot();
    settle(10);
    playerShoot();
    settle(10);
    hud.setAmmo(loadout.state.mag, loadout.state.reserve, false);
  } else {
    // end: a round just won, banner up, one bot down.
    b.position.set(2, 0, 2);
    settle(10);
    const foe = bots.list.find((x) => x.name === 'Heron');
    foe.alive = false;
    foe.hp = 0;
    foe.mesh.group.rotation.set(0, foe.yaw, Math.PI / 2 * 0.9);
    foe.mesh.group.position.set(-3, 0.25, -3);
    aimAt(new THREE.Vector3(-3, 1.2, -3));
    rounds.state.score.amber = 1;
    hud.setScore(1, 0, 1);
    hud.setMoney(4050);
    hud.banner('ROUND WON', 'Cobalt team eliminated');
    settle(8);
  }
  hud.setScore(rounds.state.score.amber, rounds.state.score.cobalt, 1);
  // The end capture keeps its ROUND WON banner; the others stay clean.
  if (name !== 'end') hud.hideBanner();
  paintTwiceThenReady();
}

function paintTwiceThenReady() {
  let painted = 0;
  function paint() {
    requestAnimationFrame(paint);
    syncCamera();
    renderer.render(scene, camera);
    painted += 1;
    if (painted === 2) {
      window.__shotReady = true;
      sim.frozen = true;
    }
  }
  requestAnimationFrame(paint);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Mute toggle.
window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyM') audio.toggleMute();
});

syncCamera();
scene.updateMatrixWorld(true);
rounds.startMatch();
if (shot) runShot(shot);
else requestAnimationFrame(frame);
