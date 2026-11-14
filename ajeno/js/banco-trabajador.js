// banco-trabajador.js — el banco de imágenes dentro del móvil y la búsqueda de FORMA, fotograma a fotograma.
// El banco se llena de dos maneras:
//  · fotogramas de películas que se eligen en el móvil (main.js los extrae y los manda aquí ya recortados);
//  · fotos de internet: fotos pequeñas (270 px) de dos fuentes de Unsplash, mezcladas al azar:
//  · las ~25.000 de Unsplash Lite (su tabla da la dirección de cada imagen);
//  · las 250.000 del índice de significado (por su identificador).
// De cada foto se calcula su forma a partir de los píxeles reales: el centro que cabe en la pantalla, en una
// rejilla de 9 × 16 manchas en Oklab (color cercano a la percepción). El banco crece mientras se usa.
// En cada fotograma: la forma de la cámara se compara con todo el banco (milisegundos) y se devuelven las
// mejores que no se hayan usado en los últimos fotogramas (la «memoria»), para que cada fotograma sea otra foto.
const TABLA = 'https://huggingface.co/datasets/image-search-2/unsplash_lite_image_dataset/resolve/main/photos.tsv000';
const GX = 9, GY = 16, DIM = GX * GY * 3, ANCHO = 270;
let aspecto = 0.46, alto = 588, max = 6000, prueba = false;
const fuentes = [];           // direcciones pendientes, ya barajadas
let desc = new Float32Array(max * DIM), n = 0;
const recientes = [];         // índices usados en los últimos fotogramas
let memoria = 12;
const avisar = (texto) => postMessage({ tipo: 'aviso', texto });

async function texto(url) {
  let cache = null;
  try { cache = await caches.open('ajeno-datos'); const r = await cache.match(url); if (r) return await r.text(); } catch (e) {}
  const r = await fetch(url); if (!r.ok) throw new Error(`no se pudo descargar ${url} (${r.status})`);
  const t = await r.text(); try { if (cache) await cache.put(url, new Response(t)); } catch (e) {}
  return t;
}
const barajar = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };

const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
const LIN = new Float32Array(256).map((_, i) => lin(i));
function oklab(r, g, b, out, o) {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  out[o] = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  out[o + 1] = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  out[o + 2] = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
}
// forma de una imagen ya recortada a la pantalla, dibujada en (GX·4) × (GY·4): media de bloques 4 × 4 → Oklab
const muestra = new OffscreenCanvas(GX * 4, GY * 4), mcx = muestra.getContext('2d', { willReadFrequently: true });
function forma(fuente, sx, sy, sw, sh, out, o) {
  const W = GX * 4, H = GY * 4;
  mcx.drawImage(fuente, sx, sy, sw, sh, 0, 0, W, H);
  const px = mcx.getImageData(0, 0, W, H).data;
  for (let gy = 0; gy < GY; gy++) for (let gx = 0; gx < GX; gx++) {
    let r = 0, g = 0, b = 0;
    for (let y = 0; y < 4; y++) { let p = ((gy * 4 + y) * W + gx * 4) * 4; for (let x = 0; x < 4; x++, p += 4) { r += LIN[px[p]]; g += LIN[px[p + 1]]; b += LIN[px[p + 2]]; } }
    oklab(r / 16, g / 16, b / 16, out, o + (gy * GX + gx) * 3);
  }
}

// ——— llenar el banco ———
async function traer(url) {
  const r = await fetch(url); if (!r.ok) throw new Error(r.status);
  const blob = await r.blob(); const bmp = await createImageBitmap(blob);
  // el centro que cabe en la pantalla
  const ap = bmp.width / bmp.height; let sx = 0, sy = 0, sw = bmp.width, sh = bmp.height;
  if (ap > aspecto) { sw = bmp.height * aspecto; sx = (bmp.width - sw) / 2; } else { sh = bmp.width / aspecto; sy = (bmp.height - sh) / 2; }
  // se guarda ya recortada y reducida (más ligera de pintar fotograma a fotograma)
  const c = new OffscreenCanvas(ANCHO, alto); c.getContext('2d').drawImage(bmp, sx, sy, sw, sh, 0, 0, ANCHO, alto); bmp.close();
  const recorte = await c.convertToBlob({ type: 'image/jpeg', quality: 0.82 });
  if (n >= max) return;
  forma(c, 0, 0, ANCHO, alto, desc, n * DIM);
  postMessage({ tipo: 'foto', i: n, blob: recorte, url });
  n++;
}
async function llenar() {
  let fallos = 0, hechas = 0;
  const hilo = async () => {
    while (fuentes.length && n < max) {
      const url = fuentes.pop();
      try { await traer(url); hechas++; } catch (e) { fallos++; }
      if ((hechas + fallos) % 10 === 0) postMessage({ tipo: 'banco', n, fallos });
    }
  };
  await Promise.all(Array.from({ length: 8 }, hilo));
  postMessage({ tipo: 'banco', n, fallos, fin: true });
}

