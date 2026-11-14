// forma-trabajador.js — el parecido de FORMA: composición, manchas, luz y color.
// Colección: las ~25.000 fotos públicas de Unsplash Lite. De cada una existe su «blur hash», una miniatura
// borrosa codificada en pocos caracteres (sus componentes de coseno de baja frecuencia). Aquí se descodifica
// el centro de cada foto —el trozo que cabe en la pantalla del móvil— en una rejilla de 6 × 12 manchas de
// color (espacio Oklab, cercano a la percepción), y cada fotograma de la cámara se compara con todas.
const TABLA = 'https://huggingface.co/datasets/image-search-2/unsplash_lite_image_dataset/resolve/main/photos.tsv000';
const GX = 6, GY = 12, DIM = GX * GY * 3;
let fotos = [], desc = null;
const avisar = (texto) => postMessage({ tipo: 'aviso', texto });

async function descargar(url, nombre) {
  let cache = null;
  try { cache = await caches.open('ajeno-datos'); const r = await cache.match(url); if (r) return await r.text(); } catch (e) {}
  const r = await fetch(url);
  if (!r.ok) throw new Error(`no se pudo descargar ${nombre} (${r.status})`);
  const total = +r.headers.get('content-length') || 0, lector = r.body.getReader(), trozos = [];
  let n = 0, ultimo = 0;
  for (;;) {
    const { done, value } = await lector.read(); if (done) break;
    trozos.push(value); n += value.length;
    if (n - ultimo > 200000) { ultimo = n; avisar(`forma: descargando ${nombre}… ${total ? Math.round((n / total) * 100) + ' %' : (n / 1048576).toFixed(1) + ' MB'}`); }
  }
  const texto = await new Blob(trozos).text();
  try { if (cache) await cache.put(url, new Response(texto)); } catch (e) {}
  return texto;
}

// ——— blur hash (algoritmo público de Wolt) ———
const B83 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz#$%*+,-.:;=?@[]^_{|}~';
const d83 = (s) => { let v = 0; for (const c of s) v = v * 83 + B83.indexOf(c); return v; };
const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
const sgnPow = (v, e) => Math.sign(v) * Math.abs(v) ** e;
function coeficientes(h) {
  const t = d83(h[0]), ny = Math.floor(t / 9) + 1, nx = (t % 9) + 1, max = (d83(h[1]) + 1) / 166;
  if (h.length !== 4 + 2 * nx * ny) return null;
  const c = new Float32Array(nx * ny * 3), dc = d83(h.slice(2, 6));
  c[0] = lin(dc >> 16); c[1] = lin((dc >> 8) & 255); c[2] = lin(dc & 255);
  for (let i = 1; i < nx * ny; i++) {
    const v = d83(h.slice(4 + i * 2, 6 + i * 2));
    c[i * 3] = sgnPow((Math.floor(v / 361) - 9) / 9, 2) * max;
    c[i * 3 + 1] = sgnPow(((Math.floor(v / 19) % 19) - 9) / 9, 2) * max;
    c[i * 3 + 2] = sgnPow(((v % 19) - 9) / 9, 2) * max;
  }
  return { nx, ny, c };
}
// RGB lineal → Oklab (Björn Ottosson): L de 0 a 1, a y b alrededor de 0
function oklab(r, g, b, out, o) {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  out[o] = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  out[o + 1] = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  out[o + 2] = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
}

