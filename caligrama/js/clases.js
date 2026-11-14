// clases.js — las 150 cosas que el ojo sabe nombrar (ADE20K), en español, y la letra de cada una.
// El índice es el que devuelve el modelo SegFormer; el 150 es «lo aún no visto» (antes de que cargue el modelo).
export const NOMBRES = [
  'pared', 'edificio', 'cielo', 'suelo', 'árbol', 'techo', 'carretera', 'cama', 'ventana', 'hierba',
  'armario', 'acera', 'persona', 'tierra', 'puerta', 'mesa', 'montaña', 'planta', 'cortina', 'silla',
  'coche', 'agua', 'cuadro', 'sofá', 'estante', 'casa', 'mar', 'espejo', 'alfombra', 'campo',
  'butaca', 'asiento', 'valla', 'escritorio', 'roca', 'ropero', 'lámpara', 'bañera', 'barandilla', 'cojín',
  'base', 'caja', 'columna', 'letrero', 'cómoda', 'mostrador', 'arena', 'fregadero', 'rascacielos', 'chimenea',
  'nevera', 'tribuna', 'camino', 'escaleras', 'pista', 'vitrina', 'billar', 'almohada', 'mosquitera', 'escalinata',
  'río', 'puente', 'librería', 'persiana', 'mesita', 'váter', 'flor', 'libro', 'colina', 'banco',
  'encimera', 'fogón', 'palmera', 'isla de cocina', 'ordenador', 'silla giratoria', 'barca', 'barra', 'máquina recreativa', 'choza',
  'autobús', 'toalla', 'luz', 'camión', 'torre', 'araña', 'toldo', 'farola', 'cabina', 'televisor',
  'avión', 'pista de tierra', 'ropa', 'poste', 'terreno', 'pasamanos', 'escalera mecánica', 'puf', 'botella', 'aparador',
  'póster', 'escenario', 'furgoneta', 'barco', 'fuente', 'cinta', 'dosel', 'lavadora', 'juguete', 'piscina',
  'taburete', 'barril', 'cesta', 'cascada', 'tienda', 'bolsa', 'moto', 'cuna', 'horno', 'pelota',
  'comida', 'peldaño', 'depósito', 'marca', 'microondas', 'maceta', 'animal', 'bicicleta', 'lago', 'lavavajillas',
  'pantalla', 'manta', 'escultura', 'campana', 'aplique', 'jarrón', 'semáforo', 'bandeja', 'papelera', 'ventilador',
  'muelle', 'monitor', 'plato', 'monitor', 'tablón', 'ducha', 'radiador', 'vaso', 'reloj', 'bandera',
  'ojo'
];
export const SIN_VER = 150;

// La letra de cada cosa, al modo de la tabla de tipos del bosque: estilo (0 redonda, 1 cursiva, 2 negrita,
// 3 negrita cursiva) y cuerpo relativo a la rejilla (11 = la celda entera). Las superficies grandes van en
// redonda de 11, que es la que mejor dibuja la imagen; las personas en la cursiva de los árboles del bosque;
// cada objeto recibe, siempre la misma, una de las variantes del bosque.
const SUPERFICIES = new Set([0, 1, 2, 3, 5, 6, 9, 11, 13, 16, 21, 26, 29, 46, 52, 94]);
const VARIANTES = [[1, 10], [2, 10], [0, 10], [1, 11], [3, 10], [2, 11], [0, 9], [1, 9]];
export function letraDe(k) {
  if (k === 12) return [1, 11];
  if (SUPERFICIES.has(k) || k === SIN_VER) return [0, 11];
  return VARIANTES[(k * 7 + 3) % VARIANTES.length];
}

// El otro ojo (CenterNet, 80 objetos COCO): sus nombres van detrás, a partir de la fila 151.
export const COCO_EN = ["person","bicycle","car","motorcycle","airplane","bus","train","truck","boat","traffic light","fire hydrant","stop sign","parking meter","bench","bird","cat","dog","horse","sheep","cow","elephant","bear","zebra","giraffe","backpack","umbrella","handbag","tie","suitcase","frisbee","skis","snowboard","sports ball","kite","baseball bat","baseball glove","skateboard","surfboard","tennis racket","bottle","wine glass","cup","fork","knife","spoon","bowl","banana","apple","sandwich","orange","broccoli","carrot","hot dog","pizza","donut","cake","chair","couch","potted plant","bed","dining table","toilet","tv","laptop","mouse","remote","keyboard","cell phone","microwave","oven","toaster","sink","refrigerator","book","clock","vase","scissors","teddy bear","hair drier","toothbrush"];
export const COCO_ES = ["persona","bicicleta","coche","moto","avión","autobús","tren","camión","barco","semáforo","hidrante","señal","parquímetro","banco","pájaro","gato","perro","caballo","oveja","vaca","elefante","oso","cebra","jirafa","mochila","paraguas","bolso","corbata","maleta","disco","esquís","tabla","pelota","cometa","bate","guante","monopatín","tabla de surf","raqueta","botella","copa","taza","tenedor","cuchillo","cuchara","cuenco","plátano","manzana","bocadillo","naranja","brócoli","zanahoria","salchicha","pizza","rosquilla","pastel","silla","sofá","maceta","cama","mesa","retrete","televisor","ordenador","ratón","mando","teclado","móvil","microondas","horno","tostadora","fregadero","nevera","libro","reloj","jarrón","tijeras","peluche","secador","cepillo"];
export const COCO_0 = NOMBRES.length; // 151
export const TODAS = [...NOMBRES, ...COCO_ES];
export function letraDeFila(k) { return k >= COCO_0 ? (k === COCO_0 ? [1, 11] : VARIANTES[(k * 5 + 1) % VARIANTES.length]) : letraDe(k); }