// un fotograma de película, ya recortado a la pantalla (ANCHO × alto)
async function anadir(img) {
  if (n >= max) { img.close(); return; }
  const c = new OffscreenCanvas(ANCHO, alto); c.getContext('2d').drawImage(img, 0, 0, ANCHO, alto); img.close();
  forma(c, 0, 0, ANCHO, alto, desc, n * DIM);
  const blob = await c.convertToBlob({ type: 'image/jpeg', quality: 0.82 });
  postMessage({ tipo: 'foto', i: n, blob }); n++;
  if (n % 20 === 0) postMessage({ tipo: 'banco', n });
}

// ——— buscar, fotograma a fotograma ———
const q = new Float32Array(DIM);
function buscar(img) {
  forma(img, 0, 0, img.width, img.height, q, 0); img.close();
  const usadas = new Set(recientes), mejores = [];
  for (let k = 0; k < n; k++) {
    if (usadas.has(k)) continue;
    let d = 0; const o = k * DIM;
    for (let i = 0; i < DIM; i += 3) { const dl = q[i] - desc[o + i], da = q[i + 1] - desc[o + i + 1], db = q[i + 2] - desc[o + i + 2]; d += 3 * dl * dl + da * da + db * db; }
    if (mejores.length < 4 || d < mejores[mejores.length - 1][0]) { mejores.push([d, k]); mejores.sort((a, b) => a[0] - b[0]); if (mejores.length > 4) mejores.pop(); }
  }
  if (mejores.length) { recientes.push(mejores[0][1]); while (recientes.length > memoria) recientes.shift(); }
  return mejores.map((m) => m[1]);
}

onmessage = async (e) => {
  const m = e.data;
  try {
    if (m.tipo === 'cargar') {
      aspecto = m.aspecto; alto = Math.round(ANCHO / aspecto); max = m.max || max; prueba = !!m.prueba; desc = new Float32Array(max * DIM);
      postMessage({ tipo: 'listo', alto });
    } else if (m.tipo === 'anadir') await anadir(m.imagen);
    else if (m.tipo === 'internet') {
      avisar('fotos: leyendo el catálogo…');
      const lite = [];
      try {
        const t = await texto(m.tabla || TABLA), filas = t.split('\n'), cab = filas[0].split('\t'), cu = cab.indexOf('photo_image_url');
        for (let k = 1; k < filas.length; k++) { const u = filas[k].split('\t')[cu]; if (u && u.startsWith(prueba ? 'prueba' : 'https://')) lite.push(prueba ? new URL('../' + u, import.meta.url).href : `${u}?w=${ANCHO * 2}&q=70&fm=jpg`); }
      } catch (err) { avisar('fotos: sin catálogo Lite, sigo con el otro'); }
      let otras = [];
      if (!prueba) {
        try { otras = (await texto(new URL('../indice/ids.txt', import.meta.url).href)).split('\n').filter(Boolean).map((id) => `https://unsplash.com/photos/${id}/download?w=${ANCHO * 2}`); } catch (err) {}
      }
      barajar(lite); barajar(otras);
      const mezcla = []; for (let i = 0; i < Math.max(lite.length, otras.length) && mezcla.length < max * 3; i++) { if (otras[i]) mezcla.push(otras[i]); if (lite[i]) mezcla.push(lite[i]); }
      fuentes.push(...mezcla.reverse());
      avisar('');
      llenar();
    } else if (m.tipo === 'memoria') memoria = m.valor;
    else if (m.tipo === 'ver') { const t0 = performance.now(); const lista = buscar(m.imagen); postMessage({ tipo: 'elegidas', lista, ms: performance.now() - t0 }); }
  } catch (err) { postMessage({ tipo: 'error', texto: String(err && err.message || err) }); }
};
