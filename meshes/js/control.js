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
  // con terreno: solo se camina sobre suelo filmado; la altura sigue al suelo. Sin suelo cerca (primeros planos),
  // se flota en un radio pequeño alrededor de donde nació el plano.
  paso(dt, terreno, ancla) {
    const k = this.teclas, ad = (k.has('KeyW') || k.has('ArrowUp')) - (k.has('KeyS') || k.has('ArrowDown'));
    const la = (k.has('KeyD') || k.has('ArrowRight')) - (k.has('KeyA') || k.has('ArrowLeft')), ar = k.has('KeyE') - k.has('KeyQ');
    if (ad || la || ar) {
      const v = 1.3 * dt * (k.has('ShiftLeft') ? 2.2 : 1), s = Math.sin(this.yaw), c = Math.cos(this.yaw);
      const dx = (-s * ad + c * la) * v, dz = (-c * ad - s * la) * v;
      this.ultimo = performance.now();
      if (terreno && terreno.libre(this.pos[0], this.pos[2])) {
        // caminar: probar el paso entero, y si choca, deslizar por cada eje
        const P = this.pos;
        if (terreno.libre(P[0] + dx, P[2] + dz)) { P[0] += dx; P[2] += dz; }
        else if (terreno.libre(P[0] + dx, P[2])) P[0] += dx;
        else if (terreno.libre(P[0], P[2] + dz)) P[2] += dz;
        else this.choque = performance.now();
      } else {
        // flotar cerca del ancla del plano
        const nx = this.pos[0] + dx, ny = this.pos[1] + ar * v, nz = this.pos[2] + dz;
        if (!ancla || Math.hypot(nx - ancla[0], ny - ancla[1], nz - ancla[2]) < 1.2) { this.pos[0] = nx; this.pos[1] = ny; this.pos[2] = nz; } else this.choque = performance.now();
      }
    }
    if (terreno) { const y = terreno.suelo(this.pos[0], this.pos[2]); if (y !== null && terreno.libre(this.pos[0], this.pos[2])) this.pos[1] += (y + terreno.ojo - this.pos[1]) * Math.min(1, dt * 6); }
  }
  get quietoDesde() { return performance.now() - this.ultimo; }
}
