// main.js — Meshes v0.8 · FIGURAS EN FUGA.
//  · La película se reproduce sin parar. Cada mapa de profundidad (2 por segundo) se convierte en un modelo tipo
//    Viewfinder, desde donde miras: fondo (suelo + relieve) y figuras sólidas separadas del fondo (piezas.js, en
//    paralelo en obrero.js).
//  · FONDO: siempre el fotograma actual, a tu alrededor, con la película en movimiento como textura.
//  · FIGURAS: la figura actual está en su sitio, encajada en el fondo. Varias veces por segundo se hace una copia
//    de la figura (con el fotograma de ese instante) que se aleja en fuga hacia donde estás mirando en ese
//    momento: las copias forman una estela que se va hacia el punto de fuga. Si giras la mirada, las copias
//    nuevas se van hacia la nueva dirección y las viejas siguen su camino: la estela se curva.
//  · Datamosh: en los cortes de plano (y al saltar con la rueda) arrastra un plano sobre el otro; el nivel (1–5)
//    decide cuánto queda después.
import { Render } from './render.js';
import { Pelicula } from './pelicula.js';
import { Profundidad } from './profundidad.js';
import { Control } from './control.js';
import { Solidificador } from './solidificador.js';
import { perspectiva, mult, camMundo, inversaRigida } from './mates.js';

const $ = (s) => document.querySelector(s);
const Q = new URLSearchParams(location.search);
const ASPECTO = 1024 / 720, TAN_Y = Math.tan((44 / 2) * Math.PI / 180), TAN = [TAN_Y * ASPECTO, TAN_Y];
const VERSION = 'v0.8';
const CRUDO = Q.has('crudo');                       // ?crudo: sin datamosh
const MAX = +(Q.get('max') || 90);                  // copias de figura en la estela
const RITMO = +(Q.get('ritmo') || 6);               // copias por segundo
const [RW, RH] = (Q.get('res') || '192x135').split('x').map(Number);
const NIVELES = [0.6, 0.3, 0.12, 0.04, 0.008];
const LIBRE = { libre: () => true, altura: () => 1.6 };
const lienzo = $('#lienzo'), gl = lienzo.getContext('webgl2', { antialias: false, alpha: false });
let render, peli, prof, control, solid, estado = 'portada', vpAntes = null;
let actual = null, copias = [], ultimoPedido = -1, ultimaCopia = 0, velocidad = +(Q.get('vel') || 4);
let nivel = 0, transicion = -1e9, antes = performance.now(), fps = 60, aviso = '', avisoHasta = 0, generacion = 0;

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
const hayCorte = (a, b) => { if (a < 0) return false; if (Math.abs(a - b) > 8) return true; for (let k = Math.min(a, b) + 1; k <= Math.max(a, b); k++) if (prof.cortes.has(k)) return true; return false; };

// las mallas se comparten: el modelo actual y las copias que salieron de él (se borra cuando nadie lo usa)
const soltar = (g) => { if (--g.usos <= 0) render.borrar(g); };

// pedir al trabajador el modelo del mapa i, desde donde miras ahora
function pedir(i) {
  const { cm } = camara(), gen = generacion, corte = hayCorte(ultimoPedido, i);
  solid.pedir(prof.mapa(i, RW, RH), RW, RH, cm, TAN).then((m) => {
    if (gen !== generacion) return;
    const g = render.pieza(m); g.usos = 1;
    if (actual) soltar(actual);
    actual = g;
    if (corte) transicion = performance.now();
  });
}
// una copia de la figura actual, con el fotograma de este instante, que se va en fuga hacia donde miras
function copiar() {
  if (!actual || actual.n <= actual.nFig) return;
  const cm = camara().cm, dir = [-cm[8], -cm[9], -cm[10]];
  actual.usos++;
  copias.push({ g: actual, foto: peli.copiaPequena(512, 288), dir, desp: [0, 0, 0] });
  while (copias.length > MAX) { const c = copias.shift(); soltar(c.g); gl.deleteTexture(c.foto); }
}

