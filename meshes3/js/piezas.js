// piezas.js — un fotograma de la película se convierte en arquitectura (como una foto colocada en Viewfinder).
// Del mapa de profundidad del fotograma, visto desde la cámara del jugador en el instante de solidificar:
//  1 · SUELO: el plano del suelo (RANSAC sobre los puntos que miran hacia arriba). Se construye un suelo amplio,
//      que sigue más allá de lo filmado: una carretera se convierte en suelo que puedes recorrer hasta el fondo.
//      Si el fotograma no tiene suelo (un primer plano), se pone uno a la altura de los pies.
//  2 · OBJETOS: lo que sobresale, cerca y separado del fondo (manos, una cara, la figura encapuchada, una silla),
//      se separa en piezas sólidas: la cara filmada delante, una espalda y unos laterales (extrusión, con grosor
//      proporcional a su tamaño). Escala de sueño: el mundo es gigante y el jugador pequeño.
//  3 · FONDO: el resto, como una lámina en relieve, cortada donde la profundidad salta (sin sábanas estiradas).
// Todo va texturizado con el propio fotograma. Devuelve las mallas y los puntos para el terreno.
const G = [160, 112], CERCA = 4, LEJOS = 60, OJO = 1.6;

export function solidificar(datos, cm, tan) {
  const [W, H] = G, N = W * H, [tx, ty] = tan;
  // 1 · puntos en la cámara y en el mundo
  const pc = new Float32Array(N * 3), pw = new Float32Array(N * 3), z = new Float32Array(N);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const k = j * W + i, u = i / (W - 1), v = j / (H - 1), d = datos(u, v) / 255;
    const zz = 1 / ((1 - d) / LEJOS + d / CERCA); z[k] = zz;
    pc[k * 3] = (u * 2 - 1) * tx * zz; pc[k * 3 + 1] = (1 - v * 2) * ty * zz; pc[k * 3 + 2] = -zz;
  }
  const aMundo = (src, k, out, o) => { const x = src[k * 3], y = src[k * 3 + 1], q = src[k * 3 + 2]; out[o] = cm[0] * x + cm[4] * y + cm[8] * q + cm[12]; out[o + 1] = cm[1] * x + cm[5] * y + cm[9] * q + cm[13]; out[o + 2] = cm[2] * x + cm[6] * y + cm[10] * q + cm[14]; };
  for (let k = 0; k < N; k++) aMundo(pc, k, pw, k * 3);
  const cam = [cm[12], cm[13], cm[14]];
  // normales (en el mundo)
  const ny = new Float32Array(N);
  for (let j = 0; j < H - 1; j++) for (let i = 0; i < W - 1; i++) {
    const o = (j * W + i) * 3, a = (j * W + i + 1) * 3, b = ((j + 1) * W + i) * 3;
    const ux = pw[a] - pw[o], uy = pw[a + 1] - pw[o + 1], uz = pw[a + 2] - pw[o + 2], vx = pw[b] - pw[o], vy = pw[b + 1] - pw[o + 1], vz = pw[b + 2] - pw[o + 2];
    const nx = uy * vz - uz * vy, nyy = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    ny[j * W + i] = Math.abs(nyy) / (Math.hypot(nx, nyy, nz) || 1);
  }
  // 2 · suelo por RANSAC
  const cand = []; for (let k = 0; k < N; k++) if (ny[k] > 0.6 && pw[k * 3 + 1] < cam[1] - 0.3) cand.push(k);
  let plano = null, mejor = 0;
  for (let it = 0; it < 150 && cand.length > 30; it++) {
    const [a, b, c] = [0, 0, 0].map(() => cand[(Math.random() * cand.length) | 0]);
    const A = [pw[a * 3], pw[a * 3 + 1], pw[a * 3 + 2]], B = [pw[b * 3] - A[0], pw[b * 3 + 1] - A[1], pw[b * 3 + 2] - A[2]], C = [pw[c * 3] - A[0], pw[c * 3 + 1] - A[1], pw[c * 3 + 2] - A[2]];
    let n = [B[1] * C[2] - B[2] * C[1], B[2] * C[0] - B[0] * C[2], B[0] * C[1] - B[1] * C[0]]; const l = Math.hypot(...n); if (l < 1e-6) continue;
    n = n.map((x) => x / l); if (n[1] < 0) n = n.map((x) => -x); if (n[1] < 0.8) continue;
    const dd = n[0] * A[0] + n[1] * A[1] + n[2] * A[2];
    let cuenta = 0; for (const k of cand) { const dist = Math.abs(n[0] * pw[k * 3] + n[1] * pw[k * 3 + 1] + n[2] * pw[k * 3 + 2] - dd); if (dist < 0.04 * z[k]) cuenta++; }
    if (cuenta > mejor) { mejor = cuenta; plano = { n, d: dd }; }
  }
  const haySuelo = plano && mejor > N * 0.03;
  // la altura de los ojos sobre el suelo se lleva a OJO: se escala el fotograma entero alrededor de la cámara
  let escala = 1;
  if (haySuelo) { const h = plano.n[0] * cam[0] + plano.n[1] * cam[1] + plano.n[2] * cam[2] - plano.d; if (h > 0.05) escala = Math.min(4, Math.max(0.25, OJO / h)); }
  for (let k = 0; k < N; k++) { for (let c = 0; c < 3; c++) pw[k * 3 + c] = cam[c] + (pw[k * 3 + c] - cam[c]) * escala; z[k] *= escala; }
  const suelo = haySuelo ? { n: plano.n, d: plano.n[0] * cam[0] + plano.n[1] * cam[1] + plano.n[2] * cam[2] - OJO } : { n: [0, 1, 0], d: cam[1] - OJO };
  const enSuelo = new Uint8Array(N);
  if (haySuelo) for (let k = 0; k < N; k++) { const dist = Math.abs(suelo.n[0] * pw[k * 3] + suelo.n[1] * pw[k * 3 + 1] + suelo.n[2] * pw[k * 3 + 2] - suelo.d); if (dist < 0.05 * z[k] && ny[k] > 0.5) enSuelo[k] = 1; }
  // uv de cualquier punto del mundo en el fotograma (proyección desde la cámara que lo solidificó)
  const inv = [cm[0], cm[4], cm[8], cm[1], cm[5], cm[9], cm[2], cm[6], cm[10]];
  const uvDe = (x, y, q) => {
    const dx = x - cam[0], dy = y - cam[1], dz = q - cam[2];
    const cx = cm[0] * dx + cm[1] * dy + cm[2] * dz, cy = cm[4] * dx + cm[5] * dy + cm[6] * dz, cz = cm[8] * dx + cm[9] * dy + cm[10] * dz;
    const zz = Math.max(0.3, -cz); void inv;
    return [Math.min(1, Math.max(0, (cx / zz / tx) * 0.5 + 0.5)), Math.min(1, Math.max(0, 0.5 - (cy / zz / ty) * 0.5))];
  };
  // 3 · segmentar: regiones conectadas por profundidad parecida (sin contar el suelo)
  const region = new Int32Array(N).fill(-1), regiones = [];
  for (let s = 0; s < N; s++) {
    if (region[s] >= 0 || enSuelo[s]) continue;
    const id = regiones.length, pila = [s], miembros = []; region[s] = id;
    while (pila.length) {
      const k = pila.pop(); miembros.push(k); const i = k % W, j = (k / W) | 0;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const ii = i + di, jj = j + dj; if (ii < 0 || jj < 0 || ii >= W || jj >= H) continue;
        const m = jj * W + ii; if (region[m] >= 0 || enSuelo[m]) continue;
        if (Math.abs(z[m] - z[k]) < 0.06 * z[k]) { region[m] = id; pila.push(m); }
      }
    }
    regiones.push(miembros);
  }
  const noSuelo = []; for (let k = 0; k < N; k++) if (!enSuelo[k]) noSuelo.push(z[k]);
  noSuelo.sort((a, b) => a - b); const zFondo = noSuelo.length ? noSuelo[(noSuelo.length * 0.7) | 0] : LEJOS;
  const esObjeto = new Uint8Array(regiones.length);
  regiones.forEach((m, id) => {
    if (m.length < N * 0.012 || m.length > N * 0.65) return;
    const zs = m.map((k) => z[k]).sort((a, b) => a - b), zm = zs[zs.length >> 1];
    if (zm < zFondo * 0.7) esObjeto[id] = 1;
  });
  // 4 · mallas
  const pos = [], uv = [], ind = [], puntos = [];
  const vert = (x, y, q, u, v) => { pos.push(x, y, q); uv.push(u, v); return pos.length / 3 - 1; };
  const uvRej = (k) => [(k % W) / (W - 1), ((k / W) | 0) / (H - 1)];
  // suelo: rejilla de 28 × 28 sobre el plano, de los pies hasta mucho más allá de lo filmado
  {
    const n = suelo.n, ade = [-cm[8], 0, -cm[10]], la = Math.hypot(ade[0], ade[2]) || 1; ade[0] /= la; ade[2] /= la;
    const der = [-ade[2], 0, ade[0]];
    let fondo = 30; if (haySuelo) for (let k = 0; k < N; k++) if (enSuelo[k]) fondo = Math.max(fondo, ((pw[k * 3] - cam[0]) * ade[0] + (pw[k * 3 + 2] - cam[2]) * ade[2]) + 12);
    fondo = Math.min(fondo, 90); const ancho = fondo * 0.7, R = 28, base = pos.length / 3;
    for (let b = 0; b <= R; b++) for (let a = 0; a <= R; a++) {
      const f = -2 + (b / R) * (fondo + 2), s = (a / R * 2 - 1) * ancho;
      const x = cam[0] + ade[0] * f + der[0] * s, q = cam[2] + ade[2] * f + der[2] * s;
      const y = (suelo.d - n[0] * x - n[2] * q) / n[1];
      const [u, v] = uvDe(x, y, q); vert(x, y, q, u, v);
    }
    for (let b = 0; b < R; b++) for (let a = 0; a < R; a++) { const o = base + b * (R + 1) + a; ind.push(o, o + R + 1, o + 1, o + 1, o + R + 1, o + R + 2); }
    puntos.push({ tipo: 'suelo', suelo, ade, der, fondo, ancho, cam: cam.slice() });
  }
  // fondo y objetos: celdas de la rejilla
  const idx = new Int32Array(N).fill(-1);
  const vRej = (k) => { if (idx[k] < 0) { const [u, v] = uvRej(k); idx[k] = vert(pw[k * 3], pw[k * 3 + 1], pw[k * 3 + 2], u, v); } return idx[k]; };
  const celdaDe = (i, j) => [j * W + i, j * W + i + 1, (j + 1) * W + i, (j + 1) * W + i + 1];
  const continua = (c) => { let mn = 1e9, mx = 0; for (const k of c) { mn = Math.min(mn, z[k]); mx = Math.max(mx, z[k]); } return mx / mn < 1.12; };
  const objetos = new Map(); // región → celdas
  for (let j = 0; j < H - 1; j++) for (let i = 0; i < W - 1; i++) {
    const c = celdaDe(i, j);
    if (c.some((k) => enSuelo[k]) || !continua(c)) continue;
    const r = region[c[0]];
    if (r >= 0 && esObjeto[r] && c.every((k) => region[k] === r)) { if (!objetos.has(r)) objetos.set(r, []); objetos.get(r).push([i, j]); continue; }
    if (c.some((k) => region[k] >= 0 && esObjeto[region[k]])) continue;
    const [a, b, cc, d] = c.map(vRej); ind.push(a, cc, b, b, cc, d);
  }
  // objetos sólidos: cara delantera, espalda empujada hacia atrás y laterales en el borde
  for (const [r, celdas] of objetos) {
    const m = regiones[r]; let mnx = 1e9, mxx = -1e9, mny = 1e9, mxy = -1e9;
    for (const k of m) { mnx = Math.min(mnx, pc[k * 3] * escala); mxx = Math.max(mxx, pc[k * 3] * escala); mny = Math.min(mny, pc[k * 3 + 1] * escala); mxy = Math.max(mxy, pc[k * 3 + 1] * escala); }
    const grosor = Math.min(8, Math.max(0.4, 0.45 * Math.max(mxx - mnx, mxy - mny)));
    const delante = new Map(), detras = new Map();
    const vD = (k) => { if (!delante.has(k)) { const [u, v] = uvRej(k); delante.set(k, vert(pw[k * 3], pw[k * 3 + 1], pw[k * 3 + 2], u, v)); } return delante.get(k); };
    const vT = (k) => {
      if (!detras.has(k)) {
        const dx = pw[k * 3] - cam[0], dy = pw[k * 3 + 1] - cam[1], dz = pw[k * 3 + 2] - cam[2], l = Math.hypot(dx, dy, dz) || 1, [u, v] = uvRej(k);
        detras.set(k, vert(pw[k * 3] + dx / l * grosor, pw[k * 3 + 1] + dy / l * grosor, pw[k * 3 + 2] + dz / l * grosor, u, v));
      }
      return detras.get(k);
    };
    const dentro = new Set(celdas.map(([i, j]) => j * W + i));
    for (const [i, j] of celdas) {
      const c = celdaDe(i, j), [a, b, cc, d] = c.map(vD), [ta, tb, tc, td] = c.map(vT);
      ind.push(a, cc, b, b, cc, d, ta, tb, tc, tb, td, tc);
      // laterales: aristas de la celda que dan a una celda que no es del objeto
      const bordes = [[j * W + i - 1, c[0], c[2]], [j * W + i + 1, c[1], c[3]], [(j - 1) * W + i, c[0], c[1]], [(j + 1) * W + i, c[2], c[3]]];
      for (const [vecina, p, q] of bordes) {
        if (dentro.has(vecina)) continue;
        const fp = vD(p), fq = vD(q), bp = vT(p), bq = vT(q); ind.push(fp, bp, fq, fq, bp, bq);
      }
    }
    for (const k of m) puntos.push({ tipo: 'objeto', x: pw[k * 3], y: pw[k * 3 + 1], z: pw[k * 3 + 2] });
  }
  // el fondo también cuenta para chocar (paredes)
  for (let k = 0; k < N; k += 3) if (!enSuelo[k] && !(region[k] >= 0 && esObjeto[region[k]])) puntos.push({ tipo: 'pared', x: pw[k * 3], y: pw[k * 3 + 1], z: pw[k * 3 + 2] });
  return { pos: new Float32Array(pos), uv: new Float32Array(uv), ind: new Uint32Array(ind), puntos, objetos: objetos.size, haySuelo };
}
