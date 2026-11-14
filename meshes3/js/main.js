// main.js — Meshes v0.3: la película construye un mundo, fotograma a fotograma (lógica Viewfinder).
//  · PELÍCULA (barra espaciadora): la película ocupa la pantalla; se reproduce o se pausa (espacio), se adelanta o
//    se atrasa (Z / X, o clic en la barra). Mientras tanto, lo construido sigue ahí detrás.
//  · Al moverte (WASD), el fotograma visible se SOLIDIFICA delante de ti, desde donde miras: suelo recorrible,
//    objetos con grosor y fondo, todo texturizado con ese fotograma (piezas.js). La película se esconde.
//  · MUNDO: caminas por lo construido. Nada se pierde. Miras hacia otro lado, vuelves a abrir la película,
//    eliges otro momento, te mueves: otro fotograma se solidifica, y el camino crece.
//  · El datamosh: en las transiciones (el mundo se deshace en la película, la película en el mundo), en los cortes
//    de plano mientras ves la película, y en el vacío que rodea lo construido.
import { Render } from './render.js';
import { Pelicula } from './pelicula.js';
import { Profundidad } from './profundidad.js';
import { Control } from './control.js';
import { Terreno } from './terreno.js';
import { solidificar } from './piezas.js';
import { perspectiva, mult, camMundo, inversaRigida } from './mates.js';

const $ = (s) => document.querySelector(s);
const ASPECTO = 1024 / 720, TAN_Y = Math.tan((44 / 2) * Math.PI / 180), TAN = [TAN_Y * ASPECTO, TAN_Y];
const NIVELES = [0.6, 0.3, 0.12, 0.04, 0.008];
const lienzo = $('#lienzo'), gl = lienzo.getContext('webgl2', { antialias: false, alpha: false });
let render, peli, prof, control, terreno, estado = 'portada', piezas = [], recortar = false, vpAntes = null;
let nivel = 1, transicion = -1e9, indiceCine = -1, cineMosh = -1e9, antes = performance.now(), fps = 60, aviso = '', avisoHasta = 0;

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
function camara() { const cm = camMundo(control.pos, control.yaw, control.pitch); return { cm, vp: mult(perspectiva(TAN_Y, ASPECTO, 0.05, 400), inversaRigida(cm)) }; }

// solidificar el fotograma visible, desde donde miras
function solidificarAhora() {
  const { cm } = camara(), m = solidificar(prof.datos(peli.t), cm, TAN), p = render.pieza(m);
  piezas.push({ ...p, foto: peli.copia(), vp: mult(perspectiva(TAN_Y, ASPECTO, 0.05, 400), inversaRigida(cm)), t: peli.t });
  terreno.sumar(m.puntos); terreno.liberar(control.pos[0], control.pos[2]);
  decir(`fotograma ${tiempo(peli.t)} solidificado · ${m.objetos} objeto${m.objetos === 1 ? '' : 's'}${m.haySuelo ? ' · suelo filmado' : ' · sin suelo: suelo a tus pies'}`);
}

const tiempo = (t) => `${(t / 60) | 0}:${String((t % 60) | 0).padStart(2, '0')}`;
const rampa = (desde, ms = 1400) => Math.min(1, (performance.now() - desde) / ms) ** 2;

