// main.js — fotograma ajeno: lo que la cámara ve, sustituido por la fotografía existente que más se le parece.
// Dos ojos, cada uno en su hilo: FORMA (composición y color, 25.000 fotos) y SIGNIFICADO (CLIP, 250.000 fotos).
// El hilo principal solo pide miradas, carga la foto elegida y la pinta en el lienzo (que es lo que se graba).
import { Camara } from './camara.js';
import { Grabadora, guardar } from './grabar.js';

const $ = (s) => document.querySelector(s);
const VERSION = 'v0.1';
const prueba = new URLSearchParams(location.search).has('prueba'); // datos locales para probar sin internet
const video = $('#video'), canvas = $('#lienzo'), cx = canvas.getContext('2d');
const camara = new Camara(video);
let modo = 'forma', grabadora, rec = [0, 0, 1, 1], actual = null, actualClave = '', pedida = 0;
const ojos = {};
window.AJENO = { ojos, get actual() { return actualClave; } };

function avisar(t) { $('#aviso').textContent = t; $('#aviso').hidden = !t; $('#estado').textContent = t; }
const mostrarError = (m) => avisar('error: ' + m);
addEventListener('error', (e) => mostrarError(e.message));
addEventListener('unhandledrejection', (e) => mostrarError(e.reason && e.reason.message || e.reason));

// ——— los ojos ———
function crearOjo(nombre, archivo, datos) {
  const o = { nombre, listo: false, ocupado: false, ms: 0, ultima: 0, error: '' };
  o.w = new Worker(new URL(archivo, import.meta.url), { type: 'module' });
  o.w.onmessage = (e) => {
    const r = e.data;
    if (r.tipo === 'aviso') { if (modo === nombre) avisar(r.texto); }
    else if (r.tipo === 'listo') { o.listo = true; o.n = r.n; if (modo === nombre) avisar(''); }
    else if (r.tipo === 'error') { o.ocupado = false; o.error = r.texto; if (modo === nombre) mostrarError(`${nombre}: ${r.texto}`); }
    else if (r.tipo === 'candidatas') { o.ocupado = false; o.ms = o.ms ? o.ms * 0.8 + r.ms * 0.2 : r.ms; if (modo === nombre) elegir(r.lista, nombre); }
  };
  o.w.postMessage({ tipo: 'cargar', ...datos });
  return o;
}

// la URL de cada foto, al tamaño del lienzo
function urlDe(c, nombre) {
  const W = canvas.width, H = canvas.height;
  if (prueba) return nombre === 'forma' ? c.url : `prueba/fotos/${[...c.id].reduce((a, ch) => a + ch.charCodeAt(0), 0) % 12}.jpg`;
  if (nombre === 'forma') return `${c.url}?w=${W}&h=${H}&fit=crop&q=70&fm=jpg`;
  return `https://unsplash.com/photos/${c.id}/download?w=${Math.max(W, H)}`;
}

// caché de fotos ya cargadas (las últimas 80)
const fotos = new Map();
function cargarFoto(url) {
  if (fotos.has(url)) { const f = fotos.get(url); fotos.delete(url); fotos.set(url, f); return f; }
  const f = new Promise((ok, mal) => {
    const intentar = (cors) => {
      const img = new Image(); if (cors) img.crossOrigin = 'anonymous';
      img.onload = () => { img.sinCors = !cors; ok(img); };
      img.onerror = () => (cors ? intentar(false) : mal(new Error('no carga')));
      img.src = url;
    };
    intentar(true);
  });
  fotos.set(url, f); f.catch(() => fotos.delete(url));
  if (fotos.size > 80) fotos.delete(fotos.keys().next().value);
  return f;
}

// de las candidatas, la primera que cargue (la más parecida); si la actual está casi igual de cerca, se queda
async function elegir(lista, nombre) {
  const n = ++pedida;
  const sigue = lista.findIndex((c) => (c.id || c.url) === actualClave);
  if (sigue > 0 && lista[sigue].d - lista[0].d < Math.abs(lista[0].d) * 0.02) return;
  for (const c of lista) {
    try {
      const img = await cargarFoto(urlDe(c, nombre));
      if (n !== pedida || modo !== nombre) return; // ya llegó una mirada más nueva
      actual = img; actualClave = c.id || c.url;
      $('#credito').textContent = c.autor ? `foto: ${c.autor} · Unsplash` : `unsplash.com/photos/${c.id}`;
      if (img.sinCors) $('#credito').textContent += ' · (sin grabación)';
      return;
    } catch (e) { /* esa foto ya no existe: la siguiente */ }
  }
}

