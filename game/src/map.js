// FOUNDRY YARD — SANDLINE's only map, built from boxes, cylinders and one
// procedural ground texture. No imported models, no network assets.
// Layout (metres, x east, z south; Amber spawns south, Cobalt north):
//   Site A west, Site B east, three lanes between the spawns: A-long (west),
//   Mid (centre, through the furnace hall) and B-tunnel (east).
// Every solid registers an AABB collider (for movement) and, when tall enough
// to block sight, an occluder mesh (for bot line-of-sight and bullet rays).
import * as THREE from 'three';
import { PALETTE } from './config.js';

const GROUND_W = 64;
const GROUND_D = 44;

function groundTexture() {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 352;
  const g = c.getContext('2d');
  g.fillStyle = '#8a7a5c';
  g.fillRect(0, 0, c.width, c.height);
  // Sand speckle.
  for (let i = 0; i < 5200; i += 1) {
    const v = 100 + Math.floor(Math.random() * 70);
    g.fillStyle = `rgba(${v}, ${v - 18}, ${v - 52}, 0.25)`;
    g.fillRect(Math.random() * c.width, Math.random() * c.height, 2, 2);
  }
  // Expansion joints.
  g.strokeStyle = 'rgba(40,32,20,0.35)';
  g.lineWidth = 2;
  for (let x = 0; x <= c.width; x += 64) {
    g.beginPath(); g.moveTo(x, 0); g.lineTo(x, c.height); g.stroke();
  }
  for (let y = 0; y <= c.height; y += 64) {
    g.beginPath(); g.moveTo(0, y); g.lineTo(c.width, y); g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(4, 3);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function createMap(scene) {
  const colliders = []; // {minX,maxX,minZ,maxZ,top}
  const occluders = []; // meshes tall enough to block sight
  const group = new THREE.Group();
  group.name = 'foundry-yard';

  const matGround = new THREE.MeshStandardMaterial({ map: groundTexture(), roughness: 0.95 });
  const matWall = new THREE.MeshStandardMaterial({ color: PALETTE.wall, roughness: 0.9 });
  const matWallDark = new THREE.MeshStandardMaterial({ color: PALETTE.wallDark, roughness: 0.9 });
  const matCrate = new THREE.MeshStandardMaterial({ color: PALETTE.crate, roughness: 0.85 });
  const matCrateDark = new THREE.MeshStandardMaterial({ color: PALETTE.crateDark, roughness: 0.85 });
  const matMetal = new THREE.MeshStandardMaterial({ color: PALETTE.metal, roughness: 0.55, metalness: 0.55 });
  const matMetalDark = new THREE.MeshStandardMaterial({ color: PALETTE.metalDark, roughness: 0.6, metalness: 0.5 });
  const matContainerA = new THREE.MeshStandardMaterial({ color: PALETTE.containerA, roughness: 0.7, metalness: 0.35 });
  const matContainerB = new THREE.MeshStandardMaterial({ color: PALETTE.containerB, roughness: 0.7, metalness: 0.35 });

  function box(x, y, z, w, h, d, material, { solid = true, occlude = true, shadow = true } = {}) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    m.position.set(x, y + h / 2, z);
    m.castShadow = shadow;
    m.receiveShadow = true;
    m.userData.solid = solid;
    group.add(m);
    if (solid) colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2, top: y + h });
    if (occlude && h >= 1.6) occluders.push(m);
    return m;
  }

  function cylinder(x, z, r, h, material) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 18), material);
    m.position.set(x, h / 2, z);
    m.castShadow = true;
    m.receiveShadow = true;
    group.add(m);
    colliders.push({ minX: x - r, maxX: x + r, minZ: z - r, maxZ: z + r, top: h });
    if (h >= 1.6) occluders.push(m);
    return m;
  }

  // Ground.
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(GROUND_W, GROUND_D), matGround);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  group.add(ground);

  // Perimeter walls (height 4, thick 1).
  box(0, 0, -GROUND_D / 2 - 0.5, GROUND_W + 2, 4, 1, matWallDark);
  box(0, 0, GROUND_D / 2 + 0.5, GROUND_W + 2, 4, 1, matWallDark);
  box(-GROUND_W / 2 - 0.5, 0, 0, 1, 4, GROUND_D + 2, matWallDark);
  box(GROUND_W / 2 + 0.5, 0, 0, 1, 4, GROUND_D + 2, matWallDark);

  // --- Site A (west): container stack + crates, open long sightline from mid.
  box(-22, 0, -10, 8, 2.6, 2.4, matContainerA);
  box(-22, 2.6, -10, 5, 2.4, 2.2, matContainerB);
  box(-26, 0, -4, 2, 1.2, 2, matCrate);
  box(-17, 0, -14, 2, 1.2, 2, matCrateDark);
  box(-18, 0, -5, 1.2, 1.2, 1.2, matCrate);
  cylinder(-24, -14, 0.9, 2.2, matMetal);

  // --- Site B (east): furnace block + tunnel mouth.
  box(22, 0, -10, 7, 3.2, 3, matMetalDark);
  box(18, 0, -13, 3, 1.4, 2, matCrate);
  box(26, 0, -5, 2, 1.2, 2, matCrateDark);
  box(24, 0, -15, 1.2, 1.2, 1.2, matCrate);
  cylinder(26, -13, 0.9, 2.4, matMetal);

  // --- Mid: furnace hall pillars and the central block.
  box(-4, 0, -2, 3, 3.4, 1.2, matWallDark);
  box(4, 0, -2, 3, 3.4, 1.2, matWallDark);
  box(0, 0, -8, 6, 1.1, 1.4, matCrate); // low wall, shoot over it
  box(0, 0, 6, 4, 1.1, 1.2, matCrateDark);
  cylinder(-8, 2, 1.0, 2.6, matMetal);
  cylinder(8, 2, 1.0, 2.6, matMetal);

  // --- A-long (west lane): staggered cover.
  box(-14, 0, 8, 2, 1.3, 2, matCrate);
  box(-20, 0, 4, 1.4, 1.1, 1.4, matCrateDark);
  box(-12, 0, -12, 2.4, 2.4, 1.2, matWall);
  // --- B-tunnel (east lane): staggered cover.
  box(14, 0, 8, 2, 1.3, 2, matCrate);
  box(20, 0, 4, 1.4, 1.1, 1.4, matCrateDark);
  box(12, 0, -12, 2.4, 2.4, 1.2, matWall);
  // --- Spawn cover.
  box(-6, 0, 15, 3, 1.2, 1.2, matCrate);
  box(6, 0, 15, 3, 1.2, 1.2, matCrate);
  box(-6, 0, -16, 3, 1.2, 1.2, matCrateDark);
  box(6, 0, -16, 3, 1.2, 1.2, matCrateDark);

  // Site markers: glowing rings + letter boards so the objective reads at a glance.
  const sites = {};
  for (const [key, x, z, color] of [['a', -22, -10, PALETTE.accentAmber], ['b', 22, -10, PALETTE.accentCobalt]]) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(2.6, 3.1, 40),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.55, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x, 0.03, z);
    group.add(ring);
    const board = new THREE.Mesh(
      new THREE.BoxGeometry(1.6, 1.6, 0.2),
      new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.7 }),
    );
    board.position.set(x, 3.4, z - 3.4);
    group.add(board);
    sites[key] = { x, z, r: 3.4, ring, board };
  }

  // Distant skyline silhouettes outside the walls, for depth (no collision).
  const skyline = new THREE.Group();
  const matSky = new THREE.MeshBasicMaterial({ color: 0x232830 });
  for (let i = 0; i < 14; i += 1) {
    const w = 6 + (i % 4) * 3;
    const h = 8 + ((i * 7) % 14);
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, 2), matSky);
    const angle = (i / 14) * Math.PI * 2;
    b.position.set(Math.cos(angle) * 52, h / 2 - 1, Math.sin(angle) * 52);
    skyline.add(b);
  }
  group.add(skyline);

  scene.add(group);

  // Waypoint graph: nodes bots walk between. links are node indices.
  // 0-3 Amber spawn, 4-7 Cobalt spawn, 8 mid, 9 A-long, 10 B-tunnel,
  // 11 site A, 12 site B, 13-14 mid doors, 15-16 connector corners.
  const waypoints = [
    { x: -4, z: 18, links: [1, 2, 15] },
    { x: 0, z: 18, links: [0, 3, 8] },
    { x: 4, z: 18, links: [1, 3, 16] },
    { x: 0, z: 15, links: [1, 2, 8] },
    { x: -4, z: -18, links: [5, 6, 15] },
    { x: 0, z: -18, links: [4, 7, 8] },
    { x: 4, z: -18, links: [5, 7, 16] },
    { x: 0, z: -15, links: [5, 6, 8] },
    { x: 0, z: 0, links: [1, 3, 5, 7, 9, 10, 13, 14] },
    { x: -14, z: 0, links: [8, 11, 15] },
    { x: 14, z: 0, links: [8, 12, 16] },
    { x: -22, z: -8, links: [9, 13] },
    { x: 22, z: -8, links: [10, 14] },
    { x: -10, z: -10, links: [8, 11] },
    { x: 10, z: -10, links: [8, 12] },
    { x: -14, z: 16, links: [0, 4, 9] },
    { x: 14, z: 16, links: [2, 6, 10] },
  ];

  return {
    group,
    colliders,
    occluders,
    waypoints,
    sites,
    bounds: { minX: -GROUND_W / 2 + 1, maxX: GROUND_W / 2 - 1, minZ: -GROUND_D / 2 + 1, maxZ: GROUND_D / 2 - 1 },
    spawns: {
      amber: [{ x: -6, z: 18 }, { x: -2, z: 19 }, { x: 2, z: 19 }, { x: 6, z: 18 }],
      cobalt: [{ x: -6, z: -18 }, { x: -2, z: -19 }, { x: 2, z: -19 }, { x: 6, z: -18 }],
    },
  };
}

// Push a circle (x,z,radius) out of every AABB it overlaps. Mutates pos.
export function collideCircle(pos, radius, colliders) {
  for (const c of colliders) {
    const cx = Math.max(c.minX, Math.min(pos.x, c.maxX));
    const cz = Math.max(c.minZ, Math.min(pos.z, c.maxZ));
    const dx = pos.x - cx;
    const dz = pos.z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 < radius * radius) {
      if (d2 > 1e-8) {
        const d = Math.sqrt(d2);
        pos.x = cx + (dx / d) * radius;
        pos.z = cz + (dz / d) * radius;
      } else {
        // Centre inside the box: push out along the smallest penetration axis.
        const pushL = pos.x - c.minX + radius;
        const pushR = c.maxX - pos.x + radius;
        const pushT = pos.z - c.minZ + radius;
        const pushB = c.maxZ - pos.z + radius;
        const m = Math.min(pushL, pushR, pushT, pushB);
        if (m === pushL) pos.x = c.minX - radius;
        else if (m === pushR) pos.x = c.maxX + radius;
        else if (m === pushT) pos.z = c.minZ - radius;
        else pos.z = c.maxZ + radius;
      }
    }
  }
}
