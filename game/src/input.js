// Keyboard and mouse state, sampled by the controllers once per frame.
// Keys are tracked by event code (KeyW, ArrowUp, ...) so the player's own
// keyboard layout never matters. Alongside the set of keys currently held,
// the class remembers one-shot presses (F climbs into a car, H sounds the
// horn) and accumulates mouse travel for the orbit camera, which runs
// under pointer lock while playing.

const SWALLOWED = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'];

export class Input {
  constructor(element) {
    this.keys = new Set();      // codes held down at this moment
    this.pressed = new Set();   // codes that went down since the last frame
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.mouseDown = false;
    this.rightDown = false;
    this.wheel = 0;
    this.locked = false;

    addEventListener('keydown', (e) => {
      if (!e.repeat) this.pressed.add(e.code);
      this.keys.add(e.code);
      if (SWALLOWED.includes(e.code)) e.preventDefault();
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => {
      this.keys.clear();
      this.mouseDown = false;
      this.rightDown = false;
    });

    element.addEventListener('mousedown', (e) => {
      if (e.button === 0) this.mouseDown = true;
      if (e.button === 2) this.rightDown = true;
    });
    addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouseDown = false;
      if (e.button === 2) this.rightDown = false;
    });
    element.addEventListener('contextmenu', (e) => e.preventDefault());
    addEventListener('mousemove', (e) => {
      if (this.locked || this.rightDown) {
        this.mouseDX += e.movementX || 0;
        this.mouseDY += e.movementY || 0;
      }
    });
    element.addEventListener('wheel', (e) => { this.wheel += Math.sign(e.deltaY); }, { passive: true });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === element;
    });
  }

  /** True while any one of the given codes is held down. */
  down(...codes) { return codes.some((c) => this.keys.has(c)); }

  /** True only on the frame a key first goes down; reading consumes it. */
  justPressed(code) {
    if (!this.pressed.has(code)) return false;
    this.pressed.delete(code);
    return true;
  }

  /** Call once per frame, once every controller has taken what it needs. */
  endFrame() {
    this.pressed.clear();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.wheel = 0;
  }

  /** Read two key groups as a -1..1 axis; the pos group counts positive. */
  axis(neg, pos) {
    return (this.down(...pos) ? 1 : 0) - (this.down(...neg) ? 1 : 0);
  }
}
