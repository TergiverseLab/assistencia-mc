// main.js — dos relojes:
//  · el de la imagen: cada fotograma de la cámara sube a la tarjeta gráfica y se escribe en letras (gl.js),
//    a la velocidad de la pantalla;
//  · el del ojo: la IA nombra lo que ve a su ritmo (segmentar.js u objetos.js) y, cada vez que termina,
//    el mapa de palabras se actualiza. La imagen nunca la espera.
import { Lienzo } from './gl.js';
import { crearAtlas } from './atlas.js';
import { TODAS, letraDeFila } from './clases.js';
import { Camara } from './camara.js';
import { Niveles } from './niveles.js';
import { Grabadora, guardar } from './grabar.js';

const $ = (s) => document.querySelector(s);
const VERSION = 'v1.1';
// cualquier error queda escrito en pantalla, nunca en silencio
const mostrarError = (m) => { const t = 'error: ' + m; const e = document.querySelector('#estado'), a = document.querySelector('#aviso'); if (e) e.textContent = t; if (a) { a.textContent = t; a.hidden = false; } };
addEventListener('error', (e) => mostrarError(e.message));
addEventListener('unhandledrejection', (e) => mostrarError(e.reason && e.reason.message || e.reason));
// el toque responde desde el primer instante: si la app aún se prepara, empieza en cuanto esté
let preparada; const listo = new Promise((r) => { preparada = r; });
document.querySelector('#pr').onclick = () => { avisar('un momento…'); listo.then(empezar); };
const OJOS = { escena: 'escena · 150 cosas (SegFormer)', objetos: 'objetos · 80 cosas (CenterNet)' };
const ajustes = cargarAjustes();
function cargarAjustes() {
  const def = { letra: 7.5, detalle: 0.9, contraste: 1.2, relleno: 0.7, modo: 'exterior', ojo: 'escena', micro: true, ver: false };
  try {
    const a = Object.assign(def, JSON.parse(localStorage.getItem('caligrama:ajustes4') || '{}'));
    if (!OJOS[a.ojo]) a.ojo = 'escena';
    if (a.modo !== 'interior') a.modo = 'exterior';
    return a;
  } catch (e) { return def; }
}
function guardarAjustes() { try { localStorage.setItem('caligrama:ajustes4', JSON.stringify(ajustes)); } catch (e) {} }

const video = $('#video'), canvas = $('#lienzo');
const camara = new Camara(video);
const niveles = new Niveles();
let calidad = 1, lento = 0, lienzo, grabadora, ojo = null, cols = 0, filas = 0, versionVista = -1, cuadroNuevo = true;
const saltar = {}; // depuración: apagar partes del bucle para medir
window.CALIGRAMA = { saltar, camara, ajustes, get ojo() { return ojo; }, get lienzo() { return lienzo; } };

function avisar(t) { $('#estado').textContent = t; $('#aviso').textContent = t; }

// la paleta de palabras: una fila por cosa, [largo, estilo, cuerpo] y luego sus letras (con su espacio)
function prepararPalabras(atlas) {
  const ANCHO = 32, alto = TODAS.length, d = new Uint8Array(ANCHO * alto * 4);
  TODAS.forEach((nombre, k) => {
    const txt = (nombre + ' ').slice(0, ANCHO - 1), [estilo, cuerpo] = letraDeFila(k), o = k * ANCHO * 4;
    d[o] = txt.length; d[o + 1] = estilo; d[o + 2] = cuerpo;
    [...txt].forEach((c, i) => { d[o + (i + 1) * 4] = atlas.indice.get(c) || 0; });
  });
  lienzo.palabras(d, ANCHO, alto);
}

function dimensionar() {
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  let w = Math.round(innerWidth * dpr), h = Math.round(innerHeight * dpr);
  const k = Math.min(1, 1440 / Math.max(w, h)) * calidad; // el vídeo grabado no necesita más; «calidad» baja sola si no va fluido
  w = Math.round(w * k / 2) * 2; h = Math.round(h * k / 2) * 2;
  const escala = w / innerWidth; // píxeles de canvas por px CSS
  [cols, filas] = lienzo.tam(w, h, ajustes.letra * 0.6 * escala, ajustes.letra * 1.25 * escala);
}

function aplicar() {
  Object.assign(lienzo.ajustes, { interior: ajustes.modo === 'interior', detalle: ajustes.detalle, contraste: ajustes.contraste, relleno: ajustes.relleno });
  document.body.dataset.modo = ajustes.modo;
  $('#letra').value = ajustes.letra; $('#detalle').value = ajustes.detalle; $('#contraste').value = ajustes.contraste; $('#relleno').value = ajustes.relleno;
  $('#micro').checked = ajustes.micro; $('#ver').checked = ajustes.ver; $('#ojo').value = ajustes.ojo;
  $('#modo').textContent = ajustes.modo;
}

// cambiar de ojo: el dibujo sigue mientras el nuevo se carga
async function ponerOjo(nombre) {
  ojo = null; versionVista = -1;
  lienzo.etiquetas(new Uint8Array([150]), 1, 1);
  $('#aviso').hidden = false;
  try {
    const m = nombre === 'objetos' ? new (await import('./objetos.js')).OjoObjetos() : new (await import('./segmentar.js')).Segmentador();
    await m.cargar(avisar);
    if (ajustes.ojo === nombre) { ojo = m; $('#aviso').hidden = true; }
  } catch (e) {
    console.error(e); avisar('el ojo no ha podido abrirse: ' + (e.message || e) + ' · la imagen sigue, sin nombres');
  }
}

