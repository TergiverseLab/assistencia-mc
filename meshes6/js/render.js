// render.js — los fotogramas-espacio (Viewfinder) y el datamosh (Kino Datamosh de Keijiro Takahashi, MIT).
//
// FOTOGRAMA-ESPACIO: una malla de 160 × 112 vértices. Cada vértice toma su distancia del mapa de profundidad
// del fotograma y se coloca delante de la cámara desde la que se tomó (la del jugador en ese instante), así que
// en ese instante se ve exactamente como el fotograma. Su textura es el propio fotograma, proyectado desde ese
// punto de vista: al moverse, la imagen se deforma y revela el volumen (Catacombs of Solaris).
// Donde la profundidad salta (bordes, lo que hay detrás de una figura) la malla se estira como una sábana:
// eso es lo que la cámara de Deren nunca vio, y se marca como «ciego».
// Los fotogramas-espacio se acumulan; cada uno recorta de los anteriores todo lo que cae dentro de su campo de
// visión, como una foto colocada en Viewfinder.
//
// DATAMOSH: igual que el de Keijiro. Un búfer de trabajo guarda la última imagen; en cada fotograma se arrastra
// por macrobloques según los vectores de movimiento (calculados aquí exactamente, con la posición de cada punto
// en este fotograma y en el anterior), con algo de difusión; cada bloque acumula movimiento y, al saturarse,
// se llena de franjas tipo DCT. Algunos bloques se refrescan con la imagen nueva; lo «ciego» no se refresca nunca.
import { programa, textura, objetivo, VS_PANTALLA, GLSL_FOTO } from './gl.js';

