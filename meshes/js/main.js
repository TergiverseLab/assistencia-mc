// main.js — el ciclo: CINE (quieto: la película es un fotograma clave) ↔ MUNDO (te mueves: la película se hace espacio).
//  · CINE: la película corre a pantalla completa, plana. El datamosh está limpio (Reset).
//  · Al empezar a moverte: el fotograma de ese instante, con su profundidad, se convierte en un fotograma-espacio
//    construido desde tu posición (en ese instante se ve idéntico a la película) y caminas por él.
//  · Mientras caminas la película sigue: ella da el camino. En cada corte de plano, y cada pocos segundos, el
//    fotograma nuevo se suma al mundo delante de ti; el datamosh arrastra lo viejo sobre lo nuevo y cubre los huecos.
//  · Al quedarte quieto: Reset. La película vuelve a texturizar la pantalla.
import { Render } from './render.js';
import { Pelicula } from './pelicula.js';
import { Profundidad } from './profundidad.js';
import { Control } from './control.js';
import { perspectiva, mult, camMundo, inversaRigida } from './mates.js';

const $ = (s) => document.querySelector(s);
const ASPECTO = 1024 / 720, TAN_Y = Math.tan((44 / 2) * Math.PI / 180);
const NIVELES = [0.6, 0.3, 0.12, 0.04, 0]; // limpieza por bloque y fotograma: de casi limpio a datamosh puro
const lienzo = $('#lienzo'), gl = lienzo.getContext('webgl2', { antialias: false, alpha: false });
let render, peli, prof, control, estado = 'portada', capas = [], vpAntes = null, ultimaCapa = 0, ultimoIndice = -1, nivel = 1, cadencia = 2.5, antes = performance.now(), fps = 60;

function avisar(t) { $('#estado').textContent = t; }
addEventListener('error', (e) => avisar('error: ' + e.message));
addEventListener('unhandledrejection', (e) => avisar('error: ' + (e.reason && e.reason.message || e.reason)));

function dimensionar() {
  const dpr = Math.min(devicePixelRatio || 1, 1.5);
  let w = innerWidth, h = innerHeight; if (w / h > ASPECTO) w = h * ASPECTO; else h = w / ASPECTO;
  lienzo.style.width = w + 'px'; lienzo.style.height = h + 'px';
  lienzo.width = Math.round(Math.min(1600, w * dpr)); lienzo.height = Math.round(lienzo.width / ASPECTO);
  render.tam(lienzo.width, lienzo.height);
}

// la cámara del jugador
function camara() {
  const cm = camMundo(control.pos, control.yaw, control.pitch);
  return { cm, vp: mult(perspectiva(TAN_Y, ASPECTO, 0.05, 200), inversaRigida(cm)) };
}

// un fotograma-espacio: el fotograma actual de la película, colocado delante de la cámara del jugador
function nuevaCapa() {
  const d = prof.donde(peli.t), { cm } = camara(), lejos = 14;
  capas.push({ foto: peli.copia(), pagina: d.pagina, rect: d.rect, camMundo: cm, vp: mult(perspectiva(TAN_Y, ASPECTO, 0.05, lejos * 1.2), inversaRigida(cm)), tan: [TAN_Y * ASPECTO, TAN_Y], cerca: 0.9, lejos });
  while (capas.length > 6) gl.deleteTexture(capas.shift().foto);
  ultimaCapa = peli.t; ultimoIndice = d.i;
}

function bucle(ahora) {
  const dt = Math.min(0.05, (ahora - antes) / 1000); antes = ahora; fps = fps * 0.95 + (1 / Math.max(dt, 1e-3)) * 0.05;
  control.paso(dt);
  peli.actualizar();
  const quieto = control.quietoDesde > 450;
  if (estado === 'cine' && !quieto) { estado = 'mundo'; nuevaCapa(); vpAntes = camara().vp; }
  else if (estado === 'mundo' && quieto) { estado = 'cine'; }
  if (estado === 'cine') render.cine(peli.tex);
  else {
    // la película da el camino: en cada corte de plano y cada pocos segundos, un fotograma-espacio nuevo
    const i = prof.indice(peli.t);
    const corte = i !== ultimoIndice && [...Array(Math.abs(i - ultimoIndice))].some((_, k) => prof.cortes.has(Math.min(i, ultimoIndice) + k + 1));
    if ((corte && Math.abs(peli.t - ultimaCapa) > 1) || Math.abs(peli.t - ultimaCapa) > cadencia) nuevaCapa(); // como mucho uno por segundo
    ultimoIndice = i;
    const { vp } = camara();
    render.mundo(capas, prof, vp, vpAntes || vp, ahora / 1000);
    vpAntes = vp;
  }
  $('#hud').textContent = `${estado === 'cine' ? 'película' : 'dentro'} · datamosh ${NIVELES.length - nivel}/5 · ${fps.toFixed(0)} fps`;
  requestAnimationFrame(bucle);
}

async function empezar(archivo) {
  try {
    avisar('cargando la película…');
    render = new Render(gl); peli = new Pelicula(gl); prof = new Profundidad(); control = new Control(lienzo);
    await peli.cargar(archivo);
    avisar('cargando los mapas de profundidad…');
    await prof.cargar(gl, 'profundidad/');
    if (Math.abs(peli.duracion - prof.meta.duracion) > 3) avisar('aviso: esta película no dura lo mismo que la de los mapas de profundidad; el espacio no coincidirá');
    dimensionar(); addEventListener('resize', dimensionar);
    render.ajustes.limpio = NIVELES[nivel];
    $('#ov').hidden = true; $('#hud').hidden = false; $('#ayuda').hidden = false;
    await peli.v.play();
    estado = 'cine'; requestAnimationFrame(bucle);
  } catch (e) { avisar('error: ' + (e.message || e)); }
}

addEventListener('keydown', (e) => {
  if (!render) return;
  if (e.code.startsWith('Digit')) { const n = +e.code.slice(5); if (n >= 1 && n <= 5) { nivel = 5 - n; render.ajustes.limpio = NIVELES[nivel]; } }
  if (e.code === 'KeyR') { control.pos = [0, 0, 0]; control.yaw = control.pitch = 0; capas.forEach((c) => gl.deleteTexture(c.foto)); capas = []; }
  if (e.code === 'KeyH') $('#ayuda').hidden = !$('#ayuda').hidden;
});
$('#elegir').onclick = () => $('#archivo').click();
$('#archivo').onchange = (e) => { if (e.target.files[0]) empezar(e.target.files[0]); };
window.MESHES = { get peli() { return peli; }, get capas() { return capas; }, get estado() { return estado; }, get control() { return control; } };
