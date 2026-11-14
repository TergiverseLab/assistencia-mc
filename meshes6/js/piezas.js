// piezas.js — un fotograma de la película se convierte en arquitectura (como una foto colocada en Viewfinder).
// Del mapa de profundidad del fotograma, visto desde la cámara del jugador en el instante de solidificar:
//  1 · SUELO COMÚN: se busca el plano del suelo (RANSAC sobre los puntos que miran hacia arriba) y el fotograma
//      entero se endereza y se escala para que ese suelo coincida con el suelo del mundo (horizontal, 1,6 bajo los
//      ojos). Así todas las construcciones se suman sobre el mismo suelo, sin enterrarse unas a otras.
//      El suelo que se construye es exactamente el que la imagen muestra como suelo: cada píxel de suelo se proyecta
//      sobre el plano común, con su propio color. Nada fuera de la imagen (sin bordes estirados).
//  2 · OBJETOS INFLADOS: lo que sobresale, cerca y separado del fondo (manos, una cara, un cuerpo, una silla), se
//      separa por regiones de profundidad continua. Cada uno se «infla» desde su contorno: la cara filmada delante,
//      fiel a la profundidad, y una espalda curva que se cierra en el borde (grosor según la distancia al contorno).
//      Se quitan los píxeles de borde donde la profundidad mezcla figura y fondo.
//  3 · FONDO: lámina en relieve, cortada donde la profundidad salta. Se puede atravesar: solo los objetos cierran el paso.
// Todo va texturizado con el propio fotograma. Escala de sueño: el mundo es gigante y el jugador pequeño.
const CERCA = 4, LEJOS = 60, OJO = 1.6;