function bucle(ahora) {
  const dt = Math.min(0.05, (ahora - antes) / 1000); antes = ahora; fps = fps * 0.95 + (1 / Math.max(dt, 1e-3)) * 0.05;
  const nuevoCuadro = peli.actualizar();
  if (estado === 'pelicula') {
    // moverse desde la película = colocar el fotograma (Viewfinder)
    const k = control.teclas;
    if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].some((c) => k.has(c))) {
      peli.v.pause(); solidificarAhora(); estado = 'mundo'; transicion = performance.now(); vpAntes = camara().vp;
    } else {
      const i = prof.indice(peli.t);
      if (indiceCine >= 0 && i !== indiceCine && [...Array(Math.min(8, Math.abs(i - indiceCine)))].some((_, q) => prof.cortes.has(Math.min(i, indiceCine) + q + 1))) cineMosh = performance.now();
      indiceCine = i;
      // al abrir la película, el mundo se deshace en ella; en cada corte, un plano arrastra al otro
      const r = Math.min(rampa(transicion, 1200), rampa(cineMosh, 1600));
      render.cine(peli.tex, peli.antes, nuevoCuadro, r >= 1 ? 1 : NIVELES[nivel] * r * 0.6 + 0.004);
    }
  }
  if (estado === 'mundo') {
    control.paso(dt, terreno);
    const { vp } = camara();
    render.mundo(piezas, recortar, vp, vpAntes || vp, ahora / 1000, NIVELES[nivel] * rampa(transicion) + (rampa(transicion) >= 1 ? 0.3 : 0));
    vpAntes = vp;
  }
  // reproductor y avisos
  $('#barra-dentro').style.width = (100 * peli.t / (peli.duracion || 1)) + '%';
  $('#t').textContent = `${tiempo(peli.t)} / ${tiempo(peli.duracion || 0)} ${peli.v.paused ? '❚❚' : '▶'}`;
  $('#reproductor').classList.toggle('apagado', estado !== 'pelicula');
  const choca = performance.now() - control.choque < 500;
  $('#hud').textContent = `${estado === 'pelicula' ? 'película' : 'mundo'} · ${piezas.length} fotogramas solidificados · terreno ${terreno.ganado.toFixed(0)} m²${recortar ? ' · recorte Viewfinder' : ''} · datamosh ${NIVELES.length - nivel}/5 · ${fps.toFixed(0)} fps`;
  $('#aviso').textContent = choca ? 'aquí se acaba lo construido' : (performance.now() < avisoHasta ? aviso : '');
  requestAnimationFrame(bucle);
}

function abrirPelicula() { if (estado !== 'mundo') return; estado = 'pelicula'; transicion = performance.now(); cineMosh = -1e9; indiceCine = prof.indice(peli.t); peli.v.play(); }

async function empezar(archivo) {
  try {
    avisar('cargando la película…');
    render = new Render(gl); peli = new Pelicula(gl); prof = new Profundidad(); control = new Control(lienzo); terreno = new Terreno();
    await peli.cargar(archivo);
    avisar('cargando los mapas de profundidad…');
    await prof.cargar(gl, 'profundidad/');
    if (Math.abs(peli.duracion - prof.meta.duracion) > 3) avisar('aviso: esta película no dura lo mismo que la de los mapas de profundidad');
    dimensionar(); addEventListener('resize', dimensionar);
    $('#ov').hidden = true; $('#hud').hidden = false; $('#ayuda').hidden = false; $('#reproductor').hidden = false;
    await peli.v.play();
    estado = 'pelicula'; transicion = -1e9; requestAnimationFrame(bucle);
    decir('cuando quieras entrar en un fotograma, muévete (WASD)', 6);
  } catch (e) { avisar('error: ' + (e.message || e)); }
}

addEventListener('keydown', (e) => {
  if (!render) return;
  if (e.code === 'Space') { e.preventDefault(); if (estado === 'mundo') abrirPelicula(); else if (peli.v.paused) peli.v.play(); else peli.v.pause(); }
  if (e.code === 'KeyZ') peli.v.currentTime = Math.max(0, peli.t - 5);
  if (e.code === 'KeyX') peli.v.currentTime = Math.min(peli.duracion - 0.1, peli.t + 5);
  if (e.code.startsWith('Digit')) { const n = +e.code.slice(5); if (n >= 1 && n <= 5) nivel = 5 - n; }
  if (e.code === 'KeyV') { recortar = !recortar; decir(recortar ? 'recorte Viewfinder: cada fotograma nuevo borra lo que tapa' : 'sin recorte: todo lo construido se acumula'); }
  if (e.code === 'KeyR') { piezas.forEach((p) => gl.deleteTexture(p.foto)); piezas = []; terreno = new Terreno(); control.pos = [0, 0, 0]; control.yaw = control.pitch = 0; decir('mundo borrado'); }
  if (e.code === 'KeyH') $('#ayuda').hidden = !$('#ayuda').hidden;
});
$('#barra').addEventListener('click', (e) => { const r = e.currentTarget.getBoundingClientRect(); peli.v.currentTime = peli.duracion * (e.clientX - r.left) / r.width; });
$('#elegir').onclick = () => $('#archivo').click();
$('#archivo').onchange = (e) => { if (e.target.files[0]) empezar(e.target.files[0]); };
window.MESHES = { get piezas() { return piezas; }, get estado() { return estado; }, get control() { return control; }, get terreno() { return terreno; }, get peli() { return peli; } };
