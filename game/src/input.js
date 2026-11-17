// Input: keyboard state, mouse look deltas and pointer lock.
// One job: turn browser events into a plain state object the sim reads.
// Nothing here moves the player; player.js does that from this state.
export function createInput(canvas, { onLockChange, onAction }) {
  const state = {
    keys: new Set(),
    lookX: 0, // accumulated mouse dx since last takeLook
    lookY: 0,
    firing: false,
    aiming: false,
    locked: false,
  };

  function onKeyDown(e) {
    if (e.repeat) return;
    state.keys.add(e.code);
    if (onAction) onAction(e.code, true);
    if (e.code === 'Space') e.preventDefault();
  }
  function onKeyUp(e) {
    state.keys.delete(e.code);
    if (onAction) onAction(e.code, false);
  }
  function onMouseMove(e) {
    if (!state.locked) return;
    state.lookX += e.movementX || 0;
    state.lookY += e.movementY || 0;
  }
  function onMouseDown(e) {
    if (!state.locked) return;
    if (e.button === 0) state.firing = true;
    if (e.button === 2) state.aiming = true;
  }
  function onMouseUp(e) {
    if (e.button === 0) state.firing = false;
    if (e.button === 2) state.aiming = false;
  }
  function onLock() {
    state.locked = document.pointerLockElement === canvas;
    if (onLockChange) onLockChange(state.locked);
  }
  function onContextMenu(e) {
    e.preventDefault();
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mouseup', onMouseUp);
  window.addEventListener('contextmenu', onContextMenu);
  document.addEventListener('pointerlockchange', onLock);

  return {
    state,
    requestLock() {
      canvas.requestPointerLock();
    },
    releaseLock() {
      if (document.pointerLockElement) document.exitPointerLock();
    },
    takeLook() {
      const look = { x: state.lookX, y: state.lookY };
      state.lookX = 0;
      state.lookY = 0;
      return look;
    },
  };
}
