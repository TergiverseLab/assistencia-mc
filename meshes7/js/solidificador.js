// solidificador.js — habla con el trabajador (obrero.js): un fotograma cada vez; mientras trabaja, está «ocupado».
export class Solidificador {
  constructor() {
    this.w = new Worker(new URL('./obrero.js', import.meta.url), { type: 'module' });
    this.ocupado = false; this.id = 0; this.esperas = new Map(); this.ms = 0;
    this.w.onmessage = (e) => { this.ocupado = false; this.ms = e.data.ms; const ok = this.esperas.get(e.data.id); this.esperas.delete(e.data.id); ok && ok(e.data); };
    this.w.onerror = (e) => { this.ocupado = false; console.error('obrero:', e.message); };
  }
  pedir(mapa, W, H, cm, tan) {
    this.ocupado = true; const id = ++this.id;
    return new Promise((ok) => { this.esperas.set(id, ok); this.w.postMessage({ id, mapa, W, H, cm: Array.from(cm), tan }, [mapa.buffer]); });
  }
}
