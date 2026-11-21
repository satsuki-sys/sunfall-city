// Keyboard and mouse state, sampled by the controllers once per frame. Keys are
// tracked by event code (KeyW, ArrowUp, ...) so keyboard layout never matters.
// Alongside the held-key set, the class keeps one-shot presses (F to enter a
// car, H to honk) and accumulates mouse movement for the orbit camera, which
// uses pointer lock while playing.

const SWALLOWED = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'];

export class Input {
  constructor(element) {
    this.keys = new Set();      // codes currently held down
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

  /** True while any of the given codes is held. */
  down(...codes) { return codes.some((c) => this.keys.has(c)); }

  /** True only on the frame the key first went down; consumes the press. */
  justPressed(code) {
    if (!this.pressed.has(code)) return false;
    this.pressed.delete(code);
    return true;
  }

  /** Call once per frame, after the controllers have read everything. */
  endFrame() {
    this.pressed.clear();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.wheel = 0;
  }

  /** Read a pair of key groups as a -1..1 axis; the pos group counts positive. */
  axis(neg, pos) {
    return (this.down(...pos) ? 1 : 0) - (this.down(...neg) ? 1 : 0);
  }
}
