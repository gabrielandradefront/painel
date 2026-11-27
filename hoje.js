/* ========================================================
   HOJE.JS - COCKPIT OPERACIONAL E RESUMOS DIÁRIOS
   ARGOS OPS
======================================================== */

function viewHoje() {
  const termosBusca = typeof getBuscaTermos === 'function' ? getBuscaTermos() : [];
  const formasEnvioList = typeof getPresetList === 'function'
    ? getPresetList('operacao', 'formasEnvio')
    : ['WhatsApp', 'E-mail', 'Drive', 'Impresso', 'Servidor / Rede'];
  const optEnvioHtml = (sel = '') => typeof renderPresetSelectOptions === 'function'
    ? renderPresetSelectOptions(formasEnvioList, sel, 'Forma de envio...', true)
    : `<option value="">Forma de envio...</option>` + formasEnvioList.map(v => `<option value="${esc(v)}" ${norm(v) === norm(sel) ? 'selected' : ''}>${esc(v)}</option>`).join('');
  const btnAddEnvio = typeof presetGearBtn === 'function'
    ? presetGearBtn('operacao', 'formasEnvio', '+', 'Gerenciar Formas de Envio de Material')
    : '';

  const aulasConf = S.aulas.filter(a => {
    if (a.dia < hoje) return false;
    const cDia = dataConfirmacaoAula(a.dia);
    if (!(cDia === hoje || (cDia < hoje && !a.confirmada))) return false;
    if (!termosBusca.length) return true;
    const profCorpus = typeof expandirCorpusProfessor === 'function' ? expandirCorpusProfessor(a.prof) : (a.prof || '');
    return matchBusca(`${profCorpus} ${a.turma} ${a.desc} ${a.turno} ${br(a.dia)} ${wd(a.dia)} ${a.hora}`, termosBusca);
  });
  aulasConf.sort((a, b) => (a.dia + a.hora).localeCompare(b.dia + b.hora));
  const confPendentes = aulasConf.filter(a => !a.confirmada);
  const G = groups(mon(0), addD(mon(0), 6));
  const pendDocs = (typeof docDone === 'function' ? G.filter(g => !docDone(g)) : []).filter(g => {
    if (!termosBusca.length) return true;
    const aulasCorpus = g.aulas.map(a => `${a.turma} ${a.hora} ${a.desc}`).join(' ');
    const profCorpus = typeof expandirCorpusProfessor === 'function' ? expandirCorpusProfessor(g.prof) : (g.prof || '');
    return matchBusca(`${profCorpus} ${br(g.dia)} ${wd(g.dia)} ${aulasCorpus}`, termosBusca);
  });
  const repPend = S.reparos.filter(r => {
    if (r.status === 'Concluído') return false;
    if (!termosBusca.length) return true;
    return matchBusca(`${r.local} ${r.item} ${r.obs} ${r.resp} ${r.status}`, termosBusca);
  });
  const orcAguardando = (S.orc.itens || []).filter(i => {
    if (i.status !== 'Aguardando aprovação') return false;
    if (!termosBusca.length) return true;
    return matchBusca(`${i.forn} ${i.nome} ${i.obs} ${S.orc.titulo} ${i.status}`, termosBusca);
  });
  const orcProblema = (S.orc.itens || []).filter(i => {
    if (i.status !== 'Com problema') return false;
    if (!termosBusca.length) return true;
    return matchBusca(`${i.forn} ${i.nome} ${i.obs} ${S.orc.titulo} ${i.status}`, termosBusca);
  });

  // Próximo envio de materiais
  const pendentesGeral = S.aulas.filter(a => a.dia >= hoje && !a.materialPronto);

  let proximaDataEntrega = null;
  let matsEnvio = [];

  if (pendentesGeral.length) {
    const prazosPendentes = [...new Set(pendentesGeral.map(a => prazoEntregaMaterial(a.dia)))].sort();
    proximaDataEntrega = prazosPendentes[0];
    const condicaoPrazo = proximaDataEntrega <= hoje 
      ? a => prazoEntregaMaterial(a.dia) <= hoje 
      : a => prazoEntregaMaterial(a.dia) === proximaDataEntrega;
    matsEnvio = S.aulas.filter(a => a.dia >= hoje && ((condicaoPrazo(a) && !a.materialPronto) || a.materialConcluidoEm === hoje));
  } else {
    matsEnvio = S.aulas.filter(a => a.dia >= hoje && a.materialConcluidoEm === hoje);
  }

  if (termosBusca.length) {
    matsEnvio = matsEnvio.filter(a => {
      const profCorpus = typeof expandirCorpusProfessor === 'function' ? expandirCorpusProfessor(a.prof) : (a.prof || '');
      return matchBusca(`${a.turma} ${a.desc} ${profCorpus} ${a.formaEnvio} ${br(a.dia)} ${wd(a.dia)} ${a.hora}`, termosBusca);
    });
  }

  matsEnvio.sort((a, b) => (a.dia + a.hora).localeCompare(b.dia + b.hora));
  const matsEnvioPendentes = matsEnvio.filter(a => !a.materialPronto);
  const alertaVolume = matsEnvioPendentes.length >= 4;

  // Linhas resumidas limpas
  const matRowHoje = a => `
    <div class="row ${a.materialPronto ? 'done' : ''}" style="align-items: center; padding: 6px 8px;">
      <input type="checkbox" data-act="tog" data-l="aulas" data-id="${esc(a.id)}" data-f="materialPronto" ${a.materialPronto ? 'checked' : ''} title="Marcar material como enviado">
      <div class="t">
        <b>${esc(a.turma)}${a.desc ? ' — ' + esc(a.desc) : ''}</b>
        <span class="mu">Aula: <b>${wd(a.dia)} ${br(a.dia)}</b>${a.hora ? ' às ' + esc(a.hora) : ''} • Prof: ${esc(a.prof || 'A definir')}</span>
      </div>
      <div class="preset-field-wrap mat-envio-wrap">
        <select class="obs mat-envio-select" data-act="ae_sel" data-id="${esc(a.id)}" data-f="formaEnvio" title="Forma de envio do material" aria-label="Forma de envio do material">
          ${optEnvioHtml(a.formaEnvio || '')}
        </select>
        ${btnAddEnvio}
      </div>
      <button class="b hoje-fila-btn" data-act="ir_fila_material" data-turma="${esc(a.turma)}" title="Adicionar à fila de envio"><span class="ui-glyph" aria-hidden="true">▸</span> Fila</button>
    </div>
  `;

  const confRowHoje = a => `
    <div class="row ${a.confirmada ? 'done' : ''}" style="align-items: center; padding: 6px 8px;">
      <input type="checkbox" data-act="tog" data-l="aulas" data-id="${esc(a.id)}" data-f="confirmada" ${a.confirmada ? 'checked' : ''} title="Confirmar aula">
      <div class="t">
        <b>${esc(a.prof || 'Sem professor')} — ${esc(a.turma)}</b>
        <span class="mu">${wd(a.dia)} ${br(a.dia)}${a.hora ? ' às ' + esc(a.hora) : ''}${a.turno ? ' • ' + esc(a.turno) : ''}${a.desc ? ' — ' + esc(a.desc) : ''}</span>
      </div>
    </div>
  `;

  const reparoRowHoje = r => `
    <div class="row" style="padding: 5px 8px; font-size: 13px;">
      <div class="t">
        <b>${r.local ? `<span class="pill b" style="font-size:11px;padding:1px 6px;margin-right:4px">${esc(r.local)}</span>` : ''}${esc(r.item)}</b>
        ${r.obs ? `<span class="mu">${esc(r.obs)}</span>` : ''}
      </div>
    </div>
  `;

  const orcRowHoje = i => `
    <div class="row" style="padding: 5px 8px;">
      <div class="t">
        <b>${esc(i.forn || i.nome || 'Fornecedor')} — ${brl(itemTotal(i))}</b>
        <span class="mu">${esc(i.obs || S.orc.titulo || 'Cotação')}</span>
      </div>
    </div>
  `;

  const docRowHoje = g => {
    const aulasStr = g.aulas.map(a => esc(a.turma) + (a.hora ? ' ' + esc(a.hora) : '')).join(' + ');
    return `
      <div class="row" style="padding: 5px 8px; font-size: 13px;">
        <div class="t">
          <b>${esc(g.prof)} — ${wd(g.dia)} ${br(g.dia)}</b>
          <span class="mu">${aulasStr}</span>
        </div>
        <button class="b" data-act="cpdoc" data-k="${esc(g.k)}" style="font-size: 11px; padding: 2px 7px;">Copiar</button>
      </div>
    `;
  };

  let stats = `
    <div class="grid">
      <div class="stat" data-act="goto_tab" data-tab="aulas" data-sub="import" style="cursor: pointer;" title="Ver cronogramas e materiais">
        <div style="display:flex; align-items:center; justify-content:space-between;">
          <b>${matsEnvioPendentes.length}</b>
          ${alertaVolume ? '<span class="pill w" style="font-size:10px; padding:1px 6px;">⚠\uFE0E 4+</span>' : ''}
        </div>
        <span class="mu">próximo envio de materiais &rarr;</span>
      </div>
      <div class="stat" data-act="goto_tab" data-tab="aulas" data-sub="quadro" style="cursor: pointer;" title="Ver quadro geral de aulas">
        <b>${confPendentes.length}</b>
        <span class="mu">confirmações pendentes &rarr;</span>
      </div>
      <div class="stat" data-act="goto_tab" data-tab="semana" data-sub="reparos" style="cursor: pointer;" title="Ir para Manutenções">
        <b>${repPend.length}</b>
        <span class="mu">reparos abertos &rarr;</span>
      </div>
      <div class="stat" data-act="goto_tab" data-tab="orc" style="cursor: pointer;" title="Ir para Orçamento">
        <b>${orcAguardando.length}</b>
        <span class="mu">orçamentos aguardando &rarr;</span>
      </div>
      <div class="stat" data-act="goto_tab" data-tab="semana" data-sub="docs" style="cursor: pointer;" title="Ir para Recibos Docentes">
        <b>${typeof docPend === 'function' ? docPend(G) : 0}</b>
        <span class="mu">recibos pendentes &rarr;</span>
      </div>
    </div>
  `;

  let rotuloEnvio = 'Próximo Envio de Materiais';
  if (proximaDataEntrega) {
    if (proximaDataEntrega < hoje) rotuloEnvio = 'Próximo Envio — Pendências Atrasadas';
    else if (proximaDataEntrega === hoje) rotuloEnvio = 'Próximo Envio — Entrega Hoje';
    else if (proximaDataEntrega === amanha) rotuloEnvio = `Próximo Envio — Entrega Amanhã (${br(proximaDataEntrega)})`;
    else rotuloEnvio = `Próximo Envio — Entrega ${wd(proximaDataEntrega)} (${br(proximaDataEntrega)})`;
  }

  const linkTitulo = (texto, tabDest, subDest) => `
    <span data-act="goto_tab" data-tab="${tabDest}" ${subDest ? `data-sub="${subDest}"` : ''} style="cursor:pointer; display:inline-flex; align-items:center; gap:6px;">
      ${texto} <span style="font-size:12px; color:var(--ac);">&rarr;</span>
    </span>
  `;

  const bannerAlerta = alertaVolume
    ? `<div style="display:flex; align-items:center; gap:8px; padding:6px 10px; margin-bottom:8px; background:var(--wr-light); border:1px solid rgba(245, 158, 11, 0.25); border-radius:8px; font-size:12px; color:var(--wr); font-weight:500;">
         <span class="ui-glyph" style="color:inherit;" aria-hidden="true">⚠\uFE0E</span> <span><b>Alerta de volume:</b> Há ${matsEnvioPendentes.length} materiais pendentes neste envio.</span>
       </div>`
    : '';

  let htmlMats = card(
    linkTitulo(rotuloEnvio, 'aulas', 'import'),
    matsEnvio.length
      ? `${bannerAlerta}<div style="max-height: 250px; overflow-y: auto;">${matsEnvio.map(matRowHoje).join('')}</div>`
      : `<div class="empty" style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:8px;"><span>${termosBusca.length ? 'Nenhum material correspondente ao filtro atual.' : 'Todos os materiais futuros estão em dia!'}</span>${btnAddEnvio ? `<span style="display:inline-flex; align-items:center; gap:6px; font-size:12px;">Formas de envio: ${btnAddEnvio}</span>` : ''}</div>`,
    matsEnvioPendentes.length
  );

  let htmlConf = card(
    linkTitulo('Confirmações de Aula', 'aulas', 'quadro'),
    aulasConf.length
      ? `<div style="max-height: 240px; overflow-y: auto;">${aulasConf.map(confRowHoje).join('')}</div>`
      : `<div class="empty">${termosBusca.length ? 'Nenhuma confirmação encontrada neste filtro.' : 'Nenhuma aula pendente de confirmação para hoje.'}</div>`,
    confPendentes.length
  );

  let htmlReps = card(
    linkTitulo('Reparos e Manutenções Abertas', 'semana', 'reparos'),
    repPend.length 
      ? `<div style="max-height: 180px; overflow-y: auto;">${repPend.map(reparoRowHoje).join('')}</div>`
      : `<div class="empty" style="padding: 6px 0;">${termosBusca.length ? 'Nenhum chamado encontrado neste filtro.' : 'Nenhum chamado aberto!'}</div>`, 
    repPend.length
  );

  const orcLista = orcAguardando.concat(orcProblema);
  let htmlOrc = card(
    linkTitulo('Cotações e Orçamento que precisam de atenção', 'orc', ''),
    orcLista.length
      ? `<div style="max-height: 160px; overflow-y: auto;">${orcLista.map(orcRowHoje).join('')}</div>`
      : `<div class="empty">${termosBusca.length ? 'Nenhum orçamento encontrado neste filtro.' : 'Nenhum orçamento com pendência.'}</div>`, 
    orcLista.length
  );

  let htmlDocs = card(
    linkTitulo('Recibos Docentes Pendentes (esta semana)', 'semana', 'docs'),
    pendDocs.length
      ? `<div style="max-height: 200px; overflow-y: auto;">${pendDocs.map(docRowHoje).join('')}</div>`
      : `<div class="empty">${termosBusca.length ? 'Nenhum recibo encontrado neste filtro.' : 'Tudo em dia para a semana atual.'}</div>`,
    pendDocs.length
  );

  return stats + `
    <div class="hoje-columns">
      <div class="col-main">
        ${htmlMats}
        ${htmlConf}
      </div>
      <div class="col-side">
        ${htmlReps}
        ${htmlOrc}
        ${htmlDocs}
      </div>
    </div>
  `;
}

if (typeof PriusBus !== 'undefined') {
  PriusBus.register('hoje', ['core', 'operacional']);
}