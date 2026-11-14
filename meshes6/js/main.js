// main.js — Meshes v0.6 · MODO CONTINUO: la película no se para y construye el mundo mientras la recorres.
//  · Cada mapa de profundidad nuevo (2 por segundo) solidifica el fotograma delante de ti, desde donde miras
//    (piezas.js, en un trabajador en paralelo: obrero.js), con su suelo, sus figuras con volumen y su fondo.
//  · La pieza más reciente está VIVA: lleva la película en movimiento como textura.
//  · Si te quedas quieto, la pieza viva se sustituye por la nueva: la película se mueve en 3D delante de ti.
//  · Si te has movido, la pieza viva se congela (con su propio fotograma) y se queda donde estaba: avanzando,
//    las figuras se repiten una detrás de otra, en fila, como una cronofotografía, y entre ellas el espacio
//    del plano se puede recorrer en profundidad.
//  · En cada corte de plano (y al saltar con la rueda), el datamosh arrastra el plano anterior sobre el nuevo.
//    Fuera de los cortes, un datamosh de fondo según el nivel (1–5); el vacío se apaga poco a poco hacia negro.
//  · Se camina libremente: nada cierra el paso. Se guardan los últimos MAX fotogramas.
import { Render } from './render.js';
import { Pelicula } from './pelicula.js';
import { Profundidad } from './profundidad.js';
import { Control } from './control.js';
import { Solidificador } from './solidificador.js';
import { perspectiva, mult, camMundo, inversaRigida } from './mates.js';

const $ = (s) => document.querySelector(s);
const Q = new URLSearchParams(location.search);
const ASPECTO = 1024 / 720, TAN_Y = Math.tan((44 / 2) * Math.PI / 180), TAN = [TAN_Y * ASPECTO, TAN_Y];
const VERSION = 'v0.6';
const CRUDO = Q.has('crudo');                       // ?crudo: el mundo sin datamosh
const MAX = +(Q.get('max') || 70);                  // fotogramas que se guardan en el espacio
const [RW, RH] = (Q.get('res') || '192x135').split('x').map(Number); // rejilla de solidificación
const PASO = 0.35;                                  // moverse más que esto deja la copia en su sitio
const NIVELES = [0.6, 0.3, 0.12, 0.04, 0.008];
const LIBRE = { libre: () => true, altura: () => 1.6 };
const lienzo = $('#lienzo'), gl = lienzo.getContext('webgl2', { antialias: false, alpha: false });
let render, peli, prof, control, solid, estado = 'portada', piezas = [], viva = null, ancla = [0, 1.6, 0], ultimoPedido = -1, recortar = false, vpAntes = null;
let nivel = 1, transicion = -1e9, antes = performance.now(), fps = 60, aviso = '', avisoHasta = 0, generacion = 0;

function avisar(t) { $('#estado').textContent = t; }
function decir(t, s = 3) { aviso = t; avisoHasta = performance.now() + s * 1000; }
addEventListener('error', (e) => avisar('error: ' + e.message));
addEventListener('unhandledrejection', (e) => avisar('error: ' + (e.reason && e.reason.message || e.reason)));

function dimensionar() {
  const dpr = Math.min(devicePixelRatio || 1, 1.5);
  let w = innerWidth, h = innerHeight; if (w / h > ASPECTO) w = h * ASPECTO; else h = w / ASPECTO;
  lienzo.style.width = w + 'px'; lienzo.style.height = h + 'px';
  lienzo.width = Math.round(Math.min(1600, w * dpr)); lienzo.height = Math.round(lienzo.width / ASPECTO);
  render.tam(lienzo.width, lienzo.height);
}
const proyeccion = () => perspectiva(TAN_Y, ASPECTO, 0.05, 400);
function camara() { const cm = camMundo(control.pos, control.yaw, control.pitch); return { cm, vp: mult(proyeccion(), inversaRigida(cm)) }; }
const hayCorte = (a, b) => { if (Math.abs(a - b) > 8) return true; for (let k = Math.min(a, b) + 1; k <= Math.max(a, b); k++) if (prof.cortes.has(k)) return true; return false; };

// pedir al trabajador que solidifique el mapa i desde donde miras ahora
function pedir(i) {
  const { cm } = camara(), foto = peli.copiaPequena(), gen = generacion;
  solid.pedir(prof.mapa(i, RW, RH), RW, RH, cm, TAN).then((m) => {
    if (gen !== generacion) { gl.deleteTexture(foto); return; } // el mundo se borró mientras tanto
    colocar(m, cm, foto, i);
  });
}
// colocar la pieza nueva: sustituye a la viva (si no te has movido) o la congela y se suma (si te has movido)
function colocar(m, cm, foto, i) {
  const p = { ...render.pieza(m), copia: foto, foto, vp: mult(proyeccion(), inversaRigida(cm)), cam: [cm[12], cm[13], cm[14]], i, viva: true };
  if (viva) {
    if (hayCorte(viva.i, i)) transicion = performance.now();
    // la viva se queda en el espacio si está a más de PASO de la última que se quedó (así avanzar despacio
    // también deja su fila de figuras)
    const movido = Math.hypot(viva.cam[0] - ancla[0], viva.cam[2] - ancla[2]) > PASO;
    if (movido) { viva.viva = false; ancla = viva.cam; }
    else { piezas.splice(piezas.indexOf(viva), 1); quitar(viva); }
  }
  piezas.push(p); viva = p;
  while (piezas.length > MAX) quitar(piezas.shift());
}
function quitar(p) { render.borrar(p); gl.deleteTexture(p.copia); }