// las piezas solidificadas: posición en el mundo y uv en su fotograma
const VS_CAPA = `#version 300 es
precision highp float;
uniform mat4 uVP, uVPAntes;
in vec3 aPos; in vec2 aUV;
out vec2 vUV; out vec4 vAhora, vAntes; out vec3 vMundo;
void main(){ vMundo = aPos; vAhora = uVP * vec4(aPos, 1.); vAntes = uVPAntes * vec4(aPos, 1.); gl_Position = vAhora; vUV = aUV; }`;
const FS_CAPA = `#version 300 es
precision highp float;
uniform sampler2D uFoto; uniform int uNuevas; uniform mat4 uNuevasVP[5];
in vec2 vUV; in vec4 vAhora, vAntes; in vec3 vMundo;
layout(location = 0) out vec4 color; layout(location = 1) out vec4 vel;
${GLSL_FOTO}
void main(){
  // recorte de Viewfinder (opcional): lo que cae dentro del encuadre de un fotograma más nuevo desaparece
  for (int i = 0; i < 5; i++) { if (i >= uNuevas) break; vec4 c = uNuevasVP[i] * vec4(vMundo, 1.); if (c.w > 0. && abs(c.x) < c.w && abs(c.y) < c.w) discard; }
  color = vec4(foto(uFoto, vUV), 1.);
  vec2 a = vAhora.xy / vAhora.w, b = vAntes.xy / vAntes.w;
  vel = vec4((a - b) * .5 * 4. + .5, 0., 1.);
}`;
const FS_CINE = `#version 300 es
precision highp float;
uniform sampler2D uFoto; in vec2 uv; out vec4 o;
${GLSL_FOTO}
void main(){ o = vec4(foto(uFoto, vec2(uv.x, 1. - uv.y)), 1.); }`;
const FS_BLOQUES = `#version 300 es
precision highp float;
uniform sampler2D uVel, uAntes; uniform vec2 uBloques, uPx; uniform float uT, uBloque, uCalidad, uVelEsc, uDifusion;
out vec4 o;
float rnd(vec2 uv){ return fract(43758.5453 * sin(dot(vec2(12.9898, 78.233), uv))); }
void main(){
  vec2 uv = (floor(gl_FragCoord.xy) + .5) / uBloques;
  vec3 r = vec3(rnd(uv + vec2(uT, 0.)), rnd(uv + vec2(0., uT)), rnd(uv.yx - uT));
  vec2 mv = (texture(uVel, uv).rg - .5) / 4. * uVelEsc * uPx;       // uv → píxeles
  mv += (r.xy - .5) * uDifusion; mv = floor(mv + .5);
  float acc = texture(uAntes, uv).a, l = length(mv);
  float accSube = acc + min(l, uBloque) * .005 + r.z * mix(-.02, .02, uCalidad);
  acc = clamp(l > uBloque ? r.z * .35 : accSube, 0., 1.); // un giro brusco reinicia el bloque sin ruido
  o = vec4(mv / uPx, rnd(uv + l), acc);
}`;
const FS_MOSH = `#version 300 es
precision highp float;
uniform sampler2D uEscena, uBloq, uTrabajo; uniform vec2 uBloques; uniform float uContraste, uCalidad, uLimpio, uT, uSoloFlujo, uApagar;
in vec2 uv; out vec4 o;
float rnd(vec2 p){ return fract(43758.5453 * sin(dot(vec2(12.9898, 78.233), p))); }
void main(){
  vec4 src = texture(uEscena, uv), d = texture(uBloq, uv);
  vec3 work = texture(uTrabajo, uv - d.xy * .98).rgb;
  vec4 r = fract(vec4(1., 17.37135, 841.4272, 3305.121) * d.z);
  vec2 f = uv * uBloques * (r.x * 80. / uContraste);
  float dct = cos(mix(f.x, f.y, float(.5 < r.y))) * r.z * (1. - r.x) * uContraste;
  // ruido de compresión: solo en bloques muy cargados de movimiento, y nunca más del 60 % (no se quema)
  float ruido = float(d.w > .85) * clamp(dct, 0., 1.) * .6 * (1. - uSoloFlujo);
  float cw = ruido;
  cw = mix(cw, 1., float(r.w < mix(.2, 1., uCalidad)) * float(d.w > .999) * (1. - uSoloFlujo));
  // limpieza: cada bloque, con probabilidad uLimpio, muestra la imagen nueva (0 = datamosh puro)
  if (rnd(floor(uv * uBloques) + uT) < uLimpio) cw = 1.;
  // lo que no se filmó: solo arrastre de lo que había, nunca imagen nueva; fuera de las transiciones se apaga
  // poco a poco hacia negro (si no, al caminar deja rayas eternas)
  if (src.a < .75) { o = vec4(work * uApagar, 1.); return; }
  if (uLimpio >= 1.) cw = 1.;
  cw = clamp(cw, 0., 1.);
  o = vec4(mix(work, src.rgb, cw), 1.);
}`;
// el movimiento de la propia película: para cada bloque, el desplazamiento (±8 px) que mejor casa el fotograma
// actual con el anterior. Es lo que hace un compresor de vídeo para sus vectores de movimiento.
const FS_FLUJO = `#version 300 es
precision highp float;
uniform sampler2D uAhora, uAntes; uniform vec2 uBloques, uPx; uniform float uBloque;
out vec4 o;
${GLSL_FOTO}
float L(sampler2D t, vec2 p){ return dot(foto(t, vec2(p.x, 1. - p.y)), vec3(.299, .587, .114)); }
void main(){
  vec2 b0 = floor(gl_FragCoord.xy) * uBloque / uPx, paso = uBloque / 4. / uPx, px = 1. / uPx;
  float mejor = 1e9; vec2 mv = vec2(0.);
  for (int oy = -4; oy <= 4; oy++) for (int ox = -4; ox <= 4; ox++) {
    vec2 off = vec2(float(ox), float(oy)) * 2. * px; float sad = 0.;
    for (int y = 0; y < 4; y++) for (int x = 0; x < 4; x++) { vec2 q = b0 + (vec2(float(x), float(y)) + .5) * paso; sad += abs(L(uAhora, q) - L(uAntes, q + off)); }
    sad += length(off) * .5; // a igualdad, sin movimiento
    if (sad < mejor) { mejor = sad; mv = -off; }
  }
  o = vec4(mv, 0., 1.);
}`;
const FS_COPIA = `#version 300 es
precision highp float; uniform sampler2D uT; in vec2 uv; out vec4 o; void main(){ o = texture(uT, uv); }`;

