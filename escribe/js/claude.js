// claude.js — mirar con Claude: un fotograma va, una descripción vuelve, palabra a palabra (streaming).
// Se llama a la API de Anthropic directamente desde el navegador con la clave del propio usuario, que se guarda
// solo en su móvil (la cabecera anthropic-dangerous-direct-browser-access lo permite).
// El modelo no se adivina: al empezar se pregunta a la API qué modelos hay y se toma el Haiku (rápido) o el
// Sonnet (mejor escritura) más reciente.
const API = 'https://api.anthropic.com/v1';
const cabeceras = (clave) => ({
  'x-api-key': clave, 'anthropic-version': '2023-06-01', 'content-type': 'application/json',
  'anthropic-dangerous-direct-browser-access': 'true'
});

export async function elegirModelos(clave) {
  const r = await fetch(`${API}/models?limit=100`, { headers: cabeceras(clave) });
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error((e.error && e.error.message) || `la API respondió ${r.status}`); }
  const ids = (await r.json()).data.map((m) => m.id); // de más reciente a más antiguo
  return { rapido: ids.find((i) => i.includes('haiku')) || ids[0], bueno: ids.find((i) => i.includes('sonnet')) || ids[0] };
}

const TONOS = {
  preciso: 'Describe con exactitud lo que hay, en prosa limpia y concreta: objetos, materias, luz, colores, gestos. Sin metáforas gratuitas.',
  poetico: 'Describe lo que hay con exactitud, pero en prosa poética: que cada objeto real aparezca, transfigurado por una mirada atenta, con imágenes precisas y sonoras.',
  delirante: 'Parte de lo que realmente hay y deja que la imagen se desborde: asociaciones libres, metáforas audaces, lo visible abriéndose a lo que no se ve. Que lo real siga reconociéndose.'
};

export function instrucciones(tono, voz) {
  return [
    'Eres los ojos de una cámara que escribe. Recibes lo que ve la cámara de un móvil en este instante.',
    TONOS[tono] || TONOS.poetico,
    voz ? `Escribe ${voz}.` : '',
    'En castellano. Una o dos frases, como mucho 35 palabras. Sin introducción, sin comillas, sin títulos.',
    'No menciones la cámara, la foto, la imagen ni el encuadre: habla de las cosas mismas.',
    'Si te doy la frase anterior y la escena es parecida, no la repitas: desplaza la mirada a otro detalle.'
  ].filter(Boolean).join(' ');
}

// mira un fotograma (JPEG en base64) y va entregando el texto a medida que llega
export async function describir({ clave, modelo, sistema, imagen, anterior, alTexto, senal }) {
  const contenido = [{ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: imagen } }];
  contenido.push({ type: 'text', text: anterior ? `Frase anterior: «${anterior}». Ahora:` : 'Ahora:' });
  const r = await fetch(`${API}/messages`, {
    method: 'POST', headers: cabeceras(clave), signal: senal,
    body: JSON.stringify({ model: modelo, max_tokens: 160, stream: true, system: sistema, messages: [{ role: 'user', content: contenido }] })
  });
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error((e.error && e.error.message) || `la API respondió ${r.status}`); }
  const lector = r.body.getReader(), dec = new TextDecoder();
  let resto = '', texto = '';
  for (;;) {
    const { done, value } = await lector.read(); if (done) break;
    resto += dec.decode(value, { stream: true });
    const lineas = resto.split('\n'); resto = lineas.pop();
    for (const l of lineas) {
      if (!l.startsWith('data:')) continue;
      let ev; try { ev = JSON.parse(l.slice(5)); } catch (e) { continue; }
      if (ev.type === 'content_block_delta' && ev.delta && ev.delta.type === 'text_delta') { texto += ev.delta.text; alTexto(texto); }
      else if (ev.type === 'error') throw new Error(ev.error && ev.error.message || 'error de la API');
    }
  }
  return texto.trim();
}
