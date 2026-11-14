// atlas.js — las letras del bosque, dibujadas una vez en una lámina para la tarjeta gráfica.
// Cuatro filas (redonda, cursiva, negrita, negrita cursiva) de Courier; cada casilla tiene la proporción de la
// celda del bosque (avance 0,6 em × interlínea 1,25 em) y la letra apoyada arriba, como textBaseline 'top'.
export const CASILLA_W = 48, CASILLA_H = 100, CUERPO = 80;
const ESTILOS = ['', 'italic ', 'bold ', 'italic bold '];
const FAMILIA = '"Courier Prime","Courier New",monospace';

export function crearAtlas(caracteres) {
  const lista = [' ', ...[...new Set(caracteres)].filter((c) => c !== ' ')];
  const indice = new Map(lista.map((c, i) => [c, i]));
  const cv = document.createElement('canvas');
  cv.width = lista.length * CASILLA_W; cv.height = ESTILOS.length * CASILLA_H;
  const cx = cv.getContext('2d');
  cx.fillStyle = '#000'; cx.fillRect(0, 0, cv.width, cv.height);
  cx.fillStyle = '#fff'; cx.textBaseline = 'top'; cx.textAlign = 'left';
  ESTILOS.forEach((e, fila) => {
    cx.font = `${e}${CUERPO}px ${FAMILIA}`;
    lista.forEach((c, i) => { cx.fillText(c, i * CASILLA_W, fila * CASILLA_H + 2); });
  });
  return { canvas: cv, indice, columnas: lista.length, filas: ESTILOS.length };
}
