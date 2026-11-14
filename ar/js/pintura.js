// pintura.js — las palabras escritas SOBRE las superficies del mundo, en realidad aumentada (WebXR + ARCore).
// Para cada píxel de la pantalla:
//  1 · su profundidad (mapa de ARCore, en metros) y la posición del móvil dan su posición real en el espacio;
//  2 · con las posiciones vecinas se calcula hacia dónde mira la superficie (su normal): pared, suelo, el
//      lateral de un armario, un hombro;
//  3 · las palabras se escriben en coordenadas del MUNDO (proyección triplanar: cada superficie recibe el texto
//      del plano al que más se parece), con letras de tamaño físico (p. ej. 3 cm). Por eso quedan clavadas en
//      las cosas: si el móvil se mueve no resbalan, se ven en perspectiva y crecen al acercarse;
//  4 · el tono sale de la imagen de la cámara (luz, sombra), como en la cámara caligramática.
const VS = `#version 300 es
const vec2 P[3] = vec2[3](vec2(-1.,-1.), vec2(3.,-1.), vec2(-1.,3.));
void main(){ gl_Position = vec4(P[gl_VertexID], 0., 1.); }`;

const FS = `#version 300 es
precision highp float; precision highp int;
uniform sampler2D uProf, uCam, uEtiq, uPal, uAtlas;
uniform mat4 uProjInv, uVistaMundo, uProfDesdeVista;
uniform vec2 uRes, uAtlasN;
uniform float uLetra, uPapel, uTieneCam, uTieneEtiq, uVolteo, uContraste;
out vec4 o;

vec3 mundo(vec2 uv){ // uv: coordenadas normalizadas de la vista, origen arriba a la izquierda
  vec2 ud = (uProfDesdeVista * vec4(uv, 0., 1.)).xy;
  float d = texture(uProf, ud).r;
  vec4 v = uProjInv * vec4(uv.x * 2. - 1., 1. - uv.y * 2., 1., 1.); v /= v.w;
  vec3 pv = v.xyz * (d / -v.z);
  return (uVistaMundo * vec4(pv, 1.)).xyz;
}

float letra(vec2 c, int k){
  vec2 celda = vec2(.6, 1.25) * uLetra;
  vec2 cel = floor(c / celda);
  vec4 inf = texelFetch(uPal, ivec2(0, k), 0);
  int largo = max(1, int(inf.r * 255. + .5));
  int ci = ((int(cel.y) * 199 + int(cel.x) + k * 37) % largo + largo) % largo;
  float g = texelFetch(uPal, ivec2(1 + ci, k), 0).r * 255.;
  float estilo = floor(inf.g * 255. + .5);
  vec2 l = (c - cel * celda) / celda;
  if (g < .5) return 0.;
  vec2 dx = dFdx(c) / celda / uAtlasN, dy = dFdy(c) / celda / uAtlasN;
  return textureGrad(uAtlas, (vec2(g, estilo) + l) / uAtlasN, dx, dy).r;
}

void main(){
  vec2 uv = vec2(gl_FragCoord.x / uRes.x, 1. - gl_FragCoord.y / uRes.y);
  vec3 P = mundo(uv);
  // normal de la superficie, con vecinos algo separados (el mapa de profundidad es de baja resolución)
  float e = 1. / 90.;
  vec3 n = normalize(cross(mundo(uv + vec2(e, 0.)) - mundo(uv - vec2(e, 0.)), mundo(uv - vec2(0., e)) - mundo(uv + vec2(0., e))));
  vec3 ojo = uVistaMundo[3].xyz;
  if (dot(n, ojo - P) < 0.) n = -n;
  // qué cosa es: la etiqueta del ojo de escena si la hay; si no, por la orientación (pared, suelo, techo)
  int k = n.y > .7 ? 3 : (n.y < -.7 ? 5 : 0);
  if (uTieneEtiq > .5) { int ke = int(texture(uEtiq, uv).r * 255. + .5); if (ke < 150) k = ke; }
  // proyección triplanar: el texto del plano al que más se parece la superficie, leído de frente
  vec3 w = pow(abs(n), vec3(8.)); w /= (w.x + w.y + w.z);
  float a = 0.;
  if (w.x > .02) a += w.x * letra(vec2(P.z * sign(n.x), -P.y), k);
  if (w.y > .02) a += w.y * letra(vec2(P.x, P.z * sign(n.y)), k);
  if (w.z > .02) a += w.z * letra(vec2(-P.x * sign(n.z), -P.y), k);
  // tono de la cámara
  float lum = .5;
  if (uTieneCam > .5) {
    vec2 uc = gl_FragCoord.xy / uRes; if (uVolteo > .5) uc.y = 1. - uc.y;
    lum = dot(texture(uCam, uc).rgb, vec3(.299, .587, .114));
  }
  float tinte = clamp(pow(1. - lum, 1.1) * uContraste + .12, 0., 1.);
  if (uPapel > .5 && uTieneCam > .5) o = vec4(mix(vec3(1.), vec3(0.), a * tinte), 1.);
  else o = vec4(0., 0., 0., a * (uTieneCam > .5 ? tinte : .85)); // letras sobre la cámara real
}`;

