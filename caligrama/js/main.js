// main.js — el bucle: cámara → visión → nombrar → búfer del bosque → pasada de texto → (grabar).
import { Lienzo } from './render.js';
import { Nombrador } from './nombrar.js';
import { Vision } from './vision.js';
import { Escritura } from './escritura.js';
import { Fondo } from './relatos.js';
import { Camara } from './camara.js';
import { Grabadora, guardar } from './grabar.js';

const $ = (s) => document.querySelector(s);
const ajustes = cargarAjustes();
function cargarAjustes() {
  const def = { delirio: 0.45, letra: 9, modo: 'exterior', fantasma: 0, micro: true, ver: false };
  try {
    const a = Object.assign(def, JSON.parse(localStorage.getItem('caligrama:ajustes') || '{}'));
    if (a.modo !== 'interior') a.modo = 'exterior';
    if (!(a.letra >= 6 && a.letra <= 14)) a.letra = 9;
    return a;
  } catch (e) { return def; }
}
function guardarAjustes() { try { localStorage.setItem('caligrama:ajustes', JSON.stringify(ajustes)); } catch (e) {} }

const video = $('#video'), canvas = $('#lienzo');
const nombrador = new Nombrador();
const vision = new Vision(nombrador);
const escritura = new Escritura(); escritura.nombrador = nombrador;
const fondo = new Fondo();
const camara = new Camara(video);
let lienzo, grabadora, cols = 0, filas = 0, muestra, muestraCtx, rec = [0, 0, 1, 1];
window.CALIGRAMA = { vision, escritura, nombrador, camara, ajustes, fondo };

function avisar(t) { $('#estado').textContent = t; }

function dimensionar() {
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  let w = Math.round(innerWidth * dpr), h = Math.round(innerHeight * dpr);
  const k = Math.min(1, 1440 / Math.max(w, h)); // el vídeo grabado no necesita más
  w = Math.round(w * k / 2) * 2; h = Math.round(h * k / 2) * 2;
  [cols, filas] = lienzo.tam(w, h, ajustes.letra, w / innerWidth);
  escritura.tam(cols, filas);
  muestra.width = cols; muestra.height = filas;
}

function aplicar() {
  nombrador.delirio = ajustes.delirio;
  escritura.interior = lienzo.interior = ajustes.modo === 'interior';
  lienzo.fantasma = ajustes.fantasma;
  document.body.dataset.modo = ajustes.modo;
  $('#delirio').value = ajustes.delirio; $('#letra').value = ajustes.letra; $('#fantasma').value = ajustes.fantasma;
  $('#micro').checked = ajustes.micro; $('#ver').checked = ajustes.ver;
  $('#modo').textContent = ajustes.modo;
}

// luminancia de la escena a la resolución de la rejilla, normalizada (la exposición del móvil cambia sola)
function medirLuz() {
  const [x, y, w, h] = rec, vw = video.videoWidth, vh = video.videoHeight;
  muestraCtx.save();
  if (camara.frontal) { muestraCtx.translate(cols, 0); muestraCtx.scale(-1, 1); }
  muestraCtx.drawImage(video, x * vw, y * vh, w * vw, h * vh, 0, 0, cols, filas);
  muestraCtx.restore();
  const d = muestraCtx.getImageData(0, 0, cols, filas).data, L = escritura.lum;
  let lo = 1, hi = 0;
  for (let i = 0; i < L.length; i++) { const l = (d[i * 4] * 0.299 + d[i * 4 + 1] * 0.587 + d[i * 4 + 2] * 0.114) / 255; L[i] = l; if (l < lo) lo = l; if (l > hi) hi = l; }
  const s = 1 / Math.max(0.15, hi - lo);
  for (let i = 0; i < L.length; i++) L[i] = Math.min(1, Math.max(0, (L[i] - lo) * s));
}