export class Render {
  constructor(gl) {
    if (!gl.getExtension('EXT_color_buffer_float')) throw new Error('tu tarjeta gráfica no admite búferes en coma flotante');
    this.gl = gl;
    this.pCapa = programa(gl, VS_CAPA, FS_CAPA); this.pCine = programa(gl, VS_PANTALLA, FS_CINE);
    this.pBloq = programa(gl, VS_PANTALLA, FS_BLOQUES); this.pMosh = programa(gl, VS_PANTALLA, FS_MOSH); this.pCopia = programa(gl, VS_PANTALLA, FS_COPIA); this.pFlujo = programa(gl, VS_PANTALLA, FS_FLUJO);
    this.vacio = gl.createVertexArray();
    this.ajustes = { bloque: 16, calidad: 0.5, contraste: 1, velEsc: 0.8, difusion: 0.4, limpio: 0.12 };
  }
  // una pieza nueva (un fotograma solidificado): sus búferes en la tarjeta gráfica
  pieza(m) {
    const gl = this.gl, vao = gl.createVertexArray(); gl.bindVertexArray(vao);
    const bufs = [];
    for (const [nombre, datos, n] of [['aPos', m.pos, 3], ['aUV', m.uv, 2]]) {
      const b = gl.createBuffer(); bufs.push(b); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, datos, gl.STATIC_DRAW);
      const loc = gl.getAttribLocation(this.pCapa.p, nombre); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, n, gl.FLOAT, false, 0, 0);
    }
    const e = gl.createBuffer(); bufs.push(e); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, e); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, m.ind, gl.STATIC_DRAW);
    gl.bindVertexArray(null);
    return { vao, bufs, n: m.ind.length, nSuelo: m.nSuelo || 0 };
  }
  borrar(p) { const gl = this.gl; gl.deleteVertexArray(p.vao); p.bufs.forEach((b) => gl.deleteBuffer(b)); }
  tam(w, h) {
    const gl = this.gl; this.w = w; this.h = h; const B = this.ajustes.bloque;
    this.bloques = [Math.ceil(w / B), Math.ceil(h / B)];
    this.tEscena = textura(gl, gl.NEAREST, w, h, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE);
    this.tVel = textura(gl, gl.LINEAR, w, h, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE);
    this.fEscena = objetivo(gl, [this.tEscena, this.tVel], true, w, h);
    this.tBloq = [0, 1].map(() => textura(gl, gl.NEAREST, this.bloques[0], this.bloques[1], gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT));
    this.fBloq = this.tBloq.map((t) => objetivo(gl, [t], false));
    this.tTrab = [0, 1].map(() => textura(gl, gl.LINEAR, w, h, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE));
    this.fTrab = this.tTrab.map((t) => objetivo(gl, [t], false));
    this.tCero = textura(gl, gl.NEAREST, this.bloques[0], this.bloques[1], gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT); // flujo nulo
    this.turno = 0;
  }
  pantalla(prog, destino, tex, extra) {
    const gl = this.gl; gl.bindFramebuffer(gl.FRAMEBUFFER, destino);
    gl.useProgram(prog.p); gl.bindVertexArray(this.vacio);
    tex.forEach(([t, n], i) => { gl.activeTexture(gl.TEXTURE0 + i); gl.bindTexture(gl.TEXTURE_2D, t); gl.uniform1i(prog.u[n], i); });
    if (extra) extra(prog.u);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  // CINE: la película a pantalla completa. Normalmente es un fotograma clave (el datamosh, limpio).
  // Tras un corte de plano, durante un momento NO hay fotograma clave: el movimiento del plano nuevo arrastra los
  // píxeles del anterior, y los bloques se van limpiando poco a poco (limpio: probabilidad por bloque y fotograma).
  cine(tFoto, tAntes, nuevoCuadro, limpio) {
    const gl = this.gl, A = this.ajustes, a = this.turno, b = a ^ 1;
    gl.viewport(0, 0, this.w, this.h);
    if (limpio >= 1) {
      this.pantalla(this.pCine, this.fTrab[a], [[tFoto, 'uFoto']]);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.fBloq[a]); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
      return this.alLienzo();
    }
    {
      this.pantalla(this.pCine, this.fEscena, [[tFoto, 'uFoto']]);
      if (nuevoCuadro) {
        gl.viewport(0, 0, this.bloques[0], this.bloques[1]);
        this.pantalla(this.pFlujo, this.fBloq[b], [[tFoto, 'uAhora'], [tAntes, 'uAntes']], (u) => { gl.uniform2fv(u.uBloques, this.bloques); gl.uniform2f(u.uPx, this.w, this.h); gl.uniform1f(u.uBloque, A.bloque); });
        gl.viewport(0, 0, this.w, this.h);
      }
      this.pantalla(this.pMosh, this.fTrab[b], [[this.tEscena, 'uEscena'], [nuevoCuadro ? this.tBloq[b] : this.tCero, 'uBloq'], [this.tTrab[a], 'uTrabajo']], (u) => {
        gl.uniform2fv(u.uBloques, this.bloques); gl.uniform1f(u.uContraste, A.contraste); gl.uniform1f(u.uCalidad, A.calidad); gl.uniform1f(u.uLimpio, limpio); gl.uniform1f(u.uT, performance.now() % 100000 / 1000); gl.uniform1f(u.uSoloFlujo, 1); gl.uniform1f(u.uApagar, 1);
      });
      this.turno = b;
    }
    this.alLienzo();
  }
  // MUNDO: los fotogramas-espacio vistos desde la cámara del jugador, y el datamosh encima
  mundo(capas, recortar, vp, vpAntes, t, limpio, apagar = 1) {
    const gl = this.gl, A = this.ajustes;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fEscena); gl.viewport(0, 0, this.w, this.h);
    gl.clearBufferfv(gl.COLOR, 0, [0, 0, 0, 0]); gl.clearBufferfv(gl.COLOR, 1, [0.5, 0.5, 0, 1]); gl.clear(gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    const u = this.pCapa.u; gl.useProgram(this.pCapa.p);
    gl.uniformMatrix4fv(u.uVP, false, vp); gl.uniformMatrix4fv(u.uVPAntes, false, vpAntes);
    // dos pasadas: 1 · los suelos, todos en el mismo plano, por orden (el más nuevo encima, sin parpadeo);
    // 2 · objetos y fondo, con prueba de profundidad normal
    const dibujar = (c, i, desde, hasta) => {
      if (hasta <= desde) return;
      const nuevas = recortar ? capas.slice(i + 1, i + 6) : [];
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, c.foto); gl.uniform1i(u.uFoto, 1);
      gl.uniform1i(u.uNuevas, nuevas.length);
      if (nuevas.length) { const m = new Float32Array(16 * 5); nuevas.forEach((n, k) => m.set(n.vp, k * 16)); gl.uniformMatrix4fv(u.uNuevasVP, false, m); }
      gl.bindVertexArray(c.vao); gl.drawElements(gl.TRIANGLES, hasta - desde, gl.UNSIGNED_INT, desde * 4);
    };
    gl.depthFunc(gl.ALWAYS); capas.forEach((c, i) => dibujar(c, i, 0, c.nSuelo));
    gl.depthFunc(gl.LESS); capas.forEach((c, i) => dibujar(c, i, c.nSuelo, c.n));
    gl.disable(gl.DEPTH_TEST);
    // bloques: vectores de movimiento y acumulación
    const a = this.turno, b = a ^ 1;
    gl.viewport(0, 0, this.bloques[0], this.bloques[1]);
    this.pantalla(this.pBloq, this.fBloq[b], [[this.tVel, 'uVel'], [this.tBloq[a], 'uAntes']], (u) => {
      gl.uniform2fv(u.uBloques, this.bloques); gl.uniform2f(u.uPx, this.w, this.h); gl.uniform1f(u.uT, t % 100);
      gl.uniform1f(u.uBloque, A.bloque); gl.uniform1f(u.uCalidad, A.calidad); gl.uniform1f(u.uVelEsc, A.velEsc); gl.uniform1f(u.uDifusion, A.difusion);
    });
    // el datamosh
    gl.viewport(0, 0, this.w, this.h);
    this.pantalla(this.pMosh, this.fTrab[b], [[this.tEscena, 'uEscena'], [this.tBloq[b], 'uBloq'], [this.tTrab[a], 'uTrabajo']], (u) => {
      gl.uniform2fv(u.uBloques, this.bloques); gl.uniform1f(u.uContraste, A.contraste); gl.uniform1f(u.uCalidad, A.calidad); gl.uniform1f(u.uLimpio, limpio); gl.uniform1f(u.uT, t % 100); gl.uniform1f(u.uSoloFlujo, 0); gl.uniform1f(u.uApagar, apagar);
    });
    this.turno = b;
    this.alLienzo();
  }
  alLienzo() {
    const gl = this.gl; gl.viewport(0, 0, this.w, this.h);
    this.pantalla(this.pCopia, null, [[this.tTrab[this.turno], 'uT']]);
  }
}