export function solidificar(datos, cm, tan, W, H) {
  const N = W * H, [tx, ty] = tan, cam = [cm[12], cm[13], cm[14]];
  // 1 · puntos en el mundo (tal como los vio la cámara)
  const pw = new Float32Array(N * 3), z = new Float32Array(N), dirs = new Float32Array(N * 3);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const k = j * W + i, u = i / (W - 1), v = j / (H - 1), d = datos(u, v) / 255;
    const zz = 1 / ((1 - d) / LEJOS + d / CERCA); z[k] = zz;
    const x = (u * 2 - 1) * tx * zz, y = (1 - v * 2) * ty * zz, q = -zz;
    pw[k * 3] = cm[0] * x + cm[4] * y + cm[8] * q + cm[12]; pw[k * 3 + 1] = cm[1] * x + cm[5] * y + cm[9] * q + cm[13]; pw[k * 3 + 2] = cm[2] * x + cm[6] * y + cm[10] * q + cm[14];
  }
  const normalY = (P) => {
    const ny = new Float32Array(N);
    for (let j = 0; j < H - 1; j++) for (let i = 0; i < W - 1; i++) {
      const o = (j * W + i) * 3, a = o + 3, b = o + W * 3;
      const ux = P[a] - P[o], uy = P[a + 1] - P[o + 1], uz = P[a + 2] - P[o + 2], vx = P[b] - P[o], vy = P[b + 1] - P[o + 1], vz = P[b + 2] - P[o + 2];
      const nx = uy * vz - uz * vy, n2 = uz * vx - ux * vz, nz = ux * vy - uy * vx; ny[j * W + i] = Math.abs(n2) / (Math.hypot(nx, n2, nz) || 1);
    }
    return ny;
  };
  let ny = normalY(pw);
  // 2 · suelo por RANSAC
  // candidatos: miran hacia arriba, están por debajo de los ojos y en la mitad inferior de la imagen
  const cand = []; for (let k = 0; k < N; k++) if (ny[k] > 0.7 && pw[k * 3 + 1] < cam[1] - 0.3 && k >= N * 0.45) cand.push(k);
  let plano = null, mejor = 0;
  for (let it = 0; it < 180 && cand.length > 40; it++) {
    const [a, b, c] = [0, 0, 0].map(() => cand[(Math.random() * cand.length) | 0]);
    const A = [pw[a * 3], pw[a * 3 + 1], pw[a * 3 + 2]], B = [pw[b * 3] - A[0], pw[b * 3 + 1] - A[1], pw[b * 3 + 2] - A[2]], C = [pw[c * 3] - A[0], pw[c * 3 + 1] - A[1], pw[c * 3 + 2] - A[2]];
    let n = [B[1] * C[2] - B[2] * C[1], B[2] * C[0] - B[0] * C[2], B[0] * C[1] - B[1] * C[0]]; const l = Math.hypot(...n); if (l < 1e-6) continue;
    n = n.map((x) => x / l); if (n[1] < 0) n = n.map((x) => -x); if (n[1] < 0.9) continue; // casi horizontal: una pared no es suelo
    const dd = n[0] * A[0] + n[1] * A[1] + n[2] * A[2];
    let cuenta = 0; for (const k of cand) if (Math.abs(n[0] * pw[k * 3] + n[1] * pw[k * 3 + 1] + n[2] * pw[k * 3 + 2] - dd) < 0.035 * z[k]) cuenta++;
    if (cuenta > mejor) { mejor = cuenta; plano = { n, d: dd }; }
  }
  const haySuelo = !!plano && mejor > N * 0.03;
  // enderezar (el suelo del fotograma, horizontal) y escalar (los ojos a OJO sobre él), alrededor de la cámara
  let R = [1, 0, 0, 0, 1, 0, 0, 0, 1], s = 1;
  if (haySuelo) {
    const n = plano.n, eje = [-n[2], 0, n[0]], sen = Math.hypot(eje[0], eje[2]), co = n[1];
    if (sen > 1e-5) {
      const [x, , q] = [eje[0] / sen, 0, eje[2] / sen], C = 1 - co;
      R = [co + x * x * C, -q * sen, x * q * C, q * sen, co, -x * sen, q * x * C, x * sen, co + q * q * C];
    }
    const h = n[0] * cam[0] + n[1] * cam[1] + n[2] * cam[2] - plano.d;
    if (h > 0.05) s = Math.min(4, Math.max(0.2, OJO / h));
  }
  const aplicar = (x, y, q) => { const dx = x - cam[0], dy = y - cam[1], dz = q - cam[2]; return [cam[0] + s * (R[0] * dx + R[1] * dy + R[2] * dz), cam[1] + s * (R[3] * dx + R[4] * dy + R[5] * dz), cam[2] + s * (R[6] * dx + R[7] * dy + R[8] * dz)]; };
  const deshacer = (x, y, q) => { const dx = (x - cam[0]) / s, dy = (y - cam[1]) / s, dz = (q - cam[2]) / s; return [cam[0] + R[0] * dx + R[3] * dy + R[6] * dz, cam[1] + R[1] * dx + R[4] * dy + R[7] * dz, cam[2] + R[2] * dx + R[5] * dy + R[8] * dz]; };
  for (let k = 0; k < N; k++) { const p = aplicar(pw[k * 3], pw[k * 3 + 1], pw[k * 3 + 2]); pw[k * 3] = p[0]; pw[k * 3 + 1] = p[1]; pw[k * 3 + 2] = p[2]; z[k] *= s; }
  for (let k = 0; k < N; k++) { const dx = pw[k * 3] - cam[0], dy = pw[k * 3 + 1] - cam[1], dz = pw[k * 3 + 2] - cam[2], l = Math.hypot(dx, dy, dz) || 1; dirs[k * 3] = dx / l; dirs[k * 3 + 1] = dy / l; dirs[k * 3 + 2] = dz / l; }
  ny = normalY(pw);
  const sueloY = cam[1] - OJO;
  const enSuelo = new Uint8Array(N);
  if (haySuelo) for (let k = 0; k < N; k++) if (Math.abs(pw[k * 3 + 1] - sueloY) < 0.035 * z[k] && ny[k] > 0.5) enSuelo[k] = 1;
  const uvDe = (x, y, q) => {
    const [ox, oy, oz] = deshacer(x, y, q), dx = ox - cam[0], dy = oy - cam[1], dz = oz - cam[2];
    const cx = cm[0] * dx + cm[1] * dy + cm[2] * dz, cy = cm[4] * dx + cm[5] * dy + cm[6] * dz, cz = cm[8] * dx + cm[9] * dy + cm[10] * dz, zz = Math.max(0.3, -cz);
    return [Math.min(1, Math.max(0, (cx / zz / tx) * 0.5 + 0.5)), Math.min(1, Math.max(0, 0.5 - (cy / zz / ty) * 0.5))];
  };
  // 3 · regiones de profundidad continua (sin el suelo); bordes «sucios» (mezcla figura/fondo) fuera
  const sucio = new Uint8Array(N);
  for (let j = 1; j < H - 1; j++) for (let i = 1; i < W - 1; i++) { const k = j * W + i; for (const m of [k - 1, k + 1, k - W, k + W]) if (Math.abs(z[m] - z[k]) > 0.12 * z[k]) { sucio[k] = 1; break; } }
  const region = new Int32Array(N).fill(-1), regiones = [];
  for (let s0 = 0; s0 < N; s0++) {
    if (region[s0] >= 0 || enSuelo[s0] || sucio[s0]) continue;
    const id = regiones.length, pila = [s0], miembros = []; region[s0] = id;
    while (pila.length) {
      const k = pila.pop(); miembros.push(k); const i = k % W, j = (k / W) | 0;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const ii = i + di, jj = j + dj; if (ii < 0 || jj < 0 || ii >= W || jj >= H) continue;
        const m = jj * W + ii; if (region[m] >= 0 || enSuelo[m] || sucio[m]) continue;
        if (Math.abs(z[m] - z[k]) < 0.05 * z[k]) { region[m] = id; pila.push(m); }
      }
    }
    regiones.push(miembros);
  }
  const resto = []; for (let k = 0; k < N; k++) if (!enSuelo[k]) resto.push(z[k]);
  resto.sort((a, b) => a - b); const zFondo = resto.length ? resto[(resto.length * 0.7) | 0] : LEJOS * s;
  const esObjeto = regiones.map((m) => { if (m.length < N * 0.01 || m.length > N * 0.6) return false; const zs = m.map((k) => z[k]).sort((a, b) => a - b); return zs[zs.length >> 1] < zFondo * 0.72; });
  // 4 · mallas
  const pos = [], uv = [], ind = [], puntos = [];
  const vert = (x, y, q, u, v) => { pos.push(x, y, q); uv.push(u, v); return pos.length / 3 - 1; };
  const uvRej = (k) => [(k % W) / (W - 1), ((k / W) | 0) / (H - 1)];
  // suelo: las celdas de la imagen que muestran suelo (con un pequeño cierre de huecos), proyectadas sobre el plano
  const indSuelo = [], cajas = [];
  if (haySuelo) {
    const m1 = enSuelo.slice(), m2 = new Uint8Array(N);
    for (let it = 0; it < 2; it++) { m2.set(m1); for (let j = 1; j < H - 1; j++) for (let i = 1; i < W - 1; i++) { const k = j * W + i; if (!m2[k] && (m2[k - 1] + m2[k + 1] + m2[k - W] + m2[k + W]) >= 2) m1[k] = 1; } }
    const vS = new Int32Array(N).fill(-1);
    const sobre = (k) => dirs[k * 3 + 1] < -0.004 && (sueloY - cam[1]) / dirs[k * 3 + 1] < LEJOS * s;
    const vSuelo = (k) => { if (vS[k] < 0) { const t = (sueloY - cam[1]) / dirs[k * 3 + 1], [u, v] = uvRej(k); vS[k] = vert(cam[0] + dirs[k * 3] * t, sueloY, cam[2] + dirs[k * 3 + 2] * t, u, v); } return vS[k]; };
    for (let j = 0; j < H - 1; j++) for (let i = 0; i < W - 1; i++) {
      const c = [j * W + i, j * W + i + 1, (j + 1) * W + i, (j + 1) * W + i + 1];
      if (!c.every((k) => m1[k] && sobre(k))) continue;
      const [a, b, cc, d] = c.map(vSuelo); indSuelo.push(a, cc, b, b, cc, d);
      let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9; for (const o of [a, b, cc, d]) { x0 = Math.min(x0, pos[o * 3]); x1 = Math.max(x1, pos[o * 3]); z0 = Math.min(z0, pos[o * 3 + 2]); z1 = Math.max(z1, pos[o * 3 + 2]); }
      cajas.push(x0, z0, x1, z1);
    }
  }
  // fondo: celdas continuas que no son ni suelo ni objeto
  const idx = new Int32Array(N).fill(-1);
  const vRej = (k) => { if (idx[k] < 0) { const [u, v] = uvRej(k); idx[k] = vert(pw[k * 3], pw[k * 3 + 1], pw[k * 3 + 2], u, v); } return idx[k]; };
  const celda = (i, j) => [j * W + i, j * W + i + 1, (j + 1) * W + i, (j + 1) * W + i + 1];
  const continua = (c) => { let mn = 1e9, mx = 0; for (const k of c) { mn = Math.min(mn, z[k]); mx = Math.max(mx, z[k]); } return mx / mn < 1.1; };
  const celdasObj = new Map();
  for (let j = 0; j < H - 1; j++) for (let i = 0; i < W - 1; i++) {
    const c = celda(i, j);
    if (c.some((k) => enSuelo[k] || sucio[k]) || !continua(c)) continue;
    const r = region[c[0]];
    if (r >= 0 && esObjeto[r] && c.every((k) => region[k] === r)) { if (!celdasObj.has(r)) celdasObj.set(r, []); celdasObj.get(r).push(c); continue; }
    if (c.some((k) => region[k] >= 0 && esObjeto[region[k]])) continue;
    if (c.some((k) => z[k] > LEJOS * s * 0.8)) continue;
    const [a, b, cc, d] = c.map(vRej); ind.push(a, cc, b, b, cc, d);
  }
  // objetos inflados: espalda curva según la distancia al contorno; en el contorno, delante y detrás coinciden
  for (const [r, celdas] of celdasObj) {
    const miembros = new Set(); for (const c of celdas) for (const k of c) miembros.add(k);
    const dist = new Map(), cola = [];
    for (const k of miembros) { const i = k % W; const borde = [k - 1, k + 1, k - W, k + W].some((m) => !miembros.has(m)) || i === 0 || i === W - 1; if (borde) { dist.set(k, 0); cola.push(k); } }
    for (let q = 0; q < cola.length; q++) { const k = cola[q], d = dist.get(k); for (const m of [k - 1, k + 1, k - W, k + W]) if (miembros.has(m) && !dist.has(m)) { dist.set(m, d + 1); cola.push(m); } }
    let dmax = 1; for (const d of dist.values()) dmax = Math.max(dmax, d);
    let mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9]; for (const k of miembros) for (let c = 0; c < 3; c++) { mn[c] = Math.min(mn[c], pw[k * 3 + c]); mx[c] = Math.max(mx[c], pw[k * 3 + c]); }
    const grosor = Math.min(12, Math.max(0.5, 0.45 * Math.max(mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2])));
    const delante = new Map(), detras = new Map();
    const vD = (k) => { if (!delante.has(k)) { const [u, v] = uvRej(k); delante.set(k, vert(pw[k * 3], pw[k * 3 + 1], pw[k * 3 + 2], u, v)); } return delante.get(k); };
    const vT = (k) => {
      if (!detras.has(k)) {
        const e = (dist.get(k) || 0) / dmax, t = grosor * Math.sqrt(Math.max(0, 1 - (1 - e) * (1 - e)));
        if (t < 1e-4) detras.set(k, vD(k));
        else { const [u, v] = uvRej(k); detras.set(k, vert(pw[k * 3] + dirs[k * 3] * t, pw[k * 3 + 1] + dirs[k * 3 + 1] * t, pw[k * 3 + 2] + dirs[k * 3 + 2] * t, u, v)); }
      }
      return detras.get(k);
    };
    for (const c of celdas) { const [a, b, cc, d] = c.map(vD), [ta, tb, tc, td] = c.map(vT); ind.push(a, cc, b, b, cc, d, ta, tb, tc, tb, td, tc); }
    for (const k of miembros) puntos.push([pw[k * 3], pw[k * 3 + 1], pw[k * 3 + 2]]);
  }
  // primero el suelo (se dibuja aparte, por orden), luego objetos y fondo
  return { pos: new Float32Array(pos), uv: new Float32Array(uv), ind: new Uint32Array([...indSuelo, ...ind]), nSuelo: indSuelo.length, cajas, sueloY, puntos, objetos: celdasObj.size, haySuelo };
}
