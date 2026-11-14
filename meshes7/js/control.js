// control.js — primera persona: WASD o flechas para caminar, ratón para mirar (clic para capturarlo).
// Se camina libremente; solo los objetos sólidos cierran el paso (terreno.js). Los ojos, siempre a 1,6 del suelo común.
export class Control {
  constructor(lienzo) {
    this.pos = [0, 1.6, 0]; this.yaw = 0; this.pitch = 0; this.teclas = new Set(); this.ultimo = -1e9; this.choque = 0;
    addEventListener('keydown', (e) => { this.teclas.add(e.code); });
    addEventListener('keyup', (e) => { this.teclas.delete(e.code); });
    lienzo.addEventListener('click', () => lienzo.requestPointerLock && lienzo.requestPointerLock());
    addEventListener('mousemove', (e) => {
      if (document.pointerLockElement !== lienzo) return;
      this.yaw -= e.movementX * 0.0022; this.pitch = Math.max(-1.3, Math.min(1.3, this.pitch - e.movementY * 0.0022));
      this.miro = performance.now();
    });
  }
  // devuelve si el jugador ha intentado desplazarse (no solo mirar)
  paso(dt, terreno) {
    const k = this.teclas, ad = (k.has('KeyW') || k.has('ArrowUp')) - (k.has('KeyS') || k.has('ArrowDown'));
    const la = (k.has('KeyD') || k.has('ArrowRight')) - (k.has('KeyA') || k.has('ArrowLeft'));
    const P = this.pos;
    if (ad || la) {
      const v = 3 * dt * (k.has('ShiftLeft') ? 2.5 : 1), s = Math.sin(this.yaw), c = Math.cos(this.yaw);
      const dx = (-s * ad + c * la) * v, dz = (-c * ad - s * la) * v;
      if (terreno.libre(P[0] + dx, P[2] + dz)) { P[0] += dx; P[2] += dz; }
      else if (terreno.libre(P[0] + dx, P[2])) P[0] += dx;
      else if (terreno.libre(P[0], P[2] + dz)) P[2] += dz;
      else this.choque = performance.now();
      this.ultimo = performance.now();
    }
    if (terreno) P[1] = terreno.altura();
    return !!(ad || la);
  }
}