// pasada auxiliar: la imagen de la cámara reducida, derecha, para el ojo de escena
const FS_COPIA = `#version 300 es
precision highp float;
uniform sampler2D uCam; uniform vec2 uRes; uniform float uVolteo;
out vec4 o;
void main(){ vec2 uc = gl_FragCoord.xy / uRes; uc.y = 1. - uc.y; if (uVolteo > .5) uc.y = 1. - uc.y; o = vec4(texture(uCam, uc).rgb, 1.); }`;

function compilar(gl, fs) {
  const p = gl.createProgram();
  for (const [t, src] of [[gl.VERTEX_SHADER, VS], [gl.FRAGMENT_SHADER, fs]]) {
    const s = gl.createShader(t); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    gl.attachShader(p, s);
  }
  gl.linkProgram(p); if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
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

export class Pintura {
  constructor(gl) {
    this.gl = gl; this.prog = compilar(gl, FS); this.copia = compilar(gl, FS_COPIA); this.vao = gl.createVertexArray();
    this.tProf = textura(gl, gl.LINEAR); this.tEtiq = textura(gl, gl.NEAREST); this.tPal = textura(gl, gl.NEAREST); this.tAtlas = textura(gl, gl.LINEAR_MIPMAP_LINEAR);
    this.tCopia = textura(gl, gl.NEAREST); this.fbo = gl.createFramebuffer();
    this.ajustes = { letra: 0.03, papel: true, volteo: false, contraste: 1.3 };
    this.hayEtiq = false;
  }
  atlas(a) { const gl = this.gl; this.atlasN = [a.columnas, a.filas]; gl.bindTexture(gl.TEXTURE_2D, this.tAtlas); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, a.canvas); gl.generateMipmap(gl.TEXTURE_2D); }
  palabras(d, w, h) { const gl = this.gl; gl.bindTexture(gl.TEXTURE_2D, this.tPal); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, d); }
  etiquetas(m, w, h) { const gl = this.gl; gl.bindTexture(gl.TEXTURE_2D, this.tEtiq); gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1); gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, w, h, 0, gl.RED, gl.UNSIGNED_BYTE, m); this.hayEtiq = true; }
  // el mapa de profundidad de ARCore (uint16 × rawValueToMeters), suavizado 3×3 y subido en metros
  profundidad(info) {
    const gl = this.gl, W = info.width, H = info.height, crudo = new Uint16Array(info.data), k = info.rawValueToMeters;
    if (!this.metros || this.metros.length !== W * H) { this.metros = new Float32Array(W * H); this.aux = new Float32Array(W * H); }
    const m = this.metros, a = this.aux;
    for (let i = 0; i < W * H; i++) a[i] = crudo[i] * k;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      let s = 0, n = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const v = a[yy * W + xx]; if (v > 0) { s += v; n++; }
      }
      m[y * W + x] = n ? s / n : 0;
    }
    gl.bindTexture(gl.TEXTURE_2D, this.tProf);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R16F, W, H, 0, gl.RED, gl.FLOAT, m);
    this.profDesdeVista = info.normDepthBufferFromNormView.matrix;
  }
  dibujar(vista, viewport, camTex) {
    const gl = this.gl, A = this.ajustes, u = this.prog.u;
    gl.viewport(viewport.x, viewport.y, viewport.width, viewport.height);
    gl.useProgram(this.prog.p); gl.bindVertexArray(this.vao);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    const texs = [[this.tProf, 'uProf'], [camTex || this.tProf, 'uCam'], [this.tEtiq, 'uEtiq'], [this.tPal, 'uPal'], [this.tAtlas, 'uAtlas']];
    texs.forEach(([t, n], i) => { gl.activeTexture(gl.TEXTURE0 + i); gl.bindTexture(gl.TEXTURE_2D, t); gl.uniform1i(u[n], i); });
    gl.uniformMatrix4fv(u.uProjInv, false, invertir(vista.projectionMatrix));
    gl.uniformMatrix4fv(u.uVistaMundo, false, vista.transform.matrix);
    gl.uniformMatrix4fv(u.uProfDesdeVista, false, this.profDesdeVista);
    gl.uniform2f(u.uRes, viewport.width, viewport.height); gl.uniform2fv(u.uAtlasN, this.atlasN);
    gl.uniform1f(u.uLetra, A.letra); gl.uniform1f(u.uPapel, A.papel ? 1 : 0); gl.uniform1f(u.uTieneCam, camTex ? 1 : 0);
    gl.uniform1f(u.uTieneEtiq, this.hayEtiq ? 1 : 0); gl.uniform1f(u.uVolteo, A.volteo ? 1 : 0); gl.uniform1f(u.uContraste, A.contraste);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.disable(gl.BLEND);
  }
  // la cámara reducida a W × H, leída a la memoria (para el ojo de escena)
  leerCamara(camTex, W, H, marcoActual) {
    const gl = this.gl;
    if (this.copiaW !== W || this.copiaH !== H) {
      gl.bindTexture(gl.TEXTURE_2D, this.tCopia); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, W, H, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.tCopia, 0);
      this.copiaW = W; this.copiaH = H; this.px = new Uint8ClampedArray(W * H * 4);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo); gl.viewport(0, 0, W, H);
    gl.useProgram(this.copia.p); gl.bindVertexArray(this.vao);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, camTex); gl.uniform1i(this.copia.u.uCam, 0);
    gl.uniform2f(this.copia.u.uRes, W, H); gl.uniform1f(this.copia.u.uVolteo, this.ajustes.volteo ? 1 : 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, this.px);
    gl.bindFramebuffer(gl.FRAMEBUFFER, marcoActual);
    return new ImageData(this.px.slice(), W, H);
  }
}

