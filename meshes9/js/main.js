// main.js — Meshes v0.9 · CALEIDOSCOPIO (a partir de «Let Forever Be», Michel Gondry, 1999).
//  · La película se reproduce sin parar. Cada mapa de profundidad (2 por segundo) se convierte en un modelo tipo
//    Viewfinder (piezas.js, en paralelo en obrero.js): fondo (suelo + relieve) y figuras separadas.
//  · CALEIDOSCOPIO: el fotograma cubre unos 60° de mirada; seis copias alrededor de un centro, alternando con su
//    reflejo, cierran los 360° sin costuras (como los espejos de un caleidoscopio). Se camina por dentro.
//  · ECO: en cada sector, la figura va con un retraso más que en el anterior: el movimiento da la vuelta a tu
//    alrededor, como las bailarinas multiplicadas de Gondry (y de Busby Berkeley).
//  · Cada plano de la película construye su caleidoscopio una vez, centrado donde estás al empezar el plano, y
//    se queda quieto mientras dura (la película sigue moviéndose dentro). En cada corte, el plano siguiente se
//    construye alrededor de donde estés, con datamosh entre uno y otro.
import { Render } from './render.js';
import { Pelicula } from './pelicula.js';
import { Profundidad } from './profundidad.js';
import { Control } from './control.js';
import { Solidificador } from './solidificador.js';
import { perspectiva, mult, camMundo, inversaRigida } from './mates.js';

const $ = (s) => document.querySelector(s);
const Q = new URLSearchParams(location.search);
const ASPECTO = 1024 / 720, TAN_Y = Math.tan((44 / 2) * Math.PI / 180), TAN = [TAN_Y * ASPECTO, TAN_Y];
const VERSION = 'v0.9';
const CRUDO = Q.has('crudo');                       // ?crudo: sin datamosh
const RITMO = +(Q.get('ritmo') || 10);              // instantáneas de la figura por segundo (para los ecos)
const SECTORES = [6, 12, 4, 2];                     // copias alrededor (6 = cierra los 360° sin costuras)
const [RW, RH] = (Q.get('res') || '192x135').split('x').map(Number);
const NIVELES = [0.6, 0.3, 0.12, 0.04, 0.008];
const LIBRE = { libre: () => true, altura: () => 1.6 };
const lienzo = $('#lienzo'), gl = lienzo.getContext('webgl2', { antialias: false, alpha: false });
let render, peli, prof, control, solid, estado = 'portada', vpAntes = null;
let actual = null, historia = [], ultimoPedido = -1, ultimaCopia = 0, eco = +(Q.get('eco') || 0.25), sector = 0, plano = null;
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

// las mallas se comparten: el modelo actual y las instantáneas que salieron de él (se borra cuando nadie lo usa)
const soltar = (g) => { if (--g.usos <= 0) render.borrar(g); };

// el plano: centro y orientación del caleidoscopio (la cámara desde la que se construye)
function nuevoPlano() { const cm = camara().cm; plano = { cm, C: [cm[12], cm[13], cm[14]], r: (() => { const l = Math.hypot(cm[0], cm[2]) || 1; return [cm[0] / l, cm[2] / l]; })() }; }
// matriz del sector s de n: girar s·360/n grados alrededor del eje vertical del centro; los impares, reflejados
// (así cada borde casa con el borde igual del vecino, como en un caleidoscopio)
function sectorMatriz(p, s, n) {
  const a = s * 2 * Math.PI / n, c = Math.cos(a), si = Math.sin(a);
  let M = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  if (n % 2 === 0 && s % 2 === 1) { const [rx, rz] = p.r; M = [[1 - 2 * rx * rx, 0, -2 * rx * rz], [0, 1, 0], [-2 * rx * rz, 0, 1 - 2 * rz * rz]]; }
  const R = [[c, 0, si], [0, 1, 0], [-si, 0, c]], A = R.map((f) => [0, 1, 2].map((j) => f[0] * M[0][j] + f[1] * M[1][j] + f[2] * M[2][j]));
  const t = [0, 1, 2].map((k) => p.C[k] - (A[k][0] * p.C[0] + A[k][1] * p.C[1] + A[k][2] * p.C[2]));
  return new Float32Array([A[0][0], A[1][0], A[2][0], 0, A[0][1], A[1][1], A[2][1], 0, A[0][2], A[1][2], A[2][2], 0, t[0], t[1], t[2], 1]);
}

