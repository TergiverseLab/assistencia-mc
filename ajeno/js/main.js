// main.js — fotograma ajeno: cada fotograma de la cámara, sustituido por la imagen del banco más parecida en
// forma (composición, luz y color). El banco: fotogramas de películas del móvil, o fotos de internet.
// Cada fotograma de la pantalla: miniatura de la cámara → hilo del banco (milisegundos) → imagen elegida →
// lienzo. Las imágenes del banco se guardan comprimidas y se descomprimen al vuelo (las 240 últimas quedan
// listas en memoria), para que quepan miles en el móvil.
import { Camara } from './camara.js';
import { Grabadora, guardar } from './grabar.js';
import { Pelicula } from './pelicula.js';

const $ = (s) => document.querySelector(s);
const VERSION = 'v0.2';
const prueba = new URLSearchParams(location.search).has('prueba');
const video = $('#video'), canvas = $('#lienzo'), cx = canvas.getContext('2d');
const camara = new Camara(video);
const ANCHO = 270;
let grabadora, rec = [0, 0, 1, 1], alto = 588, aspecto = 0.46, abierto = false;
let ocupado = false, ms = 0, mostrada = null, fps = 60, antes = performance.now();
const blobs = [], listas = new Map(), peliculas = [];
window.AJENO = { blobs, peliculas, get mostrada() { return mostrada; } };

function avisar(t) { $('#aviso').textContent = t; $('#aviso').hidden = !t; $('#estado').textContent = t; }
const mostrarError = (m) => avisar('error: ' + m);
addEventListener('error', (e) => mostrarError(e.message));
addEventListener('unhandledrejection', (e) => mostrarError(e.reason && e.reason.message || e.reason));

// ——— el banco ———
const banco = new Worker(new URL('./banco-trabajador.js', import.meta.url), { type: 'module' });
banco.onmessage = (e) => {
  const r = e.data;
  if (r.tipo === 'aviso') avisar(r.texto);
  else if (r.tipo === 'foto') blobs[r.i] = r.blob;
  else if (r.tipo === 'banco') contar(r.fallos);
  else if (r.tipo === 'error') mostrarError(r.texto);
  else if (r.tipo === 'elegidas') { ocupado = false; ms = ms * 0.9 + r.ms * 0.1; mostrar(r.lista); }
};
function contar(fallos) {
  const n = blobs.filter(Boolean).length;
  $('#credito').textContent = `banco: ${n} imágenes` + (peliculas.length ? ` · ${peliculas.map((p) => p.nombre.replace(/\.[^.]+$/, '')).join(', ')}` : '') + (fallos ? ` · ${fallos} fallos` : '');
}

// imagen lista para pintar (descomprimida), o null si aún se está descomprimiendo
function lista(i) {
  const b = listas.get(i);
  if (b && b !== 'pendiente') { listas.delete(i); listas.set(i, b); return b; }
  if (!b && blobs[i]) {
    listas.set(i, 'pendiente');
    createImageBitmap(blobs[i]).then((bmp) => {
      listas.set(i, bmp);
      while (listas.size > 240) { const [k, v] = listas.entries().next().value; listas.delete(k); if (v && v.close) v.close(); }
    }).catch(() => listas.delete(i));
  }
  return null;
}
// de las elegidas (la más parecida primero), la primera que ya esté lista; las demás se van preparando
function mostrar(indices) {
  for (const i of indices) { const b = lista(i); if (b) { mostrada = b; return; } }
}

// ——— el bucle: cada fotograma, una mirada ———
function bucle() {
  const t = performance.now(); fps = fps * 0.95 + (1000 / Math.max(1, t - antes)) * 0.05; antes = t;
  if (video.readyState >= 2) {
    rec = camara.recorte(canvas.width, canvas.height);
    if (mostrada) cx.drawImage(mostrada, 0, 0, canvas.width, canvas.height);
    else { const vw = video.videoWidth, vh = video.videoHeight; cx.filter = 'grayscale(1)'; cx.drawImage(video, rec[0] * vw, rec[1] * vh, rec[2] * vw, rec[3] * vh, 0, 0, canvas.width, canvas.height); cx.filter = 'none'; }
    if (!ocupado && blobs.length) { ocupado = true; mirar(); }
    if ($('#ver').checked) $('#st').textContent = `${fps.toFixed(0)} fps · ${ms.toFixed(1)} ms por búsqueda · ${blobs.length} en el banco`;
  }
  if (grabadora && grabadora.grabando) { const s = grabadora.segundos() | 0; $('#tiempo').textContent = `${(s / 60) | 0}:${String(s % 60).padStart(2, '0')}`; }
  requestAnimationFrame(bucle);
}
async function mirar() {
  try {
    const vw = video.videoWidth, vh = video.videoHeight;
    const img = await createImageBitmap(video, Math.round(rec[0] * vw), Math.round(rec[1] * vh), Math.round(rec[2] * vw), Math.round(rec[3] * vh), { resizeWidth: 36, resizeHeight: 64, resizeQuality: 'low' });
    banco.postMessage({ tipo: 'ver', imagen: img }, [img]);
  } catch (e) { ocupado = false; }
}

