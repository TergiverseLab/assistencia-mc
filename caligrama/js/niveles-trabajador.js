// niveles-trabajador.js — mide, en otro hilo, el gris más oscuro y el más claro de una miniatura de la cámara.
let cx = null;
onmessage = (e) => {
  const img = e.data;
  if (!cx) cx = new OffscreenCanvas(48, 48).getContext('2d', { willReadFrequently: true });
  cx.drawImage(img, 0, 0, 48, 48); img.close();
  const d = cx.getImageData(0, 0, 48, 48).data, h = new Uint32Array(256), n = 48 * 48;
  for (let i = 0; i < d.length; i += 4) h[(d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114) | 0]++;
  let a = 0, lo = 0, hi = 255;
  for (let i = 0; i < 256; i++) { a += h[i]; if (a > n * 0.02) { lo = i; break; } }
  a = 0; for (let i = 255; i >= 0; i--) { a += h[i]; if (a > n * 0.02) { hi = i; break; } }
  postMessage([lo / 255, Math.max(lo + 10, hi) / 255]);
};
