// significado-trabajador.js — el parecido de SIGNIFICADO: qué hay, no cómo se ve.
// CLIP ViT-B/32 (OpenAI; pesos ONNX de Xenova en Hugging Face) convierte el fotograma en una huella de 512
// números. El índice: 250.000 fotos de Unsplash elegidas al azar entre los casi 2 millones que Vladimir
// Haltakov pasó por el mismo CLIP (MIT); reducidas con PCA a 64 dimensiones y cuantizadas a int8 (16 MB).
// Comparar una huella con las 250.000 cuesta unas decenas de milisegundos.
import * as ort from '../vendor/ort/ort.wasm.min.mjs';

const MODELO = 'https://huggingface.co/Xenova/clip-vit-base-patch32/resolve/main/onnx/vision_model_quantized.onnx';
const MEDIA = [0.48145466, 0.4578275, 0.40821073], DESV = [0.26862954, 0.26130258, 0.27577711];
const D = 64;
let sesion, entrada, salida, Q, media, P, escala, ids;
const avisar = (texto) => postMessage({ tipo: 'aviso', texto });

async function descargar(url, nombre) {
  let cache = null;
  try { cache = await caches.open('ajeno-datos'); const r = await cache.match(url); if (r) return await r.arrayBuffer(); } catch (e) {}
  const r = await fetch(url);
  if (!r.ok) throw new Error(`no se pudo descargar ${nombre} (${r.status})`);
  const total = +r.headers.get('content-length') || 0, lector = r.body.getReader(), trozos = [];
  let n = 0, ultimo = 0;
  for (;;) {
    const { done, value } = await lector.read(); if (done) break;
    trozos.push(value); n += value.length;
    if (n - ultimo > 500000) { ultimo = n; avisar(`significado: descargando ${nombre}… ${total ? Math.round((n / total) * 100) + ' %' : (n / 1048576).toFixed(1) + ' MB'}`); }
  }
  const datos = await new Blob(trozos).arrayBuffer();
  try { if (cache) await cache.put(url, new Response(datos)); } catch (e) {}
  return datos;
}

async function cargar(modelo) {
  const aqui = (p) => new URL(p, import.meta.url).href;
  ort.env.wasm.wasmPaths = aqui('../vendor/ort/');
  ort.env.wasm.numThreads = 1; ort.env.logLevel = 'error';
  ort.env.wasm.wasmBinary = await descargar(aqui('../vendor/ort/ort-wasm-simd-threaded.wasm'), 'el motor (1 de 4)');
  ids = new TextDecoder().decode(await descargar(aqui('../indice/ids.txt'), 'los nombres de las fotos (2 de 4)')).split('\n');
  Q = new Int8Array(await descargar(aqui('../indice/significado.i8'), 'el índice (3 de 4)'));
  const pca = new Float32Array(await descargar(aqui('../indice/pca.f32'), 'el índice'));
  media = pca.subarray(0, 512); P = pca.subarray(512, 512 + 512 * D); escala = pca.subarray(512 + 512 * D);
  const pesos = await descargar(modelo || MODELO, 'el ojo CLIP, 89 MB (4 de 4)');
  avisar('significado: despertando el ojo…');
  sesion = await ort.InferenceSession.create(new Uint8Array(pesos), { executionProviders: ['wasm'], graphOptimizationLevel: 'all' });
  entrada = sesion.inputNames[0];
  salida = sesion.outputNames.includes('image_embeds') ? 'image_embeds' : sesion.outputNames[0];
}

let lienzo, cx;
async function ver(img) {
  if (!lienzo) { lienzo = new OffscreenCanvas(224, 224); cx = lienzo.getContext('2d', { willReadFrequently: true }); }
  cx.drawImage(img, 0, 0, 224, 224); img.close();
  const px = cx.getImageData(0, 0, 224, 224).data, n = 224 * 224, x = new Float32Array(3 * n);
  for (let i = 0, j = 0; i < n; i++, j += 4) for (let c = 0; c < 3; c++) x[c * n + i] = (px[j + c] / 255 - MEDIA[c]) / DESV[c];
  const res = (await sesion.run({ [entrada]: new ort.Tensor('float32', x, [1, 3, 224, 224]) }))[salida];
  const e = res.data; // 512 (si llega una secuencia, se toma el primer vector)
  // huella → PCA → normalizar → dividir por la escala de cada dimensión
  let ne = 0; for (let i = 0; i < 512; i++) ne += e[i] * e[i]; ne = Math.sqrt(ne) || 1;
  const z = new Float32Array(D);
  for (let k = 0; k < 512; k++) { const v = e[k] / ne - media[k], o = k * D; for (let d = 0; d < D; d++) z[d] += v * P[o + d]; }
  let nz = 0; for (let d = 0; d < D; d++) nz += z[d] * z[d]; nz = Math.sqrt(nz) || 1;
  for (let d = 0; d < D; d++) z[d] = z[d] / nz / escala[d];
  // comparar con las 250.000
  const N = Q.length / D, mejores = [];
  let umbral = -Infinity;
  for (let k = 0; k < N; k++) {
    let s = 0; const o = k * D;
    for (let d = 0; d < D; d++) s += z[d] * Q[o + d];
    if (s > umbral || mejores.length < 8) {
      mejores.push([s, k]); mejores.sort((a, b) => b[0] - a[0]); if (mejores.length > 8) mejores.pop();
      umbral = mejores[mejores.length - 1][0];
    }
  }
  return mejores.map(([s, k]) => ({ id: ids[k], d: -s }));
}

onmessage = async (ev) => {
  const m = ev.data;
  try {
    if (m.tipo === 'cargar') { await cargar(m.modelo); postMessage({ tipo: 'listo', n: Q.length / D }); }
    else if (m.tipo === 'ver') { const t0 = performance.now(); const lista = await ver(m.imagen); postMessage({ tipo: 'candidatas', lista, ms: performance.now() - t0 }); }
  } catch (err) { postMessage({ tipo: 'error', texto: String(err && err.message || err) }); }
};
