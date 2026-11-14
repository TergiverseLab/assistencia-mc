// grabar.js — graba exactamente lo que se ve (el lienzo de letras), con el micrófono si se quiere.
// En Android, Chrome graba MP4 (H.264) si puede y si no WebM; al terminar se comparte (Guardar en Fotos,
// Drive, WhatsApp…) o se descarga.
export class Grabadora {
  constructor(canvas) { this.canvas = canvas; this.grabando = false; }
  tipo() {
    const tipos = ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
    return tipos.find((t) => window.MediaRecorder && MediaRecorder.isTypeSupported(t)) || '';
  }
  async empezar(conMicro) {
    const flujo = this.canvas.captureStream(30);
    if (conMicro) {
      try { const a = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false } }); a.getAudioTracks().forEach((p) => flujo.addTrack(p)); this.audio = a; }
      catch (e) { console.warn('sin micrófono', e); }
    }
    this.mime = this.tipo();
    this.trozos = [];
    this.rec = new MediaRecorder(flujo, { mimeType: this.mime || undefined, videoBitsPerSecond: 12e6 });
    this.rec.ondataavailable = (e) => { if (e.data && e.data.size) this.trozos.push(e.data); };
    this.rec.start(1000);
    this.inicio = performance.now(); this.grabando = true;
  }
  parar() {
    return new Promise((ok) => {
      this.rec.onstop = () => {
        this.grabando = false;
        if (this.audio) { this.audio.getTracks().forEach((p) => p.stop()); this.audio = null; }
        const tipo = (this.mime || 'video/webm').split(';')[0];
        const blob = new Blob(this.trozos, { type: tipo });
        const fecha = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
        ok({ blob, nombre: `caligrama-${fecha}.${tipo.includes('mp4') ? 'mp4' : 'webm'}` });
      };
      this.rec.stop();
    });
  }
  segundos() { return this.grabando ? (performance.now() - this.inicio) / 1000 : 0; }
}

export async function guardar({ blob, nombre }) {
  const archivo = new File([blob], nombre, { type: blob.type });
  if (navigator.canShare && navigator.canShare({ files: [archivo] })) {
    try { await navigator.share({ files: [archivo], title: nombre }); return 'compartido'; } catch (e) { if (e.name === 'AbortError') return 'cancelado'; }
  }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = nombre;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 60000);
  return 'descargado';
}
