// main.js — Meshes v0.7 · MODO CONTINUO, FIGURA Y FONDO: la película no se para y abre espacio delante de ti.
//  · FONDO: cada plano de la película construye su espacio una vez, quieto en el mundo, desde donde miras al
//    empezar el plano. Mientras dura el plano, ese espacio se sigue moviendo con la película (la profundidad y la
//    imagen se renuevan en su sitio), pero no se desplaza contigo: al avanzar, entras en su profundidad.
//    En cada corte de plano se abre el espacio del plano nuevo delante de ti (recorte Viewfinder: lo recorta de
//    los anteriores) con un datamosh que arrastra un plano sobre el otro.
//  · FIGURA: lo que se separa del fondo (la mujer, la flor, las manos) se repite en fila. Al avanzar, cada copia
//    se coloca por delante de la anterior (el doble de lo que has avanzado desde el inicio del plano): la fila se
//    forma delante de ti, hacia el fondo, y caminas entre las figuras que deja la película. Quieto, la figura
//    sigue encajada en su plano.
//  · La solidificación (piezas.js) se hace en paralelo (obrero.js), 2 veces por segundo (un mapa de profundidad).
import { Render } from './render.js';
import { Pelicula } from './pelicula.js';
import { Profundidad } from './profundidad.js';
import { Control } from './control.js';
import { Solidificador } from './solidificador.js';
import { perspectiva, mult, camMundo, inversaRigida } from './mates.js';

const $ = (s) => document.querySelector(s);
const Q = new URLSearchParams(location.search);
const ASPECTO = 1024 / 720, TAN_Y = Math.tan((44 / 2) * Math.PI / 180), TAN = [TAN_Y * ASPECTO, TAN_Y];
const VERSION = 'v0.7';
const ADELANTE = 2;                                 // la fila avanza el doble que tú
const MAX_FONDOS = 6;                               // planos que se guardan
const CRUDO = Q.has('crudo');                       // ?crudo: el mundo sin datamosh
const MAX = +(Q.get('max') || 60);                  // figuras que se guardan en la fila
const [RW, RH] = (Q.get('res') || '192x135').split('x').map(Number); // rejilla de solidificación
const PASO = 0.35;                                  // moverse más que esto deja la copia en su sitio
const NIVELES = [0.6, 0.3, 0.12, 0.04, 0.008];
const LIBRE = { libre: () => true, altura: () => 1.6 };
const lienzo = $('#lienzo'), gl = lienzo.getContext('webgl2', { antialias: false, alpha: false });
let render, peli, prof, control, solid, estado = 'portada', piezas = [], viva = null, ancla = [0, 0, 0], ultimoPedido = -1, recortar = true, vpAntes = null;
let plano = null, numPlano = 0, indicePlano = -1;
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

// pedir al trabajador que solidifique el mapa i; en un corte de plano (o al empezar), el plano nuevo se construye
// desde donde miras ahora; dentro del mismo plano, siempre desde la misma cámara (el espacio se queda quieto)
function pedir(i) {
  let nuevo = false;
  if (!plano || hayCorte(indicePlano, i)) { plano = { cm: camara().cm, pos: control.pos.slice(), id: ++numPlano }; nuevo = true; }
  indicePlano = i;
  const p0 = plano, foto = peli.copiaPequena(), gen = generacion;
  solid.pedir(prof.mapa(i, RW, RH), RW, RH, p0.cm, TAN).then((m) => {
    if (gen !== generacion) { gl.deleteTexture(foto); return; } // el mundo se borró mientras tanto
    colocar(m, p0, foto, nuevo);
  });
}
// desplazamiento de la figura: el doble de lo que has avanzado desde que empezó el plano (solo en horizontal)
const desplazamiento = (p0) => [(control.pos[0] - p0.pos[0]) * ADELANTE, 0, (control.pos[2] - p0.pos[2]) * ADELANTE];
// colocar la pieza nueva (fondo vivo + figura viva) y decidir qué queda de la anterior
function colocar(m, p0, foto, nuevo) {
  const p = { ...render.pieza(m), copia: foto, vp: mult(proyeccion(), inversaRigida(p0.cm)), plano: p0.id, p0, fondo: 'vivo', figura: 'viva', desp: desplazamiento(p0) };
  if (viva) {
    // fondo: en un corte, el del plano anterior se queda; dentro del plano, el nuevo lo sustituye
    viva.fondo = nuevo ? 'fijo' : null;
    // figura: se queda en la fila (donde se veía en ese momento) si está a más de PASO de la última que se quedó
    viva.desp = desplazamiento(viva.p0);
    const dejar = Math.hypot(viva.desp[0] - ancla[0], viva.desp[2] - ancla[2]) > PASO;
    viva.figura = dejar ? 'fija' : null; if (dejar) ancla = viva.desp;
    if (nuevo) { ancla = [0, 0, 0]; transicion = performance.now(); }
    if (!viva.fondo && !viva.figura) { piezas.splice(piezas.indexOf(viva), 1); quitar(viva); }
  }
  piezas.push(p); viva = p;
  // límites: los planos más antiguos pierden su fondo; las figuras más antiguas salen de la fila
  const fondos = piezas.filter((q) => q.fondo === 'fijo'); while (fondos.length > MAX_FONDOS) fondos.shift().fondo = null;
  const figuras = piezas.filter((q) => q.figura === 'fija'); while (figuras.length > MAX) figuras.shift().figura = null;
  for (const q of piezas.filter((q) => !q.fondo && !q.figura)) { piezas.splice(piezas.indexOf(q), 1); quitar(q); }
}
function quitar(p) { render.borrar(p); gl.deleteTexture(p.copia); }
// lo que se dibuja este fotograma: suelos, fondos (recortados por los planos más nuevos) y figuras
function capas() {
  const suelos = [], fondos = [], figuras = [], conFondo = piezas.filter((p) => p.fondo);
  for (const p of piezas) {
    const foto = p === viva ? peli.tex : p.copia;
    if (p.fondo) {
      const nuevas = recortar ? conFondo.filter((q) => q.plano > p.plano).slice(0, 5).map((q) => q.vp) : [];
      suelos.push({ vao: p.vao, foto, desde: 0, hasta: p.nSuelo, nuevas });
      fondos.push({ vao: p.vao, foto, desde: p.nSuelo, hasta: p.nFig, nuevas });
    }
    if (p.figura) figuras.push({ vao: p.vao, foto, desde: p.nFig, hasta: p.n, desp: p === viva ? desplazamiento(p.p0) : p.desp });
  }
  return { suelos, fondos, figuras };
}

