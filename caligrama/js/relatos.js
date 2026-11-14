// relatos.js — el texto que rellena cada cosa.
// En el bosque cada objeto lleva dentro una historia en prosa, en minúsculas, que la rejilla recorre letra a
// letra (carácter = (fila*199 + columna + id*37) mod longitud). Aquí la historia de cada cosa es su nombre mal
// leído y la estela de su deriva: «alma oscura. mirada. semblante, sombra, serpiente.»
// El fondo es una prosa larga de palabras sueltas que muta despacio: una palabra cada vez, siempre por otra de
// la misma longitud, para que el texto no se desplace (en el bosque la letra está quieta y la silueta se mueve).
const V = window.VOCAB;
const pos = new Map(V.palabras.map((w, i) => [w, i]));
const azar = (n) => Math.floor(Math.random() * n);

export function relato(nombre) {
  const p = nombre.palabra;
  const i = pos.get(p);
  const vecinas = i === undefined ? [] : V.grafo[i].slice(0, 5).map((j) => V.palabras[j]).filter((w) => !nombre.historia.includes(w));
  const cabeza = nombre.epiteto ? `${p} ${nombre.epiteto}.` : `${p}.`;
  const estela = nombre.historia.slice(1, 5).map((w) => `${w}.`).join(' ');
  const texto = [cabeza, estela, vecinas.length ? vecinas.join(', ') + '.' : '', cabeza].filter(Boolean).join(' ') + ' ';
  // la cabeza (la palabra recién mal vista) es lo que se infecta de rojo durante el cambio
  return { texto: texto.toLowerCase(), rojo: cabeza.length };
}

export class Fondo {
  constructor(n = 140) {
    this.palabras = [];
    for (let k = 0; k < n; k++) this.palabras.push(V.palabras[azar(V.palabras.length)]);
    this.porLargo = new Map();
    this._texto();
  }
  _texto() { this.texto = this.palabras.join(' ') + ' '; }
  // el ojo murmura lo que ve: una palabra del fondo cambia por una vecina de algo visto, del mismo largo
  murmurar(vistas) {
    if (!vistas.length) return;
    const semilla = vistas[azar(vistas.length)];
    const i = pos.get(semilla);
    const cands = i === undefined ? [semilla] : [semilla, ...V.grafo[i].map((j) => V.palabras[j])];
    for (let intento = 0; intento < 12; intento++) {
      const k = azar(this.palabras.length), largo = this.palabras[k].length;
      const w = cands.find((c) => c.length === largo && !this.palabras.includes(c));
      if (w) { this.palabras[k] = w; this._texto(); return; }
    }
  }
}
