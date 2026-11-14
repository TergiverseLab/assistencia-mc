// mates.js — matrices 4×4 (columna mayor) y la cámara en primera persona.
export function perspectiva(tanY, aspecto, cerca, lejos) {
  const m = new Float32Array(16);
  m[0] = 1 / (tanY * aspecto); m[5] = 1 / tanY; m[10] = (lejos + cerca) / (cerca - lejos); m[11] = -1; m[14] = (2 * lejos * cerca) / (cerca - lejos);
  return m;
}
export function mult(a, b) {
  const r = new Float32Array(16);
  for (let c = 0; c < 4; c++) for (let f = 0; f < 4; f++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + f] * b[c * 4 + k]; r[c * 4 + f] = s; }
  return r;
}
// cámara → mundo, a partir de posición, giro (yaw) e inclinación (pitch)
export function camMundo(pos, yaw, pitch) {
  const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
  // columnas: derecha, arriba, atrás (la cámara mira hacia -Z)
  return new Float32Array([cy, 0, -sy, 0, sy * sp, cp, cy * sp, 0, sy * cp, -sp, cy * cp, 0, pos[0], pos[1], pos[2], 1]);
}
// inversa de una matriz rígida (rotación + traslación)
export function inversaRigida(m) {
  const r = new Float32Array(16);
  r[0] = m[0]; r[1] = m[4]; r[2] = m[8]; r[4] = m[1]; r[5] = m[5]; r[6] = m[9]; r[8] = m[2]; r[9] = m[6]; r[10] = m[10];
  r[12] = -(m[0] * m[12] + m[1] * m[13] + m[2] * m[14]); r[13] = -(m[4] * m[12] + m[5] * m[13] + m[6] * m[14]); r[14] = -(m[8] * m[12] + m[9] * m[13] + m[10] * m[14]); r[15] = 1;
  return r;
}
