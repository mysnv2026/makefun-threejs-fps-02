// Player movement: acceleration, friction, crouch, jump and AABB collision.
// One job: integrate the input state into a body (position, yaw, pitch, eye)
// on the fixed step. The camera only copies this body; it never moves itself.
import * as THREE from 'three';
import { MOVE } from './config.js';
import { clamp } from './rng.js';
import { collideCircle } from './map.js';

export function createPlayer(colliders, bounds) {
  const body = {
    position: new THREE.Vector3(0, 0, 18),
    velocity: new THREE.Vector3(),
    yaw: 0, // 0 faces -Z (toward Cobalt)
    pitch: 0,
    eye: MOVE.eyeHeight,
    crouched: false,
    onGround: true,
    speed2d: 0, // horizontal speed, for spread and the HUD
  };

  function look(dx, dy) {
    const sens = 0.0021;
    body.yaw -= dx * sens;
    body.pitch = clamp(body.pitch - dy * sens, -1.53, 1.53);
  }

  function step(dt, keys) {
    const crouchKey = keys.has('ControlLeft') || keys.has('ControlRight') || keys.has('KeyC');
    body.crouched = crouchKey;
    const targetEye = crouchKey ? MOVE.crouchEye : MOVE.eyeHeight;
    body.eye += (targetEye - body.eye) * Math.min(1, dt * 12);

    // Wish direction in world space from yaw.
    let fx = 0;
    let fz = 0;
    if (keys.has('KeyW') || keys.has('ArrowUp')) fz -= 1;
    if (keys.has('KeyS') || keys.has('ArrowDown')) fz += 1;
    if (keys.has('KeyA') || keys.has('ArrowLeft')) fx -= 1;
    if (keys.has('KeyD') || keys.has('ArrowRight')) fx += 1;
    const len = Math.hypot(fx, fz) || 1;
    fx /= len;
    fz /= len;
    const sin = Math.sin(body.yaw);
    const cos = Math.cos(body.yaw);
    const wx = fx * cos - fz * sin;
    const wz = fx * sin + fz * cos;

    const maxSpeed = crouchKey ? MOVE.crouchSpeed : MOVE.walkSpeed;
    body.velocity.x += wx * MOVE.accel * dt;
    body.velocity.z += wz * MOVE.accel * dt;
    // Friction: bleed speed when no input, cap at max speed.
    const hv = Math.hypot(body.velocity.x, body.velocity.z);
    if (hv > 0.001) {
      const drop = Math.max(0, hv - MOVE.friction * hv * dt * (fx === 0 && fz === 0 ? 1 : 0.12));
      const cap = Math.min(drop, maxSpeed);
      body.velocity.x *= cap / hv;
      body.velocity.z *= cap / hv;
    }

    body.position.x += body.velocity.x * dt;
    body.position.z += body.velocity.z * dt;
    collideCircle(body.position, MOVE.radius, colliders);
    body.position.x = clamp(body.position.x, bounds.minX, bounds.maxX);
    body.position.z = clamp(body.position.z, bounds.minZ, bounds.maxZ);

    if ((keys.has('Space')) && body.onGround) {
      body.velocity.y = MOVE.jumpSpeed;
      body.onGround = false;
    }
    body.velocity.y -= MOVE.gravity * dt;
    body.position.y += body.velocity.y * dt;
    if (body.position.y <= 0) {
      body.position.y = 0;
      body.velocity.y = 0;
      body.onGround = true;
    }
    body.speed2d = Math.hypot(body.velocity.x, body.velocity.z);
  }

  function recoil(pitchKick, yawKick) {
    body.pitch = clamp(body.pitch + pitchKick, -1.53, 1.53);
    body.yaw += yawKick;
  }

  function reset(spawn) {
    body.position.set(spawn.x, 0, spawn.z);
    body.velocity.set(0, 0, 0);
    body.yaw = spawn.z > 0 ? 0 : Math.PI;
    body.pitch = 0;
    body.eye = MOVE.eyeHeight;
    body.crouched = false;
    body.onGround = true;
  }

  return { state: body, look, step, recoil, reset };
}
