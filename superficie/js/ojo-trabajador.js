// ojo-trabajador.js — el ojo de la escena, en su propio hilo (Web Worker).
// Recibe un fotograma ya reducido (ImageBitmap), lo normaliza, ejecuta SegFormer-b0 (ADE20K, 150 clases) con
// ONNX Runtime (WebAssembly, modelo cuantizado de 4,4 MB; motor de 15 MB servido con la app) y devuelve solo
// el mapa de etiquetas. El hilo principal no hace nada de esto: solo dibuja.
// Las dos descargas (motor y modelo) muestran su porcentaje y quedan guardadas en el móvil.
import * as ort from '../vendor/ort/ort.wasm.min.mjs';

const BASE = 'https://huggingface.co/Xenova/segformer-b0-finetuned-ade-512-512/resolve/main/onnx/';
const MEDIA = [0.485, 0.456, 0.406], DESV = [0.229, 0.224, 0.225];
let sesion, entrada, salida, lienzo, cx;
const avisar = (texto) => postMessage({ tipo: 'aviso', texto });

async function descargar(url, nombre) {
  let cache = null;
  try { cache = await caches.open('caligrama-modelos'); const r = await cache.match(url); if (r) return new Uint8Array(await r.arrayBuffer()); } catch (e) {}
  const r = await fetch(url);
  if (!r.ok) throw new Error(`no se pudo descargar el modelo (${r.status})`);
  const total = +r.headers.get('content-length') || 0, lector = r.body.getReader(), trozos = [];
  let n = 0, ultimo = 0;
  for (;;) {
    const { done, value } = await lector.read(); if (done) break;
    trozos.push(value); n += value.length;
    if (n - ultimo > 300000) { ultimo = n; avisar(`descargando ${nombre}… ${total ? Math.round((n / total) * 100) + ' %' : (n / 1048576).toFixed(1) + ' MB'}`); }
  }
  const datos = new Uint8Array(n); let o = 0; for (const t of trozos) { datos.set(t, o); o += t.length; }
  try { if (cache) await cache.put(url, new Response(datos)); } catch (e) {}
  return datos;
}

async function cargar(forzado) {
  ort.env.wasm.wasmPaths = new URL('../vendor/ort/', import.meta.url).href;
  ort.env.wasm.numThreads = self.crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 2) : 1;
  ort.env.logLevel = 'error';
  ort.env.wasm.wasmBinary = await descargar(new URL('../vendor/ort/ort-wasm-simd-threaded.wasm', import.meta.url).href, 'el motor (1 de 2)');
  const modelo = await descargar(forzado || BASE + 'model_quantized.onnx', 'el ojo (2 de 2)');
  avisar('despertando el ojo…');
  sesion = await ort.InferenceSession.create(modelo, { executionProviders: ['wasm'], graphOptimizationLevel: 'all' });
  entrada = sesion.inputNames[0]; salida = sesion.outputNames[0];
  return 'wasm int8';
}

async function ver(imagen) {
  const W = imagen.width, H = imagen.height;
  if (!lienzo || lienzo.width !== W || lienzo.height !== H) { lienzo = new OffscreenCanvas(W, H); cx = lienzo.getContext('2d', { willReadFrequently: true }); }
  cx.drawImage(imagen, 0, 0); imagen.close();
  const px = cx.getImageData(0, 0, W, H).data, n = W * H, x = new Float32Array(3 * n);
  for (let i = 0, j = 0; i < n; i++, j += 4) {
    x[i] = (px[j] / 255 - MEDIA[0]) / DESV[0];
    x[n + i] = (px[j + 1] / 255 - MEDIA[1]) / DESV[1];
    x[2 * n + i] = (px[j + 2] / 255 - MEDIA[2]) / DESV[2];
  }
  const res = (await sesion.run({ [entrada]: new ort.Tensor('float32', x, [1, 3, H, W]) }))[salida];
  const [, C, h, w] = res.dims, m = h * w;
  const d = res.type === 'float32' ? res.data : Float32Array.from(res.data);
  const mapa = new Uint8Array(m), mejor = d.slice(0, m); // la clase 0 como punto de partida
  for (let c = 1; c < C; c++) {
    const o = c * m;
    for (let i = 0; i < m; i++) { const v = d[o + i]; if (v > mejor[i]) { mejor[i] = v; mapa[i] = c; } }
  }
  if (res.dispose) res.dispose();
  return { mapa, w, h };
}

onmessage = async (e) => {
  const q = e.data;
  try {
    if (q.tipo === 'cargar') postMessage({ tipo: 'listo', motor: await cargar(q.forzado) });
    else if (q.tipo === 'ver') {
      const t0 = performance.now(), r = await ver(q.imagen);
      postMessage({ tipo: 'mapa', ...r, ms: performance.now() - t0 }, [r.mapa.buffer]);
    }
  } catch (err) { postMessage({ tipo: 'error', texto: String(err && err.message || err) }); }
};
