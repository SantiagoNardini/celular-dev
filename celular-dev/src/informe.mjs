// Arma el informe para pegarle a una IA (Claude, ChatGPT, Copilot...) y que arregle los errores:
// qué celular, qué sitio, cada error con su explicación, el detalle técnico y dónde ocurrió.
import { t } from './idioma.mjs';

// red y revision.red: normal | lenta | sin-conexion
export function armarInforme({ sitio, celular, errores, revision = null, red = 'normal', capturas, fecha }) {
  const graves = errores.filter(e => e.nivel === 'error');
  const avisos = errores.filter(e => e.nivel === 'aviso');
  const r = [];
  r.push(`# ${t('informe.titulo')}`);
  r.push('');
  for (const linea of t('informe.paraLaIa').split('\n')) r.push(`> ${linea}`);
  r.push('');
  r.push(`## ${t('informe.contexto')}`);
  r.push('');
  r.push(`- ${t('informe.fecha')}: ${fecha}`);
  r.push(`- ${t('informe.sitio')}: ${sitio.descripcion}`);
  r.push(`- ${t('informe.celular')}: ${celular.modelo || t('informe.desconocido')}${celular.android ? `, Android ${celular.android}` : ''}`);
  if (celular.navegador) r.push(`- ${t('informe.navegador')}: ${celular.navegador}`);
  if (celular.pantalla) r.push(`- ${t('informe.pantalla')}: ${celular.pantalla}`);
  if (red !== 'normal') r.push(`- ${t('informe.redSimulada')}: ${t(`red.${red}`)}`);
  r.push('');
  const problemasRevision = revision ? revision.puntos.filter(p => p.nivel !== 'ok') : [];
  if (!errores.length && !problemasRevision.length) {
    r.push(revision ? t('informe.nadaConRevision') : t('informe.nada'));
    return r.join('\n') + '\n';
  }
  const bloque = (titulo, lista) => {
    if (!lista.length) return;
    r.push(`## ${titulo} (${lista.length})`);
    r.push('');
    lista.forEach((e, i) => {
      r.push(`### ${i + 1}. ${e.simple}`);
      r.push('');
      r.push(`- ${t('informe.mensajeTecnico')}: \`${e.texto.replace(/`/g, "'")}\``);
      if (e.donde) r.push(`- ${t('informe.donde')}: \`${e.donde}\``);
      r.push(`- ${t('informe.veces', { veces: e.veces, ultima: e.ultima })}`);
      r.push('');
    });
  };
  bloque(t('informe.errores'), graves);
  bloque(t('informe.avisos'), avisos);
  if (problemasRevision.length) {
    r.push(`## ${t('informe.revision')} (${problemasRevision.length})`);
    r.push('');
    r.push(revision.red !== 'normal' ? t('informe.medidoConRed', { hora: revision.hora, red: t(`red.${revision.red}`) }) : t('informe.medido', { hora: revision.hora }));
    r.push('');
    problemasRevision.forEach((p, i) => {
      r.push(`${i + 1}. ${p.nivel === 'error' ? `**${t('informe.error')}:** ` : ''}${p.simple}`);
      for (const e of p.ejemplos) r.push(`   - \`${e.replace(/`/g, "'")}\``);
    });
    r.push('');
  }
  if (capturas.length) {
    r.push(`## ${t('informe.capturas')}`);
    r.push('');
    capturas.forEach(c => r.push(`- ${c}`));
    r.push('');
  }
  return r.join('\n') + '\n';
}