function dimensionar() {
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  let w = Math.round(innerWidth * dpr), h = Math.round(innerHeight * dpr);
  const k = Math.min(1, 1280 / Math.max(w, h));
  canvas.width = Math.round(w * k / 2) * 2; canvas.height = Math.round(h * k / 2) * 2;
}

// ——— abrir: cámara + banco ———
async function abrirCamara() {
  if (abierto) return; abierto = true;
  avisar('pidiendo la cámara…');
  await camara.abrir();
  if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(() => {});
  $('#ov').hidden = true; $('#mandos').hidden = false; $('#miniatura').srcObject = camara.flujo;
  avisar('');
  requestAnimationFrame(bucle);
}
async function anadirPeliculas(archivos) {
  try {
    await abrirCamara();
    for (const archivo of archivos) {
      const p = new Pelicula(archivo, aspecto, ANCHO, alto, (img) => banco.postMessage({ tipo: 'anadir', imagen: img }, [img]));
      await p.abrir(); peliculas.push(p); contar();
      avisar(`extrayendo fotogramas de «${p.nombre}»… (ya puedes mirar: el banco crece mientras tanto)`);
      setTimeout(() => avisar(''), 6000);
      await p.recorrer(6000, () => blobs.length < 6000);
    }
  } catch (e) { mostrarError(e.message || e); }
}
async function usarInternet() {
  try { await abrirCamara(); avisar('descargando fotos al banco… ya puedes mirar: crece mientras tanto'); banco.postMessage({ tipo: 'internet', tabla: prueba ? new URL('prueba/photos.tsv', location.href).href : null }); setTimeout(() => avisar(''), 8000); }
  catch (e) { mostrarError(e.message || e); }
}

async function alternarGrabacion() {
  const b = $('#grabar');
  try {
    if (!grabadora.grabando) { await grabadora.empezar(false); b.classList.add('activo'); $('#tiempo').hidden = false; }
    else {
      const r = await grabadora.parar(); b.classList.remove('activo'); $('#tiempo').hidden = true;
      const v = $('#revisar video'); v.src = URL.createObjectURL(r.blob); $('#revisar').hidden = false;
      $('#guardar').onclick = async () => { const s = await guardar(r); $('#nota').textContent = s === 'compartido' ? 'enviado' : s === 'descargado' ? 'guardado en descargas' : ''; };
      $('#descartar').onclick = () => { URL.revokeObjectURL(v.src); v.removeAttribute('src'); $('#revisar').hidden = true; $('#nota').textContent = ''; };
    }
  } catch (e) { mostrarError('no se puede grabar: ' + (e.message || e)); }
}

dimensionar(); addEventListener('resize', dimensionar);
aspecto = canvas.width / canvas.height; alto = Math.round(ANCHO / aspecto);
banco.postMessage({ tipo: 'cargar', aspecto, max: 6000, prueba });
grabadora = new Grabadora(canvas);
$('#version').textContent = VERSION;
$('#pelicula').onclick = () => $('#archivo').click();
$('#mas').onclick = () => $('#archivo').click();
$('#archivo').onchange = (e) => { if (e.target.files.length) anadirPeliculas([...e.target.files]); e.target.value = ''; };
$('#internet').onclick = usarInternet;
$('#grabar').onclick = alternarGrabacion;
$('#girar').onclick = () => camara.girar().then(() => { $('#miniatura').srcObject = camara.flujo; });
$('#ajustes-boton').onclick = () => { $('#cfgP').hidden = !$('#cfgP').hidden; };
$('#mini').onchange = (e) => { $('#miniatura').hidden = !e.target.checked; };
$('#ver').onchange = (e) => { $('#st').hidden = !e.target.checked; };
$('#memoria').oninput = (e) => { banco.postMessage({ tipo: 'memoria', valor: +e.target.value }); $('#memoria-n').textContent = e.target.value; };
if (!window.isSecureContext) avisar('hace falta abrir esta página con https:// para usar la cámara');
