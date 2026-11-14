// tipos.js — la tipografía del bosque caligramático, tal cual.
// En el bosque cada clase de cosa tiene su letra: un cuerpo de Courier (6–11 px sobre una rejilla de 11 px),
// redonda, cursiva o negrita, y un paso de columnas/filas (1 = cada celda, 2 = una sí y otra no…).
// Aquí la cámara no ve árboles ni casetas, ve lo que el detector cree que ve; a cada clase COCO le toca,
// de forma estable, una de las letras del bosque. El fondo (lo que no se reconoce) es la hierba: 7 px.
//
// Formato de cada tipo: [estilo, cuerpo en px (sobre rejilla de 11), paso de columnas, paso de filas]

export const REJILLA = 11; // FSIZE del bosque: alto de letra de la rejilla en px CSS a tamaño 1
export const FAMILIA = '"Courier New","Courier Prime",monospace';

// los tipos del bosque (TC), en el mismo orden de rareza
export const TIPOS_BOSQUE = [
  ['italic', 10, 1, 1], // árboles
  ['', 11, 2, 2],
  ['', 9, 2, 1],
  ['', 10, 2, 2],
  ['italic', 9, 1, 3],
  ['', 10, 1, 1],
  ['italic', 10, 1, 1],
  ['', 9, 1, 2],
  ['bold', 10, 1, 1],
  ['', 9, 2, 2],
  ['italic', 8, 1, 2],
  ['', 9, 1, 1],
  ['bold', 10, 1, 1],
  ['', 11, 1, 1]
];
export const TIPO_FONDO = ['', 7, 1, 1]; // la hierba / el suelo
export const TIPO_PERSONA = ['italic', 10, 1, 1]; // los cuerpos, como los árboles

// cada clase recibe siempre la misma letra
function hash(s) { let h = 2166136261; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
export function tipoDe(etiqueta) {
  if (etiqueta === 'person') return TIPO_PERSONA;
  return TIPOS_BOSQUE[1 + (hash(etiqueta) % (TIPOS_BOSQUE.length - 1))];
}

// tabla de tipos indexada (el búfer guarda el índice, como el R del bosque)
export const TABLA = [null, TIPO_FONDO, TIPO_PERSONA, ...TIPOS_BOSQUE];
export function indiceTipo(t) { return TABLA.indexOf(t); }

export function fuente(t, escala) {
  return `${t[0] ? t[0] + ' ' : ''}${Math.round(t[1] * escala * 10) / 10}px ${FAMILIA}`;
}
