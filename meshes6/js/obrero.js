// obrero.js — trabajador en paralelo: solidifica los fotogramas sin frenar el juego (piezas.js, fuera del hilo
// principal). Recibe el mapa de profundidad ya en la rejilla de trabajo y devuelve las mallas.
import { solidificar } from './piezas.js';
onmessage = (e) => {
  const { id, mapa, W, H, cm, tan } = e.data, t0 = performance.now();
  const datos = (u, v) => mapa[Math.round(v * (H - 1)) * W + Math.round(u * (W - 1))];
  const m = solidificar(datos, cm, tan, W, H);
  postMessage({ id, pos: m.pos, uv: m.uv, ind: m.ind, nSuelo: m.nSuelo, objetos: m.objetos, haySuelo: m.haySuelo, ms: performance.now() - t0 }, [m.pos.buffer, m.uv.buffer, m.ind.buffer]);
};
