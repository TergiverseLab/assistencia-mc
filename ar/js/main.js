// main.js — palabras sobre las cosas: sesión de realidad aumentada (WebXR + ARCore) en Chrome para Android.
// ARCore da, 60 veces por segundo, la posición del móvil y un mapa de profundidad de lo que ve; pintura.js escribe
// con eso las palabras en coordenadas del mundo. El ojo de escena (SegFormer, en su hilo) pone el nombre de cada
// cosa dos o tres veces por segundo, a partir de la imagen de la cámara.
import { Pintura } from './pintura.js';
import { crearAtlas } from './atlas.js';
import { NOMBRES, letraDe } from './clases.js';
import { Segmentador } from './segmentar.js';

const $ = (s) => document.querySelector(s);
const VERSION = 'palabras sobre las cosas v0.1';
let sesion = null, gl, pintura, espacio, enlace, ojo = null, ultimaMirada = 0, versionVista = -1, fps = 60, antes = 0;
const A = { letra: 3, papel: true, volteo: false };

function avisar(t) { $('#estado').textContent = t; $('#aviso').textContent = t; $('#aviso').hidden = !t; }
addEventListener('error', (e) => avisar('error: ' + e.message));
addEventListener('unhandledrejection', (e) => avisar('error: ' + (e.reason && e.reason.message || e.reason)));

function prepararLetras() {
  const atlas = crearAtlas(NOMBRES.join('')); pintura.atlas(atlas);
  const ANCHO = 32, d = new Uint8Array(ANCHO * NOMBRES.length * 4);
  NOMBRES.forEach((nombre, k) => {
    const txt = (nombre + ' ').slice(0, ANCHO - 1), [estilo, cuerpo] = letraDe(k), o = k * ANCHO * 4;
    d[o] = txt.length; d[o + 1] = estilo; d[o + 2] = cuerpo;
    [...txt].forEach((c, i) => { d[o + (i + 1) * 4] = atlas.indice.get(c) || 0; });
  });
  pintura.palabras(d, ANCHO, NOMBRES.length);
}

async function entrar() {
  try {
    if (!navigator.xr || !(await navigator.xr.isSessionSupported('immersive-ar'))) throw new Error('este móvil o navegador no tiene realidad aumentada (hace falta Chrome en Android con «Servicios de Google Play para RA»)');
    avisar('abriendo la realidad aumentada…');
    sesion = await navigator.xr.requestSession('immersive-ar', {
      requiredFeatures: ['depth-sensing'],
      optionalFeatures: ['camera-access', 'dom-overlay', 'local-floor'],
      depthSensing: { usagePreference: ['cpu-optimized'], dataFormatPreference: ['luminance-alpha'] },
      domOverlay: { root: $('#capa') }
    });
  } catch (e) {
    avisar(/depth/i.test(e.message || '') ? 'tu móvil no ofrece el mapa de profundidad de ARCore a la web' : 'no se pudo entrar: ' + (e.message || e));
    return;
  }
  const canvas = document.createElement('canvas');
  gl = canvas.getContext('webgl2', { xrCompatible: true, alpha: true, antialias: false });
  pintura = new Pintura(gl); prepararLetras();
  await sesion.updateRenderState({ baseLayer: new XRWebGLLayer(sesion, gl, { alpha: true, antialias: false }) });
  espacio = await sesion.requestReferenceSpace('local');
  try { enlace = new XRWebGLBinding(sesion, gl); } catch (e) { enlace = null; }
  $('#ov').hidden = true; $('#mandos').hidden = false;
  sesion.addEventListener('end', () => { sesion = null; $('#ov').hidden = false; $('#mandos').hidden = true; avisar('sesión terminada'); });
  avisar('mueve un poco el móvil para que reconozca el espacio');
  setTimeout(() => avisar(''), 5000);
  // el ojo de escena, en segundo plano (si no carga, las palabras salen por orientación: pared, suelo, techo)
  if ($('#nombres').checked) { const s = new Segmentador(); s.cargar((t) => { if (!ojo) $('#aviso2').textContent = t; }).then(() => { ojo = s; $('#aviso2').textContent = ''; }).catch((e) => { $('#aviso2').textContent = 'sin nombres: ' + e.message; }); }
  sesion.requestAnimationFrame(marco);
}

function marco(t, frame) {
  if (!sesion) return;
  sesion.requestAnimationFrame(marco);
  fps = fps * 0.95 + (1000 / Math.max(1, t - antes)) * 0.05; antes = t;
  const capa = sesion.renderState.baseLayer, pose = frame.getViewerPose(espacio);
  gl.bindFramebuffer(gl.FRAMEBUFFER, capa.framebuffer);
  gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
  if (!pose) return;
  for (const vista of pose.views) {
    const vp = capa.getViewport(vista);
    let info = null; try { info = frame.getDepthInformation(vista); } catch (e) {}
    if (!info) continue;
    pintura.profundidad(info);
    let cam = null;
    if (enlace && vista.camera) { try { cam = enlace.getCameraImage(vista.camera); } catch (e) {} }
    // el ojo de escena mira 2-3 veces por segundo
    if (cam && ojo && !ojo.ocupado && t - ultimaMirada > 350) {
      ultimaMirada = t;
      const H = 384, W = Math.max(96, Math.round((H * vp.width / vp.height) / 32) * 32);
      const datos = pintura.leerCamara(cam, W, H, capa.framebuffer);
      createImageBitmap(datos).then((img) => ojo.verImagen(img));
    }
    if (ojo && ojo.version !== versionVista && ojo.mapa) { pintura.etiquetas(ojo.mapa, ojo.ancho, ojo.altoMapa); versionVista = ojo.version; }
    pintura.ajustes.letra = A.letra / 100; pintura.ajustes.papel = A.papel; pintura.ajustes.volteo = A.volteo;
    pintura.dibujar(vista, vp, cam);
  }
  if ($('#ver').checked) $('#st').textContent = `${fps.toFixed(0)} fps · cámara ${enlace ? 'sí' : 'no'} · ${ojo ? ojo.motor + ' ' + (ojo.ms | 0) + ' ms' : 'sin nombres'}`;
}

$('#version').textContent = VERSION;
$('#entrar').onclick = entrar;
$('#salir').onclick = () => sesion && sesion.end();
$('#ajustes-boton').onclick = () => { $('#cfgP').hidden = !$('#cfgP').hidden; };
$('#letra').oninput = (e) => { A.letra = +e.target.value; $('#letra-n').textContent = A.letra; };
$('#papel').onchange = (e) => { A.papel = e.target.checked; };
$('#volteo').onchange = (e) => { A.volteo = e.target.checked; };
$('#ver').onchange = (e) => { $('#st').hidden = !e.target.checked; };
(async () => {
  if (!window.isSecureContext) return avisar('hace falta https://');
  const si = navigator.xr && await navigator.xr.isSessionSupported('immersive-ar').catch(() => false);
  avisar(si ? '' : 'aviso: este navegador no ofrece realidad aumentada (prueba con Chrome en Android)');
})();