let antes = performance.now(), fps = 30, ultimoMurmullo = 0;
function bucle() {
  const ahora = performance.now(); fps = fps * 0.95 + (1000 / Math.max(1, ahora - antes)) * 0.05; antes = ahora;
  const t = ahora / 1000;
  if (video.readyState >= 2) {
    rec = camara.recorte(canvas.width, canvas.height);
    medirLuz();
    vision.ver(video);
    vision.derivar(t);
    if (t - ultimoMurmullo > 0.7) { // el fondo murmura, palabra a palabra, lo que el ojo cree ver
      const vistas = vision.cosas.map((c) => c.nombre.palabra);
      if (escritura.cuerpo && t - escritura.cuerpo.visto < 2) vistas.push(escritura.cuerpo.nombre.palabra);
      fondo.murmurar(vistas); ultimoMurmullo = t;
    }
    escritura.escribir(t, vision.cosas, vision.mascara, rec, camara.frontal);
    lienzo.dibujar(escritura, t, fondo.texto, video, rec, camara.frontal);
    if (ajustes.ver) {
      $('#st').textContent = vision.cosas.map((c) => `${c.etiqueta} ${(c.confianza * 100) | 0}% → ${c.nombre.palabra}`).join('\n') + `\n${cols}×${filas} · ${fps.toFixed(0)} fps · obj ${vision.ritmo.obj | 0} ms · sil ${vision.ritmo.seg | 0} ms`;
    }
  }
  if (grabadora && grabadora.grabando) { const s = grabadora.segundos() | 0; $('#tiempo').textContent = `${(s / 60) | 0}:${String(s % 60).padStart(2, '0')}`; }
  requestAnimationFrame(bucle);
}

async function empezar() {
  if (empezar.yendo) return; empezar.yendo = true;
  try {
    avisar('pidiendo la cámara…');
    await camara.abrir();
    if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(() => {});
    await vision.cargar(avisar);
    $('#ov').hidden = true; $('#mandos').hidden = false;
    requestAnimationFrame(bucle);
  } catch (e) {
    console.error(e);
    avisar(e.name === 'NotAllowedError' ? 'sin permiso para la cámara: actívalo en los ajustes del navegador y vuelve a tocar' : 'no se pudo abrir: ' + e.message);
    empezar.yendo = false;
  }
}

async function alternarGrabacion() {
  const b = $('#grabar');
  if (!grabadora.grabando) {
    await grabadora.empezar(ajustes.micro);
    b.classList.add('activo'); $('#tiempo').hidden = false;
  } else {
    const r = await grabadora.parar();
    b.classList.remove('activo'); $('#tiempo').hidden = true;
    const v = $('#revisar video'); v.src = URL.createObjectURL(r.blob); $('#revisar').hidden = false;
    $('#guardar').onclick = async () => { const s = await guardar(r); $('#nota').textContent = s === 'compartido' ? 'enviado' : s === 'descargado' ? 'guardado en descargas' : ''; };
    $('#descartar').onclick = () => { URL.revokeObjectURL(v.src); v.removeAttribute('src'); $('#revisar').hidden = true; $('#nota').textContent = ''; };
  }
}

async function iniciar() {
  try { await Promise.all(['400 normal', '700 normal', '400 italic', '700 italic'].map((s) => { const [w, st] = s.split(' '); return document.fonts.load(`${st} ${w} 20px "Courier Prime"`); })); } catch (e) {}
  lienzo = new Lienzo(canvas);
  grabadora = new Grabadora(canvas);
  muestra = document.createElement('canvas'); muestraCtx = muestra.getContext('2d', { willReadFrequently: true });
  aplicar(); dimensionar();
  addEventListener('resize', dimensionar);
  $('#pr').onclick = empezar;
  $('#grabar').onclick = alternarGrabacion;
  $('#girar').onclick = async () => { await camara.girar(); vision.cosas = []; };
  $('#ajustes-boton').onclick = () => { $('#cfgP').hidden = !$('#cfgP').hidden; };
  $('#modo').onclick = () => { ajustes.modo = ajustes.modo === 'exterior' ? 'interior' : 'exterior'; aplicar(); guardarAjustes(); };
  $('#delirio').oninput = (e) => { ajustes.delirio = +e.target.value; aplicar(); guardarAjustes(); };
  $('#letra').oninput = (e) => { ajustes.letra = +e.target.value; dimensionar(); guardarAjustes(); };
  $('#fantasma').oninput = (e) => { ajustes.fantasma = +e.target.value; aplicar(); guardarAjustes(); };
  $('#micro').onchange = (e) => { ajustes.micro = e.target.checked; guardarAjustes(); };
  $('#ver').onchange = (e) => { ajustes.ver = e.target.checked; $('#st').hidden = !ajustes.ver; guardarAjustes(); };
  $('#st').hidden = !ajustes.ver;
  if (!window.isSecureContext) avisar('hace falta abrir esta página con https:// para usar la cámara');
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
}
iniciar();
