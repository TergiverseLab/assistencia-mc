// gl.js — el bosque en la tarjeta gráfica, a la velocidad de la cámara.
// Dos pasadas por fotograma, sin pasar nada por el procesador:
//  1 · CELDAS (una vez por celda, ~8.000): la luz media de su trozo de cámara (4 muestras, con niveles
//     automáticos), el borde (gradiente con las celdas vecinas), el entorno cercano (anillo de 8 muestras a
//     ~2,5 celdas, para realzar el detalle: ojos, dedos, letras), y con eso el tono de la tinta y si la celda
//     se rellena (sombra honda). Además, qué cosa hay (etiqueta de la IA) y qué letra de su palabra le toca.
//  2 · LETRA (una vez por píxel, ~1.000.000): solo leer su celda ya resuelta y copiar la letra del atlas.
const VS = `#version 300 es
const vec2 P[3] = vec2[3](vec2(-1.,-1.), vec2(3.,-1.), vec2(-1.,3.));
void main(){ gl_Position = vec4(P[gl_VertexID], 0., 1.); }`;

const FS_CELDA = `#version 300 es
precision highp float; precision highp int;
uniform sampler2D uVideo, uEtiq, uPal; uniform vec4 uRec; uniform vec2 uRejilla, uNiveles;
uniform float uEspejo, uInterior, uDetalle, uContraste, uBorde, uSuelo, uRelleno;
out vec4 o;
float L(vec2 s){
  s = clamp(s, 0., 1.);
  if (uEspejo > .5) s.x = 1. - s.x;
  float l = dot(texture(uVideo, uRec.xy + s * uRec.zw).rgb, vec3(.299, .587, .114));
  return clamp((l - uNiveles.x) / max(.04, uNiveles.y - uNiveles.x), 0., 1.); // niveles automáticos
}
void main(){
  vec2 cel = floor(gl_FragCoord.xy), d = 1. / uRejilla, s = (cel + .5) * d;
  // luz de la celda, borde y entorno cercano
  float m = (L(s + vec2(-.25,-.25)*d) + L(s + vec2(.25,-.25)*d) + L(s + vec2(-.25,.25)*d) + L(s + vec2(.25,.25)*d)) * .25;
  float gx = L(s + vec2(d.x, 0.)) - L(s - vec2(d.x, 0.));
  float gy = L(s + vec2(0., d.y)) - L(s - vec2(0., d.y));
  float lm = 0.;
  for (int i = 0; i < 8; i++) { float a = float(i) * .785398; lm += L(s + vec2(cos(a), sin(a)) * d * 2.5); }
  lm /= 8.;
  float mm = clamp(m + (m - lm) * uDetalle, 0., 1.);
  float t = uInterior > .5 ? mm : 1. - mm;
  float tinte = clamp(pow(t, 1.1) * uContraste, 0., 1.);
  tinte = max(tinte, clamp(length(vec2(gx, gy)) * uBorde, 0., 1.));
  // las sombras hondas se rellenan, como la puerta de la cabaña del bosque: bloque de tinta, letra en blanco
  float fondo = smoothstep(.74, 1., tinte) * uRelleno * .88;
  tinte = max(tinte, uSuelo);
  // qué cosa hay aquí, y qué letra de su palabra le toca (fila·199 + columna + cosa·37, como el bosque)
  vec2 u = s; if (uEspejo > .5) u.x = 1. - u.x;
  int k = int(texture(uEtiq, u).r * 255. + .5);
  vec4 inf = texelFetch(uPal, ivec2(0, k), 0);
  int largo = max(1, int(inf.r * 255. + .5));
  int ci = (int(cel.y) * 199 + int(cel.x) + k * 37) % largo;
  float g = texelFetch(uPal, ivec2(1 + ci, k), 0).r * 255.;
  float estilo = floor(inf.g * 255. + .5), cuerpo = floor(inf.b * 255. + .5);
  if (tinte > .62 && estilo < 2.) estilo += 2.; // en lo oscuro, negrita: más tinta
  o = vec4(g / 255., (estilo + 4. * (cuerpo - 5.)) / 255., tinte, fondo);
}`;

const FS_LETRA = `#version 300 es
precision highp float;
uniform sampler2D uCeldas, uAtlas;
uniform vec2 uRejilla, uCelda, uRes, uAtlasN;
uniform float uInterior;
out vec4 o;
void main(){
  vec2 p = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);
  vec2 cel = floor(p / uCelda);
  vec3 papel = vec3(1. - uInterior), tinta = vec3(uInterior);
  if (cel.x >= uRejilla.x || cel.y >= uRejilla.y) { o = vec4(papel, 1.); return; }
  vec4 c = texelFetch(uCeldas, ivec2(cel), 0);
  float g = floor(c.r * 255. + .5), eg = floor(c.g * 255. + .5);
  float estilo = mod(eg, 4.), cuerpo = (floor(eg / 4.) + 5.) / 11.;
  vec2 q = (p - cel * uCelda) / (uCelda * cuerpo);
  float a = 0.;
  if (g > .5 && q.x < 1. && q.y < 1.) {
    vec2 dd = 1. / (uCelda * cuerpo * uAtlasN);
    a = textureGrad(uAtlas, (vec2(g, estilo) + q) / uAtlasN, vec2(dd.x, 0.), vec2(0., dd.y)).r;
  }
  vec3 fondo = mix(papel, tinta, c.a);
  o = vec4(c.a > .45 ? mix(fondo, papel, a * .95) : mix(fondo, tinta, a * c.b), 1.);
}`;