const tiempo = (t) => `${(t / 60) | 0}:${String((t % 60) | 0).padStart(2, '0')}`;
const rampa = (desde, ms = 1400) => Math.min(1, (performance.now() - desde) / ms) ** 2;

function bucle(ahora) {
  const dt = Math.min(0.05, (ahora - antes) / 1000); antes = ahora; fps = fps * 0.95 + (1 / Math.max(dt, 1e-3)) * 0.05;
  peli.actualizar();
  control.paso(dt, LIBRE);
  // cada mapa de profundidad nuevo se solidifica (si el trabajador está libre; si no, en cuanto lo esté)
  const i = prof.indice(peli.t);
  if (i !== ultimoPedido && !solid.ocupado) { ultimoPedido = i; pedir(i); }
  const { vp } = camara(), r = rampa(transicion), L = Math.min(1, NIVELES[nivel] + 0.3);
  const limpio = CRUDO ? 1 : r * L, apagar = CRUDO ? 0 : 0.92;
  render.mundo(capas(), vp, vpAntes || vp, ahora / 1000, limpio, apagar);
  vpAntes = vp;
  // reproductor y avisos
  $('#barra-dentro').style.width = (100 * peli.t / (peli.duracion || 1)) + '%';
  $('#t').textContent = `${tiempo(peli.t)} / ${tiempo(peli.duracion || 0)} ${peli.v.paused ? '❚❚' : '▶'}`;
  $('#hud').textContent = `${VERSION} · plano ${numPlano} · ${piezas.filter((p) => p.figura === 'fija').length} figuras en fila${recortar ? '' : ' · sin recorte'} · datamosh ${NIVELES.length - nivel}/5 · ${fps.toFixed(0)} fps`;
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
    decir('camina hacia dentro (WASD): la película abre su espacio delante de ti y deja sus figuras en fila · clic para mirar con el ratón', 6);
  } catch (e) { avisar('error: ' + (e.message || e)); }
}

function borrarMundo() { generacion++; piezas.forEach(quitar); piezas = []; viva = null; ancla = [0, 0, 0]; ultimoPedido = -1; plano = null; indicePlano = -1; control.pos = [0, 1.6, 0]; control.yaw = control.pitch = 0; transicion = performance.now(); }

addEventListener('keydown', (e) => {
  if (!render || estado === 'portada') return;
  if (e.code === 'Space') { e.preventDefault(); if (peli.v.paused) peli.v.play(); else peli.v.pause(); }
  if (e.code === 'KeyZ') peli.v.currentTime = Math.max(0, peli.t - 5);
  if (e.code === 'KeyX') peli.v.currentTime = Math.min(peli.duracion - 0.1, peli.t + 5);
  if (e.code.startsWith('Digit')) { const n = +e.code.slice(5); if (n >= 1 && n <= 5) nivel = 5 - n; }
  if (e.code === 'KeyV') { recortar = !recortar; decir(recortar ? 'recorte Viewfinder: cada plano nuevo borra de los anteriores lo que tapa' : 'sin recorte: los planos se acumulan'); }
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
