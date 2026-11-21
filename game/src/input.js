// Keyboard and mouse state, gathered in one place so the rest of the game
// never touches a DOM event. Pointer lock is owned here: the game asks to
// lock, the browser reports back, and mouse movement accumulates until a
// system consumes it for the frame.

export class Input {
  constructor(dom) {
    this.dom = dom;
    this.keys = new Set();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.locked = false;
    this.clicked = false;      // left mouse went down this frame (shooting)
    this.onLockLost = null;    // set by the game: fired when lock drops mid-play

    addEventListener('keydown', (e) => {
      if (e.code === 'Space') e.preventDefault();
      this.keys.add(e.code);
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());

    dom.addEventListener('mousedown', (e) => {
      if (this.locked && e.button === 0) this.clicked = true;
    });
    addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.mouseDX += e.movementX || 0;
      this.mouseDY += e.movementY || 0;
    });
    document.addEventListener('pointerlockchange', () => {
      const was = this.locked;
      this.locked = document.pointerLockElement === dom;
      if (was && !this.locked && this.onLockLost) this.onLockLost();
    });
  }

  lock() {
    if (!this.locked) this.dom.requestPointerLock?.();
  }
  unlock() {
    if (this.locked) document.exitPointerLock?.();
  }
  down(code) {
    return this.keys.has(code);
  }
  // WASD as a wish: x = strafe right, z = forward (both -1..1).
  moveWish() {
    let x = 0, z = 0;
    if (this.down('KeyW') || this.down('ArrowUp')) z += 1;
    if (this.down('KeyS') || this.down('ArrowDown')) z -= 1;
    if (this.down('KeyA') || this.down('ArrowLeft')) x -= 1;
    if (this.down('KeyD') || this.down('ArrowRight')) x += 1;
    return { x, z };
  }
  consumeMouse() {
    const dx = this.mouseDX, dy = this.mouseDY;
    this.mouseDX = 0;
    this.mouseDY = 0;
    return { dx, dy };
  }
  consumeClick() {
    const c = this.clicked;
    this.clicked = false;
    return c;
  }
}