// pedir al trabajador el modelo del mapa i, desde el centro del plano (en un corte, el plano nuevo se centra aquí)
function pedir(i) {
  const corte = !plano || hayCorte(ultimoPedido, i);
  if (corte) nuevoPlano();
  const p = plano, gen = generacion;
  solid.pedir(prof.mapa(i, RW, RH), RW, RH, p.cm, TAN).then((m) => {
    if (gen !== generacion) return;
    const g = render.pieza(m); g.usos = 1; g.plano = p;
    if (actual) soltar(actual);
    actual = g;
    if (corte) transicion = performance.now();
  });
}
// instantánea de la figura actual (su malla y el fotograma de este momento), para los ecos
function instantanea(ahora) {
  if (!actual) return;
  actual.usos++;
  historia.push({ g: actual, foto: peli.copiaPequena(512, 288), t: ahora });
  const limite = ahora - (12 * eco + 1) * 1000;
  while (historia.length && historia[0].t < limite) { const h = historia.shift(); soltar(h.g); gl.deleteTexture(h.foto); }
}
// la instantánea con la edad más cercana a «edad» segundos
function haceTanto(ahora, edad) {
  let mejor = null, d = 1e9;
  for (const h of historia) { const e = Math.abs((ahora - h.t) / 1000 - edad); if (e < d) { d = e; mejor = h; } }
  return mejor;
}

const tiempo = (t) => `${(t / 60) | 0}:${String((t % 60) | 0).padStart(2, '0')}`;
const rampa = (desde, ms = 1400) => Math.min(1, (performance.now() - desde) / ms) ** 2;

function bucle(ahora) {
  const dt = Math.min(0.05, (ahora - antes) / 1000); antes = ahora; fps = fps * 0.95 + (1 / Math.max(dt, 1e-3)) * 0.05;
  peli.actualizar();
  control.paso(dt, LIBRE);
  const i = prof.indice(peli.t);
  if (i !== ultimoPedido && !solid.ocupado) { pedir(i); ultimoPedido = i; }
  if (!peli.v.paused && ahora - ultimaCopia > 1000 / RITMO) { ultimaCopia = ahora; instantanea(ahora); }
  // el caleidoscopio: n sectores del fondo actual y, en cada uno, la figura con su retraso
  const capas = { suelos: [], fondos: [], figuras: [] }, n = SECTORES[sector];
  if (actual) for (let s = 0; s < n; s++) {
    const M = sectorMatriz(actual.plano, s, n);
    capas.suelos.push({ vao: actual.vao, foto: peli.tex, desde: 0, hasta: actual.nSuelo, modelo: M });
    capas.fondos.push({ vao: actual.vao, foto: peli.tex, desde: actual.nSuelo, hasta: actual.nFig, modelo: M });
    const h = s > 0 && !peli.v.paused ? haceTanto(ahora, s * eco) : null, g = h ? h.g : actual;
    capas.figuras.push({ vao: g.vao, foto: h ? h.foto : peli.tex, desde: g.nFig, hasta: g.n, modelo: sectorMatriz(g.plano, s, n) });
  }
  const { vp } = camara(), r = rampa(transicion), L = Math.min(1, NIVELES[nivel] + 0.3);
  render.mundo(capas, vp, vpAntes || vp, ahora / 1000, CRUDO ? 1 : r * L, CRUDO ? 0 : 0.92);
  vpAntes = vp;
  $('#barra-dentro').style.width = (100 * peli.t / (peli.duracion || 1)) + '%';
  $('#t').textContent = `${tiempo(peli.t)} / ${tiempo(peli.duracion || 0)} ${peli.v.paused ? '❚❚' : '▶'}`;
  $('#hud').textContent = `${VERSION} · caleidoscopio ${SECTORES[sector]} · eco ${eco.toFixed(2)} s · datamosh ${NIVELES.length - nivel}/5 · ${fps.toFixed(0)} fps`;
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
    decir('estás dentro del caleidoscopio · camina (WASD) y mira alrededor · clic para mirar con el ratón', 6);
  } catch (e) { avisar('error: ' + (e.message || e)); }
}



addEventListener('keydown', (e) => {
  if (!render || estado === 'portada') return;
  if (e.code === 'Space') { e.preventDefault(); if (peli.v.paused) peli.v.play(); else peli.v.pause(); }
  if (e.code === 'KeyZ') peli.v.currentTime = Math.max(0, peli.t - 5);
  if (e.code === 'KeyX') peli.v.currentTime = Math.min(peli.duracion - 0.1, peli.t + 5);
  if (e.code === 'KeyQ') eco = Math.max(0.05, eco / 1.3);
  if (e.code === 'KeyE') eco = Math.min(2, eco * 1.3);
  if (e.code === 'KeyK') { sector = (sector + 1) % SECTORES.length; decir(SECTORES[sector] + ' sectores'); }
  if (e.code.startsWith('Digit')) { const n = +e.code.slice(5); if (n >= 1 && n <= 5) nivel = 5 - n; }
  if (e.code === 'KeyR') { plano = null; ultimoPedido = -1; decir('el caleidoscopio se vuelve a centrar donde estás'); }
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
window.MESHES = { get historia() { return historia; }, get control() { return control; }, get peli() { return peli; }, get solid() { return solid; } };
