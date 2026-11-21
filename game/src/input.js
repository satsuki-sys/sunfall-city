// input.js — keyboard and mouse state for the game. One Input object listens
// on the window and the canvas; the world polls it each frame. It tracks held
// keys, keys pressed since the last frame (for one-shot actions like entering
// a car or pausing), accumulated mouse movement while the pointer is locked,
// and whether the primary mouse button is down (for shooting).

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.held = new Set();       // KeyboardEvent.code values currently down
    this.pressedNow = new Set(); // codes that went down since the last clearPressed()
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.mouseDown = false;
    this.locked = false;

    addEventListener('keydown', (e) => {
      if (e.code === 'Space') e.preventDefault(); // keep the page from scrolling
      if (!e.repeat) this.pressedNow.add(e.code);
      this.held.add(e.code);
    });
    addEventListener('keyup', (e) => this.held.delete(e.code));
    addEventListener('blur', () => { this.held.clear(); this.mouseDown = false; });

    canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0) this.mouseDown = true;
    });
    addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouseDown = false;
    });
    document.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.mouseDX += e.movementX || 0;
      this.mouseDY += e.movementY || 0;
    });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
    });
  }

  // Ask the browser to lock the pointer to the canvas (mouse look). Browsers
  // only grant this from a user gesture, so callers invoke it on clicks.
  requestLock() {
    if (!this.locked) this.canvas.requestPointerLock?.();
  }

  releaseLock() {
    if (this.locked) document.exitPointerLock?.();
  }

  isDown(code) {
    return this.held.has(code);
  }

  // True only on the frame the key went down. The world clears the set at
  // the end of every frame with clearPressed().
  wasPressed(code) {
    return this.pressedNow.has(code);
  }

  clearPressed() {
    this.pressedNow.clear();
  }

  // Mouse movement since the last call, for camera yaw/pitch.
  takeMouseDelta() {
    const d = { x: this.mouseDX, y: this.mouseDY };
    this.mouseDX = 0;
    this.mouseDY = 0;
    return d;
  }
}
