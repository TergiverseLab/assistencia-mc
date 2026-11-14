// main.js — la cámara que escribe: lo que ves, descrito en prosa poética, renovándose mientras mueves el móvil.
// Dos ritmos: la imagen de la cámara se pinta a la velocidad de la pantalla; la escritura llega palabra a
// palabra y, en cuanto termina una frase, se manda el fotograma de ese instante y empieza la siguiente.
// Todo se pinta en un lienzo (cámara + texto), que es lo que se graba.
import { Camara } from './camara.js';
import { Grabadora, guardar } from './grabar.js';
import { elegirModelos, instrucciones, describir } from './claude.js';

const $ = (s) => document.querySelector(s);
const VERSION = 'v0.1';
const prueba = new URLSearchParams(location.search).has('prueba');
const video = $('#video'), canvas = $('#lienzo'), cx = canvas.getContext('2d');
const camara = new Camara(video), grabadora = new Grabadora(canvas);
const foto = document.createElement('canvas'), fcx = foto.getContext('2d');
let rec = [0, 0, 1, 1], modelos = null, escala = 1;
let actual = '', anterior = '', apagandose = '', apagado = 0, escribiendo = false, latencia = 0, generacion = 0;

const A = cargar();
function cargar() {
  const def = { clave: '', tono: 'poetico', voz: '', modelo: 'rapido', micro: true, ver: false };
  try { return Object.assign(def, JSON.parse(localStorage.getItem('escribe:ajustes') || '{}')); } catch (e) { return def; }
}
const guardarA = () => { try { localStorage.setItem('escribe:ajustes', JSON.stringify(A)); } catch (e) {} };

function avisar(t) { $('#estado').textContent = t; $('#aviso').textContent = t; $('#aviso').hidden = !t; }
addEventListener('error', (e) => avisar('error: ' + e.message));
addEventListener('unhandledrejection', (e) => avisar('error: ' + (e.reason && e.reason.message || e.reason)));

// ——— pintar: la cámara y la franja de papel con el texto ———
function lineas(texto, ancho) {
  const palabras = texto.split(/\s+/).filter(Boolean), out = []; let l = '';
  for (const p of palabras) { const prueba = l ? l + ' ' + p : p; if (cx.measureText(prueba).width > ancho && l) { out.push(l); l = p; } else l = prueba; }
  if (l) out.push(l);
  return out;
}
function pintar(t) {
  const W = canvas.width, H = canvas.height, vw = video.videoWidth, vh = video.videoHeight;
  cx.drawImage(video, rec[0] * vw, rec[1] * vh, rec[2] * vw, rec[3] * vh, 0, 0, W, H);
  const m = 18 * escala, tam = 17 * escala, inter = tam * 1.45, anchoTexto = W - m * 4;
  cx.font = `${tam}px "Courier Prime","Courier New",monospace`;
  const ls = lineas(actual, anchoTexto);
  cx.font = `italic ${tam * 0.82}px "Courier Prime","Courier New",monospace`;
  const lsA = apagandose ? lineas(apagandose, anchoTexto) : [];
  const vis = Math.max(0, 1 - (t - apagado) / 4000); // la frase anterior se desvanece en 4 s
  const alto = (ls.length || 1) * inter + (lsA.length && vis > 0 ? lsA.length * inter * 0.85 + m * 0.5 : 0) + m * 2;
  const y0 = H - alto - 96 * escala;
  cx.fillStyle = 'rgba(255,255,255,0.86)'; cx.fillRect(m, y0, W - m * 2, alto);
  cx.textBaseline = 'top'; let y = y0 + m;
  if (lsA.length && vis > 0) {
    cx.fillStyle = `rgba(110,105,100,${(0.9 * vis).toFixed(3)})`;
    for (const l of lsA) { cx.fillText(l, m * 2, y); y += inter * 0.85; }
    y += m * 0.5;
  }
  cx.font = `${tam}px "Courier Prime","Courier New",monospace`; cx.fillStyle = '#111';
  for (const l of ls) { cx.fillText(l, m * 2, y); y += inter; }
  if (escribiendo && Math.floor(t / 450) % 2) { cx.fillStyle = 'rgb(180,20,20)'; cx.fillRect(m * 2 + (ls.length ? cx.measureText(ls[ls.length - 1]).width + 4 : 0), y - inter + 2, tam * 0.5, tam); }
}
function bucle(t) {
  if (video.readyState >= 2) { rec = camara.recorte(canvas.width, canvas.height); pintar(t); }
  if ($('#ver').checked) $('#st').textContent = `${modelos ? modelos[A.modelo] : '…'} · ${(latencia / 1000).toFixed(1)} s por frase`;
  if (grabadora.grabando) { const s = grabadora.segundos() | 0; $('#tiempo').textContent = `${(s / 60) | 0}:${String(s % 60).padStart(2, '0')}`; }
  requestAnimationFrame(bucle);
}

