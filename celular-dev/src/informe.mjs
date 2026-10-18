// Arma el informe para pegarle a una IA (Claude, ChatGPT, Copilot...) y que arregle los errores:
// qué celular, qué sitio, cada error con su explicación, el detalle técnico y dónde ocurrió.

export function armarInforme({ sitio, celular, errores, revision = null, red = 'normal', capturas, fecha }) {
  const graves = errores.filter(e => e.nivel === 'error');
  const avisos = errores.filter(e => e.nivel === 'aviso');
  const r = [];
  r.push('# Errores encontrados en el celular');
  r.push('');
  r.push('> Para la IA: estos errores ocurrieron al abrir el sitio en un celular Android real. Encontrá la causa');
  r.push('> de cada uno en el código del proyecto y arreglala, empezando por los errores (los avisos después).');
  r.push('> Cuando termines, decí qué cambiaste en cada archivo.');
  r.push('');
  r.push('## Contexto');
  r.push('');
  r.push(`- Fecha: ${fecha}`);
  r.push(`- Sitio: ${sitio.descripcion}`);
  r.push(`- Celular: ${celular.modelo || 'desconocido'}${celular.android ? `, Android ${celular.android}` : ''}`);
  if (celular.navegador) r.push(`- Navegador: ${celular.navegador}`);
  if (celular.pantalla) r.push(`- Pantalla del sitio: ${celular.pantalla}`);
  if (red !== 'normal') r.push(`- Red simulada: ${red}`);
  r.push('');
  const problemasRevision = revision ? revision.puntos.filter(p => p.nivel !== 'ok') : [];
  if (!errores.length && !problemasRevision.length) {
    r.push(revision ? 'No hubo errores ni avisos, y la revisión del sitio no encontró problemas.' : 'No hubo errores ni avisos desde que se abrió el sitio.');
    return r.join('\n') + '\n';
  }
  const bloque = (titulo, lista) => {
    if (!lista.length) return;
    r.push(`## ${titulo} (${lista.length})`);
    r.push('');
    lista.forEach((e, i) => {
      r.push(`### ${i + 1}. ${e.simple}`);
      r.push('');
      r.push(`- Mensaje técnico: \`${e.texto.replace(/`/g, "'")}\``);
      if (e.donde) r.push(`- Dónde: \`${e.donde}\``);
      r.push(`- Veces: ${e.veces} (la última a las ${e.ultima})`);
      r.push('');
    });
  };
  bloque('Errores', graves);
  bloque('Avisos', avisos);
  if (problemasRevision.length) {
    r.push(`## Revisión del sitio en el celular (${problemasRevision.length})`);
    r.push('');
    r.push(`Medido a las ${revision.hora}${revision.red !== 'normal' ? `, con red ${revision.red}` : ''}.`);
    r.push('');
    problemasRevision.forEach((p, i) => {
      r.push(`${i + 1}. ${p.nivel === 'error' ? '**Error:** ' : ''}${p.simple}`);
      for (const e of p.ejemplos) r.push(`   - \`${e.replace(/`/g, "'")}\``);
    });
    r.push('');
  }
  if (capturas.length) {
    r.push('## Capturas del celular');
    r.push('');
    capturas.forEach(c => r.push(`- ${c}`));
    r.push('');
  }
  return r.join('\n') + '\n';
}