// inversa de una matriz 4×4 (columna mayor)
function invertir(m) {
  const r = new Float32Array(16), [a00, a01, a02, a03, a10, a11, a12, a13, a20, a21, a22, a23, a30, a31, a32, a33] = m;
  const b00 = a00 * a11 - a01 * a10, b01 = a00 * a12 - a02 * a10, b02 = a00 * a13 - a03 * a10, b03 = a01 * a12 - a02 * a11;
  const b04 = a01 * a13 - a03 * a11, b05 = a02 * a13 - a03 * a12, b06 = a20 * a31 - a21 * a30, b07 = a20 * a32 - a22 * a30;
  const b08 = a20 * a33 - a23 * a30, b09 = a21 * a32 - a22 * a31, b10 = a21 * a33 - a23 * a31, b11 = a22 * a33 - a23 * a32;
  const det = 1 / (b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06);
  r[0] = (a11 * b11 - a12 * b10 + a13 * b09) * det; r[1] = (a02 * b10 - a01 * b11 - a03 * b09) * det;
  r[2] = (a31 * b05 - a32 * b04 + a33 * b03) * det; r[3] = (a22 * b04 - a21 * b05 - a23 * b03) * det;
  r[4] = (a12 * b08 - a10 * b11 - a13 * b07) * det; r[5] = (a00 * b11 - a02 * b08 + a03 * b07) * det;
  r[6] = (a32 * b02 - a30 * b05 - a33 * b01) * det; r[7] = (a20 * b05 - a22 * b02 + a23 * b01) * det;
  r[8] = (a10 * b10 - a11 * b08 + a13 * b06) * det; r[9] = (a01 * b08 - a00 * b10 - a03 * b06) * det;
  r[10] = (a30 * b04 - a31 * b02 + a33 * b00) * det; r[11] = (a21 * b02 - a20 * b04 - a23 * b00) * det;
  r[12] = (a11 * b07 - a10 * b09 - a12 * b06) * det; r[13] = (a00 * b09 - a01 * b07 + a02 * b06) * det;
  r[14] = (a31 * b01 - a30 * b03 - a32 * b00) * det; r[15] = (a20 * b03 - a21 * b01 + a22 * b00) * det;
  return r;
}