// ——— escribir: un fotograma tras otro, sin parar ———
function fotograma() {
  const vw = video.videoWidth, vh = video.videoHeight, H = 768, W = Math.round(H * (canvas.width / canvas.height));
  foto.width = W; foto.height = H;
  fcx.drawImage(video, rec[0] * vw, rec[1] * vh, rec[2] * vw, rec[3] * vh, 0, 0, W, H);
  return foto.toDataURL('image/jpeg', 0.72).split(',')[1];
}
const FRASES_PRUEBA = ['La lámpara cuelga del techo como una gota de luz que no termina de caer, y el blanco de la pared la sostiene.', 'Una silla de madera clara espera junto a la mesa; su respaldo dibuja tres escalones hacia ninguna parte.', 'El suelo, pálido y quieto, guarda la sombra de las patas como quien guarda un secreto pequeño.'];
async function falsoDescribir({ alTexto }) {
  const f = FRASES_PRUEBA[(Math.random() * FRASES_PRUEBA.length) | 0]; let t = '';
  for (const p of f.split(' ')) { await new Promise((r) => setTimeout(r, 60)); t += (t ? ' ' : '') + p; alTexto(t); }
  return t;
}
async function escribir() {
  const mia = ++generacion;
  while (mia === generacion) {
    if (video.readyState < 2) { await new Promise((r) => setTimeout(r, 200)); continue; }
    const t0 = performance.now();
    try {
      escribiendo = true;
      const imagen = fotograma();
      let primera = true;
      const texto = await (prueba ? falsoDescribir : describir)({
        clave: A.clave, modelo: modelos && modelos[A.modelo], sistema: instrucciones(A.tono, A.voz), imagen, anterior,
        alTexto: (tx) => { if (mia !== generacion) return; if (primera) { apagandose = actual; apagado = performance.now(); primera = false; } actual = tx; }
      });
      if (mia !== generacion) return;
      anterior = texto; latencia = latencia ? latencia * 0.7 + (performance.now() - t0) * 0.3 : performance.now() - t0;
      avisar('');
    } catch (e) {
      avisar('error: ' + (e.message || e));
      await new Promise((r) => setTimeout(r, 3000));
    } finally { escribiendo = false; }
    await new Promise((r) => setTimeout(r, 250));
  }
}

function dimensionar() {
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  let w = Math.round(innerWidth * dpr), h = Math.round(innerHeight * dpr);
  const k = Math.min(1, 1440 / Math.max(w, h));
  canvas.width = Math.round(w * k / 2) * 2; canvas.height = Math.round(h * k / 2) * 2;
  escala = canvas.width / innerWidth;
}

async function empezar() {
  if (empezar.yendo) return; empezar.yendo = true;
  try {
    A.clave = $('#clave').value.trim() || A.clave; guardarA();
    if (!prueba) {
      if (!A.clave) throw new Error('falta tu clave de la API de Anthropic');
      avisar('comprobando la clave…');
      modelos = await elegirModelos(A.clave);
    } else modelos = { rapido: 'prueba', bueno: 'prueba' };
    avisar('pidiendo la cámara…');
    await camara.abrir();
    if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(() => {});
    $('#ov').hidden = true; $('#mandos').hidden = false; avisar('');
    actual = 'mirando…';
    requestAnimationFrame(bucle); escribir();
  } catch (e) { avisar(e.name === 'NotAllowedError' ? 'sin permiso para la cámara' : 'error: ' + (e.message || e)); empezar.yendo = false; }
}

async function alternarGrabacion() {
  const b = $('#grabar');
  try {
    if (!grabadora.grabando) { await grabadora.empezar(A.micro); b.classList.add('activo'); $('#tiempo').hidden = false; }
    else {
      const r = await grabadora.parar(); b.classList.remove('activo'); $('#tiempo').hidden = true;
      const v = $('#revisar video'); v.src = URL.createObjectURL(r.blob); $('#revisar').hidden = false;
      $('#guardar').onclick = async () => { const s = await guardar(r); $('#nota').textContent = s === 'compartido' ? 'enviado' : s === 'descargado' ? 'guardado en descargas' : ''; };
      $('#descartar').onclick = () => { URL.revokeObjectURL(v.src); v.removeAttribute('src'); $('#revisar').hidden = true; $('#nota').textContent = ''; };
    }
  } catch (e) { avisar('no se puede grabar: ' + (e.message || e)); }
}

// ——— mandos ———
dimensionar(); addEventListener('resize', dimensionar);
$('#version').textContent = VERSION;
$('#clave').value = A.clave; if (A.clave) $('#clave').placeholder = 'clave guardada';
$('#tono').value = A.tono; $('#voz').value = A.voz; $('#modelo').value = A.modelo; $('#micro').checked = A.micro; $('#ver').checked = A.ver; $('#st').hidden = !A.ver;
$('#empezar').onclick = empezar;
// pegar la clave del portapapeles con un toque (y si ya es una clave, empezar directamente)
$('#pegar').onclick = async () => {
  try { const t = (await navigator.clipboard.readText()).trim(); if (!t.startsWith('sk-')) { avisar('lo copiado no parece una clave (empieza por sk-ant-)'); return; } $('#clave').value = t; empezar(); }
  catch (e) { avisar('no puedo leer el portapapeles: pega la clave a mano en el recuadro'); }
};
// también vale abrir la página con la clave tras #clave= (se guarda y se borra de la dirección)
if (location.hash.startsWith('#clave=')) { A.clave = decodeURIComponent(location.hash.slice(7)); guardarA(); history.replaceState(null, '', location.pathname + location.search); $('#clave').value = A.clave; }
$('#grabar').onclick = alternarGrabacion;
$('#girar').onclick = () => camara.girar();
$('#ajustes-boton').onclick = () => { $('#cfgP').hidden = !$('#cfgP').hidden; };
const cambio = () => { A.tono = $('#tono').value; A.voz = $('#voz').value.trim(); A.modelo = $('#modelo').value; A.micro = $('#micro').checked; A.ver = $('#ver').checked; $('#st').hidden = !A.ver; guardarA(); };
['#tono', '#modelo', '#micro', '#ver'].forEach((s) => { $(s).onchange = cambio; });
$('#voz').onchange = cambio;
$('#olvidar').onclick = () => { A.clave = ''; guardarA(); $('#clave').value = ''; avisar('clave borrada de este móvil'); };
if (!window.isSecureContext) avisar('hace falta abrir esta página con https:// para usar la cámara');
