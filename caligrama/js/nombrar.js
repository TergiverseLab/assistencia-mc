// nombrar.js — el ojo que lee mal.
// El detector dice «persona»; aquí esa certeza se tuerce: se elige una palabra del vecindario poético de la
// clase (más lejos cuanto mayor el delirio y menor la confianza del detector) y, mientras la cosa siga a la
// vista, la palabra resbala por el grafo de sentido: alma → mirada → semblante → sombra…
const V = window.VOCAB;
const pos = new Map(V.palabras.map((w, i) => [w, i]));
const azar = (n) => Math.floor(Math.random() * n);

export class Nombrador {
  constructor() { this.delirio = 0.45; this.recuerdos = new Map(); }
  clase(etiqueta) { return V.clases[etiqueta] || { es: etiqueta, vecinas: [], epitetos: [] }; }

  // primera lectura de una cosa recién vista
  bautizar(etiqueta, confianza) {
    const c = this.clase(etiqueta);
    let d = Math.min(1, this.delirio + Math.max(0, 0.5 - confianza) * 0.8);
    let palabra;
    if (Math.random() < d * 0.25) {
      // lectura completamente equivocada: el vecindario de otra cosa
      const otras = Object.keys(V.clases); const o = V.clases[otras[azar(otras.length)]];
      palabra = o.vecinas[azar(Math.min(12, o.vecinas.length))] || c.es;
    } else {
      const lista = [c.es, ...c.vecinas];
      const rango = Math.floor(Math.pow(Math.random(), 1.6) * (1 + d * 40));
      palabra = d < 0.08 ? c.es : lista[Math.min(lista.length - 1, rango)];
    }
    return { palabra, epiteto: this.epiteto(c, d), historia: [palabra], proxima: this.periodo(d) };
  }
  epiteto(c, d) { return c.epitetos && c.epitetos.length && Math.random() < 0.15 + d * 0.35 ? c.epitetos[azar(Math.min(10, c.epitetos.length))] : ''; }
  periodo(d) { return 9 - 6.5 * d + Math.random() * 3; }

  // la deriva: un paso por el grafo, sin volver a lo recién dicho
  derivar(estado, etiqueta) {
    const c = this.clase(etiqueta);
    const i = pos.get(estado.palabra);
    let cands = i === undefined ? c.vecinas.slice(0, 6) : V.grafo[i].map((j) => V.palabras[j]);
    cands = cands.filter((w) => !estado.historia.includes(w));
    if (!cands.length) cands = c.vecinas.slice(0, 20);
    // con poco delirio la deriva no se aleja mucho: tira hacia el vecindario de la clase
    if (Math.random() > this.delirio) {
      const cerca = cands.filter((w) => c.vecinas.slice(0, 30).includes(w));
      if (cerca.length) cands = cerca;
    }
    estado.palabra = cands[azar(Math.min(cands.length, 6))];
    estado.historia.unshift(estado.palabra);
    if (estado.historia.length > 7) estado.historia.pop();
    if (Math.random() < 0.3) estado.epiteto = this.epiteto(c, this.delirio);
    estado.proxima = this.periodo(this.delirio);
    estado.cambio = performance.now() / 1000;
  }

  // palabras sueltas para el fondo: lo que el ojo murmura de todo lo que ve
  murmullo(palabras, n = 12) {
    const out = [...palabras];
    while (out.length < n) out.push(V.palabras[azar(V.palabras.length)]);
    return out;
  }
}
