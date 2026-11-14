// control.js — primera persona: WASD o flechas para caminar, ratón para mirar (clic para capturarlo), Q/E subir/bajar.
// «Quieto» = sin teclas pulsadas ni movimiento de ratón durante un instante.
export class Control {
  constructor(lienzo) {
    this.pos = [0, 0, 0]; this.yaw = 0; this.pitch = 0; this.teclas = new Set(); this.ultimo = -1e9;
    addEventListener('keydown', (e) => { this.teclas.add(e.code); });
    addEventListener('keyup', (e) => { this.teclas.delete(e.code); });
    lienzo.addEventListener('click', () => lienzo.requestPointerLock && lienzo.requestPointerLock());
    addEventListener('mousemove', (e) => {
      if (document.pointerLockElement !== lienzo) return;
      this.yaw -= e.movementX * 0.0022; this.pitch = Math.max(-1.3, Math.min(1.3, this.pitch - e.movementY * 0.0022));
      if (Math.abs(e.movementX) + Math.abs(e.movementY) > 0) this.ultimo = performance.now();
    });
  }
  paso(dt) {
    const k = this.teclas, ad = (k.has('KeyW') || k.has('ArrowUp')) - (k.has('KeyS') || k.has('ArrowDown'));
    const la = (k.has('KeyD') || k.has('ArrowRight')) - (k.has('KeyA') || k.has('ArrowLeft')), ar = k.has('KeyE') - k.has('KeyQ');
    if (ad || la || ar) {
      const v = 1.3 * dt * (k.has('ShiftLeft') ? 2.2 : 1), s = Math.sin(this.yaw), c = Math.cos(this.yaw);
      this.pos[0] += (-s * ad + c * la) * v; this.pos[2] += (-c * ad - s * la) * v; this.pos[1] += ar * v;
      this.ultimo = performance.now();
    }
  }
  get quietoDesde() { return performance.now() - this.ultimo; }
}