function construir(texto, aspecto) {
  const filas = texto.split('\n'), cab = filas[0].split('\t');
  const col = (n) => cab.indexOf(n);
  const cId = col('photo_id'), cUrl = col('photo_image_url'), cHash = col('blur_hash'), cW = col('photo_width'), cH = col('photo_height');
  const cNom = col('photographer_first_name'), cApe = col('photographer_last_name');
  if (cId < 0 || cUrl < 0 || cHash < 0) throw new Error('la tabla de fotos no tiene el formato esperado');
  fotos = []; const lista = [];
  for (let k = 1; k < filas.length; k++) {
    const f = filas[k].split('\t'); if (f.length < cab.length - 2) continue;
    const co = f[cHash] && coeficientes(f[cHash].trim()); if (!co) continue;
    fotos.push({ id: f[cId], url: f[cUrl], autor: [f[cNom], f[cApe]].filter((x) => x && x !== '').join(' ') });
    lista.push([co, (+f[cW] || 1) / (+f[cH] || 1)]);
  }
  desc = new Float32Array(fotos.length * DIM);
  const cosx = new Float32Array(9), cosy = new Float32Array(9);
  lista.forEach(([co, ap], n) => {
    // el centro de la foto que cabe en la pantalla (como hará el recorte de la imagen al mostrarla)
    let x0 = 0, y0 = 0, cw = 1, ch = 1;
    if (ap > aspecto) { cw = aspecto / ap; x0 = (1 - cw) / 2; } else { ch = ap / aspecto; y0 = (1 - ch) / 2; }
    for (let gy = 0; gy < GY; gy++) {
      const y = y0 + ((gy + 0.5) / GY) * ch;
      for (let j = 0; j < co.ny; j++) cosy[j] = Math.cos(Math.PI * y * j);
      for (let gx = 0; gx < GX; gx++) {
        const x = x0 + ((gx + 0.5) / GX) * cw;
        for (let i = 0; i < co.nx; i++) cosx[i] = Math.cos(Math.PI * x * i);
        let r = 0, g = 0, b = 0;
        for (let j = 0; j < co.ny; j++) for (let i = 0; i < co.nx; i++) {
          const w = cosx[i] * cosy[j], o = (j * co.nx + i) * 3;
          r += co.c[o] * w; g += co.c[o + 1] * w; b += co.c[o + 2] * w;
        }
        oklab(Math.max(0, r), Math.max(0, g), Math.max(0, b), desc, n * DIM + (gy * GX + gx) * 3);
      }
    }
  });
}

// el fotograma: miniatura de (GX·4) × (GY·4) → media de cada bloque 4 × 4 → Oklab
let lienzo, cx;
function describir(img) {
  const W = GX * 4, H = GY * 4;
  if (!lienzo) { lienzo = new OffscreenCanvas(W, H); cx = lienzo.getContext('2d', { willReadFrequently: true }); }
  cx.drawImage(img, 0, 0, W, H); img.close();
  const px = cx.getImageData(0, 0, W, H).data, q = new Float32Array(DIM);
  for (let gy = 0; gy < GY; gy++) for (let gx = 0; gx < GX; gx++) {
    let r = 0, g = 0, b = 0;
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) { const o = ((gy * 4 + y) * W + gx * 4 + x) * 4; r += lin(px[o]); g += lin(px[o + 1]); b += lin(px[o + 2]); }
    oklab(r / 16, g / 16, b / 16, q, (gy * GX + gx) * 3);
  }
  return q;
}

function buscar(q, n = 8) {
  const N = fotos.length, mejores = [];
  for (let k = 0; k < N; k++) {
    let d = 0; const o = k * DIM;
    for (let i = 0; i < DIM; i += 3) { const dl = q[i] - desc[o + i], da = q[i + 1] - desc[o + i + 1], db = q[i + 2] - desc[o + i + 2]; d += 2 * dl * dl + da * da + db * db; }
    if (mejores.length < n || d < mejores[mejores.length - 1][0]) {
      mejores.push([d, k]); mejores.sort((a, b) => a[0] - b[0]); if (mejores.length > n) mejores.pop();
    }
  }
  return mejores.map(([d, k]) => ({ url: fotos[k].url, id: fotos[k].id, autor: fotos[k].autor, d }));
}

onmessage = async (e) => {
  const m = e.data;
  try {
    if (m.tipo === 'cargar') {
      const texto = await descargar(m.tabla || TABLA, 'la tabla de 25.000 fotos');
      avisar('forma: leyendo las manchas de cada foto…');
      construir(texto, m.aspecto);
      postMessage({ tipo: 'listo', n: fotos.length });
    } else if (m.tipo === 'ver') {
      const t0 = performance.now();
      postMessage({ tipo: 'candidatas', lista: buscar(describir(m.imagen)), ms: performance.now() - t0 });
    }
  } catch (err) { postMessage({ tipo: 'error', texto: String(err && err.message || err) }); }
};