const tiempo = (t) => `${(t / 60) | 0}:${String((t % 60) | 0).padStart(2, '0')}`;
const rampa = (desde, ms = 1400) => Math.min(1, (performance.now() - desde) / ms) ** 2;

function bucle(ahora) {
  const dt = Math.min(0.05, (ahora - antes) / 1000); antes = ahora; fps = fps * 0.95 + (1 / Math.max(dt, 1e-3)) * 0.05;
  peli.actualizar();
  control.paso(dt, LIBRE);
  const i = prof.indice(peli.t);
  if (i !== ultimoPedido && !solid.ocupado) { pedir(i); ultimoPedido = i; }
  // copias a RITMO por segundo mientras la película avanza
  if (!peli.v.paused && ahora - ultimaCopia > 1000 / RITMO) { ultimaCopia = ahora; copiar(); }
  // las copias se alejan, cada una en su dirección
  for (const c of copias) for (let k = 0; k < 3; k++) c.desp[k] += c.dir[k] * velocidad * dt;
  // lo que se dibuja: el fondo actual, la figura actual en su sitio y la estela de copias
  const capas = { suelos: [], fondos: [], figuras: [] };
  if (actual) {
    capas.suelos.push({ vao: actual.vao, foto: peli.tex, desde: 0, hasta: actual.nSuelo });
    capas.fondos.push({ vao: actual.vao, foto: peli.tex, desde: actual.nSuelo, hasta: actual.nFig });
    capas.figuras.push({ vao: actual.vao, foto: peli.tex, desde: actual.nFig, hasta: actual.n });
  }
  for (const c of copias) capas.figuras.push({ vao: c.g.vao, foto: c.foto, desde: c.g.nFig, hasta: c.g.n, desp: c.desp });
  const { vp } = camara(), r = rampa(transicion), L = Math.min(1, NIVELES[nivel] + 0.3);
  render.mundo(capas, vp, vpAntes || vp, ahora / 1000, CRUDO ? 1 : r * L, CRUDO ? 0 : 0.92);
  vpAntes = vp;
  $('#barra-dentro').style.width = (100 * peli.t / (peli.duracion || 1)) + '%';
  $('#t').textContent = `${tiempo(peli.t)} / ${tiempo(peli.duracion || 0)} ${peli.v.paused ? '❚❚' : '▶'}`;
  $('#hud').textContent = `${VERSION} · ${copias.length} figuras en fuga · velocidad ${velocidad.toFixed(1)} · datamosh ${NIVELES.length - nivel}/5 · ${fps.toFixed(0)} fps`;
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
    decir('las figuras se van en fuga hacia donde miras · clic para mirar con el ratón', 6);
  } catch (e) { avisar('error: ' + (e.message || e)); }
}

function borrarEstela() { for (const c of copias) { soltar(c.g); gl.deleteTexture(c.foto); } copias = []; }

addEventListener('keydown', (e) => {
  if (!render || estado === 'portada') return;
  if (e.code === 'Space') { e.preventDefault(); if (peli.v.paused) peli.v.play(); else peli.v.pause(); }
  if (e.code === 'KeyZ') peli.v.currentTime = Math.max(0, peli.t - 5);
  if (e.code === 'KeyX') peli.v.currentTime = Math.min(peli.duracion - 0.1, peli.t + 5);
  if (e.code === 'KeyQ') velocidad = Math.max(0.3, velocidad / 1.3);
  if (e.code === 'KeyE') velocidad = Math.min(40, velocidad * 1.3);
  if (e.code.startsWith('Digit')) { const n = +e.code.slice(5); if (n >= 1 && n <= 5) nivel = 5 - n; }
  if (e.code === 'KeyR') { borrarEstela(); decir('estela borrada'); }
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
window.MESHES = { get copias() { return copias; }, get control() { return control; }, get peli() { return peli; }, get solid() { return solid; } };
