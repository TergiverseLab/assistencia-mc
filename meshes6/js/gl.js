// gl.js — utilidades WebGL2: programas, texturas, objetivos de dibujo.
export function programa(gl, vs, fs) {
  const p = gl.createProgram();
  for (const [t, src] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]]) {
    const s = gl.createShader(t); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) + '\n' + src.split('\n').slice(0, 6).join('\n'));
    gl.attachShader(p, s);
  }
  gl.linkProgram(p); if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  const u = {}; const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) { const nom = gl.getActiveUniform(p, i).name.replace('[0]', ''); u[nom] = gl.getUniformLocation(p, nom); }
  return { p, u };
}
export function textura(gl, filtro, w, h, interno, formato, tipo) {
  const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filtro); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filtro);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  if (w) gl.texImage2D(gl.TEXTURE_2D, 0, interno, w, h, 0, formato, tipo, null);
  return t;
}
export function objetivo(gl, texturas, conZ, w, h) {
  const f = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, f);
  texturas.forEach((t, i) => gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + i, gl.TEXTURE_2D, t, 0));
  gl.drawBuffers(texturas.map((_, i) => gl.COLOR_ATTACHMENT0 + i));
  if (conZ) { const z = gl.createRenderbuffer(); gl.bindRenderbuffer(gl.RENDERBUFFER, z); gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, w, h); gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, z); }
  if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error('tu tarjeta gráfica no admite el formato que necesita el datamosh');
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return f;
}
export const VS_PANTALLA = `#version 300 es
const vec2 P[3] = vec2[3](vec2(-1.,-1.), vec2(3.,-1.), vec2(-1.,3.));
out vec2 uv;
void main(){ gl_Position = vec4(P[gl_VertexID], 0., 1.); uv = P[gl_VertexID] * .5 + .5; }`;
// la película dentro de su archivo: 4:3 con bandas negras a los lados y una marca de agua arriba a la derecha.
// p: coordenadas 0..1 del fotograma 4:3, con la fila 0 arriba.
export const GLSL_FOTO = `
vec3 foto(sampler2D t, vec2 p){
  if (p.x > .86 && p.y < .125) p.x = .85;            // la marca de agua se tapa arrastrando la columna de al lado
  return texture(t, vec2(.1 + p.x * .8, p.y)).rgb; // sin las bandas negras
}`;
