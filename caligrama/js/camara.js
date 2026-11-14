// camara.js — abre la cámara (trasera por defecto), cambia entre trasera y frontal,
// y calcula qué parte del vídeo cabe en la pantalla (recorte «cover»).
export class Camara {
  constructor(video) { this.video = video; this.frontal = false; this.flujo = null; }
  async abrir() {
    if (this.flujo) this.flujo.getTracks().forEach((p) => p.stop());
    this.flujo = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: this.frontal ? 'user' : 'environment', width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } }
    });
    this.video.srcObject = this.flujo;
    this.video.muted = true; this.video.playsInline = true;
    await this.video.play();
    await new Promise((ok) => (this.video.videoWidth ? ok() : this.video.addEventListener('loadedmetadata', ok, { once: true })));
  }
  async girar() { this.frontal = !this.frontal; await this.abrir(); }
  // recorte visible del vídeo para una pantalla de aspecto w/h: [x0, y0, ancho, alto] en 0..1
  recorte(w, h) {
    const vw = this.video.videoWidth || 1, vh = this.video.videoHeight || 1;
    const a = w / h, av = vw / vh;
    return a > av ? [0, (1 - av / a) / 2, 1, av / a] : [(1 - a / av) / 2, 0, a / av, 1];
  }
}
