// profundidad.js — los mapas de profundidad de la película, calculados antes con Depth Anything V2 (2 por segundo).
// Vienen en láminas PNG (cada mapa 160 × 112, en gris: 0 = lejos, 255 = cerca) y un índice con los cortes de plano.
export class Profundidad {
  async cargar(gl, base) {
    this.meta = await (await fetch(base + 'meta.json')).json();
    this.paginas = await Promise.all(this.meta.paginas.map((nombre) => new Promise((ok, mal) => {
      const im = new Image(); im.onload = () => {
        const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
        gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, gl.RED, gl.UNSIGNED_BYTE, im);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        ok(t);
      }; im.onerror = () => mal(new Error('no se encuentran los mapas de profundidad')); im.src = base + nombre;
    })));
    this.cortes = new Set(this.meta.cortes);
  }
  indice(t) { return Math.max(0, Math.min(this.meta.n - 1, Math.round(t * this.meta.fps))); }
  // dónde está el mapa del instante t: página y rectángulo (en 0..1 de la lámina), medio píxel hacia dentro
  donde(t) {
    const m = this.meta, i = this.indice(t), pagina = Math.floor(i / m.porPagina), j = i % m.porPagina;
    const c = j % m.columnas, f = Math.floor(j / m.columnas), PW = m.columnas * m.w, PH = m.filas * m.h;
    return { i, pagina, rect: [(c * m.w + 0.5) / PW, (f * m.h + 0.5) / PH, (m.w - 1) / PW, (m.h - 1) / PH] };
  }
}