function compilar(gl, vs, fs) {
  const p = gl.createProgram();
  for (const [tipo, src] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]]) {
    const s = gl.createShader(tipo); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    gl.attachShader(p, s);
  }
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  const u = {}; const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) { const nom = gl.getActiveUniform(p, i).name; u[nom] = gl.getUniformLocation(p, nom); }
  return { p, u };
}
function textura(gl, filtro) {
  const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filtro); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filtro === gl.LINEAR_MIPMAP_LINEAR ? gl.LINEAR : filtro);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return t;
}

export class Lienzo {
  constructor(canvas) {
    const gl = this.gl = canvas.getContext('webgl2', { alpha: false, antialias: false, preserveDrawingBuffer: false, powerPreference: 'high-performance' });
    if (!gl) throw new Error('este navegador no tiene WebGL2');
    this.canvas = canvas;
    this.celdas = compilar(gl, VS, FS_CELDA); this.letra = compilar(gl, VS, FS_LETRA);
    this.vao = gl.createVertexArray();
    this.tVideo = textura(gl, gl.LINEAR);
    this.tLuz = textura(gl, gl.NEAREST); this.fbo = gl.createFramebuffer();
    this.tEtiq = textura(gl, gl.NEAREST); this.tPal = textura(gl, gl.NEAREST); this.tAtlas = textura(gl, gl.LINEAR_MIPMAP_LINEAR);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    this.ajustes = { interior: false, detalle: 0.5, contraste: 1.2, borde: 2.4, suelo: 0.08, relleno: 0.8 };
    this.etiquetas(new Uint8Array([150]), 1, 1);
    this.niveles = [0, 1];
  }

  atlas(a) {
    const gl = this.gl; this.atlasN = [a.columnas, a.filas];
    gl.bindTexture(gl.TEXTURE_2D, this.tAtlas);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, a.canvas);
    gl.generateMipmap(gl.TEXTURE_2D);
  }
  // paleta de palabras: fila k = [largo, estilo, cuerpo, ·], luego un glifo por texel
  palabras(datos, ancho, alto) {
    const gl = this.gl; gl.bindTexture(gl.TEXTURE_2D, this.tPal);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, ancho, alto, 0, gl.RGBA, gl.UNSIGNED_BYTE, datos);
  }
  etiquetas(mapa, ancho, alto) {
    const gl = this.gl; gl.bindTexture(gl.TEXTURE_2D, this.tEtiq);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, ancho, alto, 0, gl.RED, gl.UNSIGNED_BYTE, mapa);
  }
  tam(w, h, celdaW, celdaH) {
    const gl = this.gl;
    this.canvas.width = w; this.canvas.height = h;
    this.celda = [celdaW, celdaH];
    this.cols = Math.max(2, Math.floor(w / celdaW)); this.filas = Math.max(2, Math.floor(h / celdaH));
    gl.bindTexture(gl.TEXTURE_2D, this.tLuz);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, this.cols, this.filas, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.tLuz, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return [this.cols, this.filas];
  }
  subirVideo(video) {
    const gl = this.gl; gl.bindTexture(gl.TEXTURE_2D, this.tVideo);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
  }
  dibujar(rec, espejo) {
    const gl = this.gl, A = this.ajustes, esp = espejo ? 1 : 0;
    gl.bindVertexArray(this.vao);
    // 1 · una vez por celda: tono, borde, relleno, palabra y letra
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo); gl.viewport(0, 0, this.cols, this.filas);
    gl.useProgram(this.celdas.p); let u = this.celdas.u;
    [[this.tVideo, 'uVideo'], [this.tEtiq, 'uEtiq'], [this.tPal, 'uPal']].forEach(([t, n], i) => { gl.activeTexture(gl.TEXTURE0 + i); gl.bindTexture(gl.TEXTURE_2D, t); gl.uniform1i(u[n], i); });
    gl.uniform4fv(u.uRec, rec); gl.uniform2fv(u.uNiveles, this.niveles); gl.uniform2f(u.uRejilla, this.cols, this.filas);
    gl.uniform1f(u.uEspejo, esp); gl.uniform1f(u.uInterior, A.interior ? 1 : 0);
    gl.uniform1f(u.uDetalle, A.detalle); gl.uniform1f(u.uContraste, A.contraste); gl.uniform1f(u.uBorde, A.borde); gl.uniform1f(u.uSuelo, A.suelo); gl.uniform1f(u.uRelleno, A.relleno);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    // 2 · una vez por píxel: solo copiar la letra de la celda
    gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.useProgram(this.letra.p); u = this.letra.u;
    [[this.tLuz, 'uCeldas'], [this.tAtlas, 'uAtlas']].forEach(([t, n], i) => { gl.activeTexture(gl.TEXTURE0 + i); gl.bindTexture(gl.TEXTURE_2D, t); gl.uniform1i(u[n], i); });
    gl.uniform2f(u.uRejilla, this.cols, this.filas); gl.uniform2fv(u.uCelda, this.celda);
    gl.uniform2f(u.uRes, this.canvas.width, this.canvas.height); gl.uniform2fv(u.uAtlasN, this.atlasN); gl.uniform1f(u.uInterior, A.interior ? 1 : 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
}