const tiempo = (t) => `${(t / 60) | 0}:${String((t % 60) | 0).padStart(2, '0')}`;
const rampa = (desde, ms = 1400) => Math.min(1, (performance.now() - desde) / ms) ** 2;

function bucle(ahora) {
  const dt = Math.min(0.05, (ahora - antes) / 1000); antes = ahora; fps = fps * 0.95 + (1 / Math.max(dt, 1e-3)) * 0.05;
  peli.actualizar();
  control.paso(dt, LIBRE);
  // cada mapa de profundidad nuevo se solidifica (si el trabajador está libre; si no, en cuanto lo esté)
  const i = prof.indice(peli.t);
  if (i !== ultimoPedido && !solid.ocupado) { ultimoPedido = i; pedir(i); }
  // la pieza viva lleva la película en movimiento; las congeladas, su propio fotograma
  for (const p of piezas) p.foto = p.viva ? peli.tex : p.copia;
  const { vp } = camara(), r = rampa(transicion), L = Math.min(1, NIVELES[nivel] + 0.3);
  const limpio = CRUDO ? 1 : r * L, apagar = CRUDO ? 0 : 0.92;
  render.mundo(piezas, recortar, vp, vpAntes || vp, ahora / 1000, limpio, apagar);
  vpAntes = vp;
  // reproductor y avisos
  $('#barra-dentro').style.width = (100 * peli.t / (peli.duracion || 1)) + '%';
  $('#t').textContent = `${tiempo(peli.t)} / ${tiempo(peli.duracion || 0)} ${peli.v.paused ? '❚❚' : '▶'}`;
  $('#hud').textContent = `${VERSION} · ${piezas.length} fotogramas en el espacio${recortar ? ' · recorte Viewfinder' : ''} · datamosh ${NIVELES.length - nivel}/5 · ${fps.toFixed(0)} fps`;
  $('#aviso').textContent = performance.now() < avisoHasta ? aviso : '';
  requestAnimationFrame(bucle);
}

async function empezar(archivo) {
  try {
    avisar('cargando la película…');
    render = new Render(gl); peli = new Pelicula(gl); prof = new Profundidad(); control = new Control(lienzo); solid = new Solidificador();
    await peli.cargar(archivo);
    avisar('cargando los mapas de profundidad…');
    await prof.cargar(gl, 'profundidad/');
    if (Math.abs(peli.duracion - prof.meta.duracion) > 3) avisar('aviso: esta película no dura lo mismo que la de los mapas de profundidad');
    dimensionar(); addEventListener('resize', dimensionar);
    $('#ov').hidden = true; $('#hud').hidden = false; $('#ayuda').hidden = false; $('#reproductor').hidden = false;
    await peli.v.play(); peli.actualizar();
    estado = 'mundo'; transicion = performance.now(); requestAnimationFrame(bucle);
    decir('la película construye el espacio mientras la ves · camina hacia dentro (WASD) · clic para mirar con el ratón', 6);
  } catch (e) { avisar('error: ' + (e.message || e)); }
}

function borrarMundo() { generacion++; piezas.forEach(quitar); piezas = []; viva = null; ancla = [0, 1.6, 0]; ultimoPedido = -1; control.pos = [0, 1.6, 0]; control.yaw = control.pitch = 0; transicion = performance.now(); }

addEventListener('keydown', (e) => {
  if (!render || estado === 'portada') return;
  if (e.code === 'Space') { e.preventDefault(); if (peli.v.paused) peli.v.play(); else peli.v.pause(); }
  if (e.code === 'KeyZ') peli.v.currentTime = Math.max(0, peli.t - 5);
  if (e.code === 'KeyX') peli.v.currentTime = Math.min(peli.duracion - 0.1, peli.t + 5);
  if (e.code.startsWith('Digit')) { const n = +e.code.slice(5); if (n >= 1 && n <= 5) nivel = 5 - n; }
  if (e.code === 'KeyV') { recortar = !recortar; decir(recortar ? 'recorte Viewfinder: cada fotograma nuevo borra lo que tapa' : 'sin recorte: todo se acumula'); }
  if (e.code === 'KeyR') { borrarMundo(); decir('mundo borrado'); }
  if (e.code === 'KeyH') $('#ayuda').hidden = !$('#ayuda').hidden;
});
addEventListener('wheel', (e) => {
  if (!render || estado === 'portada') return;
  e.preventDefault();
  peli.v.currentTime = Math.min(peli.duracion - 0.1, Math.max(0, peli.t + e.deltaY * 0.01));
}, { passive: false });
$('#barra').addEventListener('click', (e) => { const r = e.currentTarget.getBoundingClientRect(); peli.v.currentTime = peli.duracion * (e.clientX - r.left) / r.width; });
$('#elegir').onclick = () => $('#archivo').click();
$('#archivo').onchange = (e) => { if (e.target.files[0]) empezar(e.target.files[0]); };
window.MESHES = { get piezas() { return piezas; }, get control() { return control; }, get peli() { return peli; }, get solid() { return solid; } };
