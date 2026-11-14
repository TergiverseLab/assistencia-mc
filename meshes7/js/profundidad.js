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
        // también en memoria, para leer el suelo y las paredes (terreno.js)
        const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(im, 0, 0);
        const rgba = x.getImageData(0, 0, im.width, im.height).data, gris = new Uint8Array(im.width * im.height);
        for (let i = 0; i < gris.length; i++) gris[i] = rgba[i * 4];
        (this.grises = this.grises || [])[this.meta.paginas.indexOf(nombre)] = { gris, w: im.width };
        ok(t);
      }; im.onerror = () => mal(new Error('no se encuentran los mapas de profundidad')); im.src = base + nombre;
    })));
    this.cortes = new Set(this.meta.cortes);
  }
  indice(t) { return Math.max(0, Math.min(this.meta.n - 1, Math.round(t * this.meta.fps))); }
  // función (u, v) → profundidad 0..255 del mapa del instante t (bilineal)
  datos(t) {
    const m = this.meta, i = this.indice(t), p = Math.floor(i / m.porPagina), j = i % m.porPagina;
    const x0 = (j % m.columnas) * m.w, y0 = Math.floor(j / m.columnas) * m.h, { gris, w } = this.grises[p];
    return (u, v) => {
      const x = x0 + Math.min(m.w - 1.001, Math.max(0, u * (m.w - 1))), y = y0 + Math.min(m.h - 1.001, Math.max(0, v * (m.h - 1)));
      const xi = x | 0, yi = y | 0, fx = x - xi, fy = y - yi, a = gris[yi * w + xi], b = gris[yi * w + xi + 1], c = gris[(yi + 1) * w + xi], d = gris[(yi + 1) * w + xi + 1];
      return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
    };
  }
  // el mapa número i, remuestreado a una rejilla W × H (para el trabajador que solidifica)
  mapa(i, W, H) {
    const m = this.meta, p = Math.floor(i / m.porPagina), j = i % m.porPagina, x0 = (j % m.columnas) * m.w, y0 = Math.floor(j / m.columnas) * m.h, { gris, w } = this.grises[p];
    const o = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const fx = x / (W - 1) * (m.w - 1.001), fy = y / (H - 1) * (m.h - 1.001), xi = fx | 0, yi = fy | 0, ax = fx - xi, ay = fy - yi, k = (y0 + yi) * w + x0 + xi;
      o[y * W + x] = (gris[k] * (1 - ax) + gris[k + 1] * ax) * (1 - ay) + (gris[k + w] * (1 - ax) + gris[k + w + 1] * ax) * ay;
    }
    return o;
  }
  // dónde está el mapa del instante t: página y rectángulo (en 0..1 de la lámina), medio píxel hacia dentro
  donde(t) {
    const m = this.meta, i = this.indice(t), pagina = Math.floor(i / m.porPagina), j = i % m.porPagina;
    const c = j % m.columnas, f = Math.floor(j / m.columnas), PW = m.columnas * m.w, PH = m.filas * m.h;
    return { i, pagina, rect: [(c * m.w + 0.5) / PW, (f * m.h + 0.5) / PH, (m.w - 1) / PW, (m.h - 1) / PH] };
  }
}