// ——— el bucle: pintar lo que haya y pedir la siguiente mirada ———
function pintar(fuente, sw, sh) {
  const W = canvas.width, H = canvas.height, a = W / H, as = sw / sh;
  let x = 0, y = 0, w = sw, h = sh;
  if (as > a) { w = sh * a; x = (sw - w) / 2; } else { h = sw / a; y = (sh - h) / 2; }
  cx.drawImage(fuente, x, y, w, h, 0, 0, W, H);
}
function bucle() {
  const t = performance.now();
  if (video.readyState >= 2) {
    rec = camara.recorte(canvas.width, canvas.height);
    if (actual) pintar(actual, actual.naturalWidth, actual.naturalHeight);
    else { cx.filter = 'grayscale(1) contrast(1.1)'; pintar(video, video.videoWidth, video.videoHeight); cx.filter = 'none'; }
    const o = ojos[modo];
    if (o && o.listo && !o.ocupado && t - o.ultima > (modo === 'forma' ? 90 : 150)) { o.ocupado = true; o.ultima = t; mirar(o); }
    if ($('#ver').checked) $('#st').textContent = `${modo} · ${o && o.listo ? o.n + ' fotos · ' + (o.ms | 0) + ' ms por mirada' : 'cargando'}`;
  }
  if (grabadora && grabadora.grabando) { const s = grabadora.segundos() | 0; $('#tiempo').textContent = `${(s / 60) | 0}:${String(s % 60).padStart(2, '0')}`; }
  requestAnimationFrame(bucle);
}
async function mirar(o) {
  try {
    const vw = video.videoWidth, vh = video.videoHeight;
    let [x, y, w, h] = [rec[0] * vw, rec[1] * vh, rec[2] * vw, rec[3] * vh];
    let opciones;
    if (o.nombre === 'forma') opciones = { resizeWidth: 24, resizeHeight: 48, resizeQuality: 'medium' };
    else { const l = Math.min(w, h); x += (w - l) / 2; y += (h - l) / 2; w = h = l; opciones = { resizeWidth: 224, resizeHeight: 224, resizeQuality: 'high' }; }
    const img = await createImageBitmap(video, Math.round(x), Math.round(y), Math.round(w), Math.round(h), opciones);
    o.w.postMessage({ tipo: 'ver', imagen: img }, [img]);
  } catch (e) { o.ocupado = false; }
}

function dimensionar() {
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  let w = Math.round(innerWidth * dpr), h = Math.round(innerHeight * dpr);
  const k = Math.min(1, 1280 / Math.max(w, h));
  canvas.width = Math.round(w * k / 2) * 2; canvas.height = Math.round(h * k / 2) * 2;
}

function ponerModo(m) {
  modo = m; actual = null; actualClave = ''; pedida++;
  $('#modo').textContent = m;
  const o = ojos[m];
  avisar(o && o.error ? `error: ${m}: ${o.error}` : o && !o.listo ? `${m}: preparando…` : '');
  if (!ojos[m]) ojos[m] = m === 'forma'
    ? crearOjo('forma', './forma-trabajador.js', { aspecto: canvas.width / canvas.height, tabla: prueba ? new URL('prueba/photos.tsv', location.href).href : null })
    : crearOjo('significado', './significado-trabajador.js', { modelo: prueba ? new URL('prueba/clip.onnx', location.href).href : null });
}

async function empezar() {
  if (empezar.yendo) return; empezar.yendo = true;
  try {
    avisar('pidiendo la cámara…');
    await camara.abrir();
    if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(() => {});
    $('#ov').hidden = true; $('#mandos').hidden = false; $('#miniatura').srcObject = camara.flujo;
    ponerModo('forma');
    requestAnimationFrame(bucle);
  } catch (e) { mostrarError(e.name === 'NotAllowedError' ? 'sin permiso para la cámara' : e.message); empezar.yendo = false; }
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
grabadora = new Grabadora(canvas);
$('#version').textContent = VERSION;
$('#pr').onclick = empezar;
$('#grabar').onclick = alternarGrabacion;
$('#girar').onclick = () => camara.girar().then(() => { $('#miniatura').srcObject = camara.flujo; });
$('#modo').onclick = () => ponerModo(modo === 'forma' ? 'significado' : 'forma');
$('#ajustes-boton').onclick = () => { $('#cfgP').hidden = !$('#cfgP').hidden; };
$('#mini').onchange = (e) => { $('#miniatura').hidden = !e.target.checked; };
$('#ver').onchange = (e) => { $('#st').hidden = !e.target.checked; };
if (!window.isSecureContext) avisar('hace falta abrir esta página con https:// para usar la cámara');
