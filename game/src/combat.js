// Combat: hitscan resolution, tracers, impact particles and the spark grenade.
// One job: turn a shot (origin, direction, weapon) into a hit, and draw the
// feedback. It owns the only Raycaster the sim uses, plus pooled tracer and
// particle objects so the hot loop allocates nothing per frame.
import * as THREE from 'three';

const _origin = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _point = new THREE.Vector3();
const _vel = new THREE.Vector3();

export function createCombat(scene, map) {
  const raycaster = new THREE.Raycaster();
  raycaster.far = 140;

  // --- Tracer pool (fading lines).
  const tracers = [];
  const tracerMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 });
  for (let i = 0; i < 24; i += 1) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const line = new THREE.Line(geo, tracerMat.clone());
    line.visible = false;
    line.frustumCulled = false;
    scene.add(line);
    tracers.push({ line, life: 0 });
  }
  let tracerIdx = 0;

  // --- Particle pool (single Points cloud, fixed size).
  const P_MAX = 320;
  const pGeo = new THREE.BufferGeometry();
  const pPos = new Float32Array(P_MAX * 3);
  const pCol = new Float32Array(P_MAX * 3);
  pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
  pGeo.setAttribute('color', new THREE.BufferAttribute(pCol, 3));
  const pMat = new THREE.PointsMaterial({ size: 0.09, vertexColors: true, transparent: true, opacity: 0.95, depthWrite: false });
  const points = new THREE.Points(pGeo, pMat);
  points.frustumCulled = false;
  scene.add(points);
  const parts = [];
  for (let i = 0; i < P_MAX; i += 1) parts.push({ alive: false, vx: 0, vy: 0, vz: 0, life: 0, idx: i });
  let partIdx = 0;

  // --- Grenades in flight.
  const grenades = [];
  const grenadeGeo = new THREE.SphereGeometry(0.09, 10, 8);
  const grenadeMat = new THREE.MeshStandardMaterial({ color: 0xf0a830, emissive: 0x7a4d00, emissiveIntensity: 0.5 });

  function spawnTracer(from, to, color) {
    const t = tracers[tracerIdx];
    tracerIdx = (tracerIdx + 1) % tracers.length;
    const attr = t.line.geometry.getAttribute('position');
    attr.setXYZ(0, from.x, from.y, from.z);
    attr.setXYZ(1, to.x, to.y, to.z);
    attr.needsUpdate = true;
    t.line.material.color.setHex(color);
    t.line.material.opacity = 0.9;
    t.line.visible = true;
    t.life = 0.09;
  }

  function spawnBurst(point, colorHex, count, speed = 3.2) {
    const c = new THREE.Color(colorHex);
    for (let n = 0; n < count; n += 1) {
      const p = parts[partIdx];
      partIdx = (partIdx + 1) % P_MAX;
      p.alive = true;
      p.life = 0.35 + Math.random() * 0.3;
      p.vx = (Math.random() - 0.5) * speed;
      p.vy = Math.random() * speed * 0.8 + 0.5;
      p.vz = (Math.random() - 0.5) * speed;
      pPos[p.idx * 3] = point.x;
      pPos[p.idx * 3 + 1] = point.y;
      pPos[p.idx * 3 + 2] = point.z;
      pCol[p.idx * 3] = c.r;
      pCol[p.idx * 3 + 1] = c.g;
      pCol[p.idx * 3 + 2] = c.b;
    }
    pGeo.getAttribute('position').needsUpdate = true;
    pGeo.getAttribute('color').needsUpdate = true;
  }

  // Raycast a shot against bot hit meshes first, then the map. shootables is
  // the flat list of meshes with userData.bot/userData.part; occluders are
  // the map's solid meshes. Returns null on a clean miss.
  function fireHitscan(origin, direction, range, shootables) {
    raycaster.far = range;
    raycaster.set(origin, direction);
    const hits = raycaster.intersectObjects(shootables, false);
    const wallHits = raycaster.intersectObjects(map.occluders, false);
    const wall = wallHits.length > 0 ? wallHits[0] : null;
    const flesh = hits.length > 0 ? hits[0] : null;
    if (flesh && (!wall || flesh.distance <= wall.distance)) {
      return { kind: 'bot', bot: flesh.object.userData.bot, part: flesh.object.userData.part, point: flesh.point.clone(), distance: flesh.distance };
    }
    if (wall) {
      return { kind: 'wall', point: wall.point.clone(), distance: wall.distance };
    }
    return null;
  }

  function muzzlePoint(origin, direction, distance = 0.7) {
    _point.copy(origin).addScaledVector(direction, distance);
    return _point;
  }

  function throwGrenade(from, direction, power = 13) {
    const mesh = new THREE.Mesh(grenadeGeo, grenadeMat);
    mesh.position.copy(from);
    scene.add(mesh);
    _vel.copy(direction).multiplyScalar(power);
    _vel.y += 3.2;
    grenades.push({ mesh, vel: _vel.clone(), fuse: 1.6, bounces: 0 });
  }

  function step(dt, { onFlash }) {
    // Tracers fade.
    for (const t of tracers) {
      if (!t.visible) continue;
      t.life -= dt;
      t.line.material.opacity = Math.max(0, t.life / 0.09) * 0.9;
      if (t.life <= 0) t.visible = false;
    }
    // Particles fall and fade.
    let anyAlive = false;
    for (const p of parts) {
      if (!p.alive) continue;
      anyAlive = true;
      p.life -= dt;
      if (p.life <= 0) {
        p.alive = false;
        pPos[p.idx * 3 + 1] = -100;
        continue;
      }
      p.vy -= 9 * dt;
      pPos[p.idx * 3] += p.vx * dt;
      pPos[p.idx * 3 + 1] += p.vy * dt;
      pPos[p.idx * 3 + 2] += p.vz * dt;
      if (pPos[p.idx * 3 + 1] < 0.02) { pPos[p.idx * 3 + 1] = 0.02; p.vy *= -0.3; }
    }
    if (anyAlive) pGeo.getAttribute('position').needsUpdate = true;

    // Grenades: gravity, ground bounce, fuse.
    for (let i = grenades.length - 1; i >= 0; i -= 1) {
      const g = grenades[i];
      g.fuse -= dt;
      g.vel.y -= 14 * dt;
      g.mesh.position.addScaledVector(g.vel, dt);
      const p = g.mesh.position;
      if (p.y < 0.09) {
        p.y = 0.09;
        g.vel.y *= -0.42;
        g.vel.x *= 0.7;
        g.vel.z *= 0.7;
        g.bounces += 1;
      }
      if (p.x < -31 || p.x > 31) g.vel.x *= -0.5;
      if (p.z < -21 || p.z > 21) g.vel.z *= -0.5;
      if (g.fuse <= 0) {
        scene.remove(g.mesh);
        grenades.splice(i, 1);
        spawnBurst(p, 0xfff2b0, 40, 7);
        if (onFlash) onFlash(p.clone());
      }
    }
  }

  return { fireHitscan, spawnTracer, spawnBurst, muzzlePoint, throwGrenade, step, raycaster };
}

// Line of sight between two eye points: true when no occluder is closer
// than the target. Uses the shared raycaster, no allocation per call.
export function hasLineOfSight(raycaster, occluders, from, to) {
  _dir.subVectors(to, from);
  const dist = _dir.length();
  if (dist < 0.001) return true;
  _dir.multiplyScalar(1 / dist);
  raycaster.far = dist;
  raycaster.set(from, _dir);
  return raycaster.intersectObjects(occluders, false).length === 0;
}