let antes = performance.now(), fps = 60, rec = [0, 0, 1, 1], ultimaMirada = 0;
function bucle() {
  const ahora = performance.now(); fps = fps * 0.93 + (1000 / Math.max(1, ahora - antes)) * 0.07; antes = ahora;
  if (video.readyState >= 2) {
    rec = camara.recorte(canvas.width, canvas.height);
    if (cuadroNuevo && !saltar.video) { lienzo.subirVideo(video); if (video.requestVideoFrameCallback) cuadroNuevo = false; }
    // el ojo mira como mucho diez veces por segundo; no se espera: termina cuando termina
    if (ojo && !ojo.ocupado && ahora - ultimaMirada > 100) { ultimaMirada = ahora; ojo.ver(video, rec); }
    if (ojo && ojo.version !== versionVista && ojo.mapa) { lienzo.etiquetas(ojo.mapa, ojo.ancho, ojo.altoMapa); versionVista = ojo.version; }
    if (!saltar.niveles) lienzo.niveles = niveles.medir(video, rec, ahora / 1000);
    if (!saltar.dibujar) lienzo.dibujar(rec, camara.frontal);
    if (ajustes.ver) {
      const lista = ojo ? ojo.recuento().map(([k, p]) => `${TODAS[k]} ${Math.round(p * 100)}%`).join('\n') : '';
      $('#st').textContent = `${lista}\n${cols}×${filas} · ${fps.toFixed(0)} fps imagen · calidad ${Math.round(calidad * 100)}%` + (ojo ? `\n${ojo.motor} · ${ojo.ms | 0} ms por mirada` : '');
    }
  }
  // calidad automática: si la imagen no va fluida durante un par de segundos, menos píxeles (las letras no cambian)
  const dt = Math.min(0.2, (ahora - (bucle.previo || ahora)) / 1000); bucle.previo = ahora;
  if (fps < 45) lento += dt; else lento = Math.max(0, lento - dt * 2);
  if (lento > 1.2 && calidad > 0.5) { calidad = Math.max(0.5, calidad - 0.2); lento = 0; dimensionar(); }
  if (grabadora && grabadora.grabando) { const s = grabadora.segundos() | 0; $('#tiempo').textContent = `${(s / 60) | 0}:${String(s % 60).padStart(2, '0')}`; }
  requestAnimationFrame(bucle);
}
function vigilarCuadros() { // subir el vídeo solo cuando la cámara da un cuadro nuevo
  if (!video.requestVideoFrameCallback) return;
  const cb = () => { cuadroNuevo = true; video.requestVideoFrameCallback(cb); };
  video.requestVideoFrameCallback(cb);
}

async function empezar() {
  if (empezar.yendo) return; empezar.yendo = true;
  try {
    avisar('pidiendo la cámara…');
    await camara.abrir();
    vigilarCuadros();
    if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(() => {});
    $('#ov').hidden = true; $('#mandos').hidden = false;
    requestAnimationFrame(bucle); // la imagen empieza ya; el ojo llega cuando llegue
    ponerOjo(ajustes.ojo);
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
  // las letras: se esperan como mucho 3 s; si tardan más, se sigue (el atlas se rehace cuando lleguen)
  const fuentes = Promise.all(['normal 400', 'normal 700', 'italic 400', 'italic 700'].map((s) => document.fonts.load(`${s} 40px "Courier Prime"`)));
  let llegaron = false; await Promise.race([fuentes.then(() => { llegaron = true; }), new Promise((r) => setTimeout(r, 3000))]).catch(() => {});
  try { lienzo = new Lienzo(canvas); } catch (e) { mostrarError(e.message); return; }
  const atlas = crearAtlas(TODAS.join(''));
  lienzo.atlas(atlas); prepararPalabras(atlas);
  if (!llegaron) fuentes.then(() => lienzo.atlas(crearAtlas(TODAS.join('')))).catch(() => {});
  grabadora = new Grabadora(canvas);
  aplicar(); dimensionar();
  addEventListener('resize', dimensionar);
  for (const [k, v] of Object.entries(OJOS)) { const o = document.createElement('option'); o.value = k; o.textContent = v; $('#ojo').append(o); }
  $('#ojo').value = ajustes.ojo;
  $('#grabar').onclick = alternarGrabacion;
  $('#girar').onclick = () => camara.girar();
  $('#ajustes-boton').onclick = () => { $('#cfgP').hidden = !$('#cfgP').hidden; };
  $('#modo').onclick = () => { ajustes.modo = ajustes.modo === 'exterior' ? 'interior' : 'exterior'; aplicar(); guardarAjustes(); };
  $('#letra').oninput = (e) => { ajustes.letra = +e.target.value; dimensionar(); guardarAjustes(); };
  $('#detalle').oninput = (e) => { ajustes.detalle = +e.target.value; aplicar(); guardarAjustes(); };
  $('#contraste').oninput = (e) => { ajustes.contraste = +e.target.value; aplicar(); guardarAjustes(); };
  $('#relleno').oninput = (e) => { ajustes.relleno = +e.target.value; aplicar(); guardarAjustes(); };
  $('#ojo').onchange = (e) => { ajustes.ojo = e.target.value; guardarAjustes(); if (!$('#ov').hidden) return; ponerOjo(ajustes.ojo); };
  $('#micro').onchange = (e) => { ajustes.micro = e.target.checked; guardarAjustes(); };
  $('#ver').onchange = (e) => { ajustes.ver = e.target.checked; $('#st').hidden = !ajustes.ver; guardarAjustes(); };
  $('#st').hidden = !ajustes.ver;
  if (!window.isSecureContext) avisar('hace falta abrir esta página con https:// para usar la cámara');
  $('#version').textContent = VERSION;
  preparada();
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
}
iniciar();
