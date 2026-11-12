/* ========================================================
   APP.JS - ORQUESTRADOR CENTRAL, CONFIGURAÇÕES E EVENTOS
   Painel Operacional Prius
======================================================== */

// --- BACKUP E RESTAURAÇÃO ---
async function salvarArquivo(nome, dados, tipo) {
  try {
    const dl = (window.claude && claude.use) ? await claude.use('downloads') : null;
    if (dl) { await dl.save({ filename: nome, data: dados }); return true; }
  } catch (e) {
    if (e && e.code === 'declined') return false;
  }
  const blob = new Blob([dados], { type: tipo || 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a'); link.href = url; link.download = nome;
  document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1200);
  return true;
}

function baixarBackup(prefixo = 'backup-painel') {
  const agora = new Date(), carimbo = `${iso(agora)}_${pad(agora.getHours())}h${pad(agora.getMinutes())}`;
  S.meta.ultimoBackup = agora.toISOString(); 
  save();
  const texto = JSON.stringify(S, null, 2);
  return salvarArquivo(`${prefixo}-${carimbo}.json`, new TextEncoder().encode(texto), 'application/json');
}

function processarRestauracao(arquivo) {
  const leitor = new FileReader();
  leitor.onload = function(e) {
    try {
      const dados = JSON.parse(e.target.result);
      if (!dados || typeof dados !== 'object' || (!dados.aulas && !dados.reparos)) return alert('Backup inválido.');
      if (!confirm('ATENÇÃO: Deseja restaurar este backup?\nUma cópia de segurança automática será guardada antes de prosseguir.')) return;
      localStorage.setItem(KEY + '-snapshot-emergencia', JSON.stringify({ data: new Date().toISOString(), dados: S }));
      S = dados; 
      ['aulas', 'reparos', 'hist', 'orcHist', 'fornecedores', 'apelidos', 'filaMateriais', 'lembretes'].forEach(k => { if (!Array.isArray(S[k])) S[k] = []; }); 
      S.docs = S.docs || {}; 
      S.cat = S.cat || {}; 
      S.meta = S.meta || {}; 
      S.meta.ultimaRestauracao = new Date().toISOString();
      save(); 
      render(); 
      alert('Dados restaurados com sucesso!');
    } catch (err) { alert('Erro ao ler: ' + err.message); }
  };
  leitor.readAsText(arquivo);
}

function reverterSnapshot() {
  try {
    const raw = localStorage.getItem(KEY + '-snapshot-emergencia');
    if (!raw) return alert('Sem cópia anterior.');
    const snap = JSON.parse(raw);
    if (confirm(`Restaurar cópia gerada em ${new Date(snap.data).toLocaleString('pt-BR')}?`)) { 
      S = snap.dados; 
      save(); 
      render(); 
      alert('Restauração desfeita com sucesso!'); 
    }
  } catch (e) { alert('Erro: ' + e.message); }
}

// --- ABA CONFIGURAÇÕES ---
function viewConfig() {
  const st = getStorageUsage();
  const totalAulas = S.aulas.length;
  const passadas = S.aulas.filter(a => a.dia < hoje).length;
  const reparosConcluidos = S.reparos.filter(r => r.status === 'Concluído').length;
  const orcHistQtd = (S.orcHist || []).length;

  const ultBackup = S.meta && S.meta.ultimoBackup ? new Date(S.meta.ultimoBackup).toLocaleString('pt-BR') : 'Sem registo recente';
  const ultRest = S.meta && S.meta.ultimaRestauracao ? new Date(S.meta.ultimaRestauracao).toLocaleString('pt-BR') : 'Sem restauração recente';
  const snapRaw = localStorage.getItem(KEY + '-snapshot-emergencia');
  let snapTxt = ''; 
  if (snapRaw) { try { snapTxt = new Date(JSON.parse(snapRaw).data).toLocaleString('pt-BR'); } catch (e) {} }

  let storageHtml = `
    <div style="margin-bottom: 14px;">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; flex-wrap:wrap; gap:6px;">
        <b>Espaço Consumido no Navegador</b>
        <span class="pill ${st.pct > 75 ? 'e' : (st.pct > 40 ? 'w' : 'o')}" style="font-size:12px; padding:3px 10px;">
          ${st.kb} KB de ~${st.maxKb} KB (${st.pct}%)
        </span>
      </div>
      <div style="width:100%; height:10px; background:var(--bd); border-radius:999px; overflow:hidden;">
        <div style="width:${Math.max(1, st.pct)}%; height:100%; background: ${st.pct > 75 ? 'var(--er)' : (st.pct > 40 ? 'var(--wr)' : 'var(--ac)')}; transition:width 0.3s ease;"></div>
      </div>
      <div class="mu" style="font-size:12.5px; margin-top:8px;">
        Total armazenado: <b>${totalAulas}</b> aulas (${passadas} passadas), <b>${S.reparos.length}</b> manutenções (${reparosConcluidos} concluídas) e <b>${orcHistQtd}</b> cotações arquivadas.
      </div>
    </div>

    <h3 style="margin-top:16px;">Opções Seguras de Limpeza</h3>
    <div class="mu" style="margin-bottom:10px; font-size:12.5px;">
      Libere espaço removendo apenas registros antigos sem afetar as aulas futuras ou o funcionamento do painel:
    </div>

    <div class="fx" style="gap:8px;">
      <button class="b" data-act="limpar_aulas_passadas" ${passadas === 0 ? 'disabled' : ''} title="Remove aulas com datas anteriores a hoje">
        🧹 Limpar Aulas Passadas (${passadas})
      </button>
      <button class="b" data-act="limpar_reparos_concluidos" ${reparosConcluidos === 0 ? 'disabled' : ''} title="Remove chamados que já foram finalizados">
        🧹 Limpar Manutenções Concluídas (${reparosConcluidos})
      </button>
      <button class="b" data-act="limpar_orchist" ${orcHistQtd === 0 ? 'disabled' : ''} title="Remove histórico de orçamentos antigos">
        🧹 Limpar Cotações Arquivadas (${orcHistQtd})
      </button>
      <button class="b danger" data-act="reset_seguro_total" title="Baixa um backup preventivo no ato antes de redefinir">
        ⚠️ Redefinição Total (com Backup Automático)
      </button>
    </div>
  `;

  let backupHtml = `
    <div class="grid" style="margin-bottom:12px;">
      <div class="stat"><b>Último backup</b><span class="mu">${ultBackup}</span></div>
      <div class="stat"><b>Última restauração</b><span class="mu">${ultRest}</span></div>
    </div>
    <div class="fx" style="margin-bottom:14px;">
      <button class="b p" data-act="bkp_download">📥 Exportar Cópia de Segurança (.json)</button>
    </div>
    <div class="mu" style="margin-bottom:6px;"><b>Restaurar de arquivo .json:</b></div>
    <input type="file" id="arquivoBackup" accept=".json,application/json">
  `;
  if (snapRaw) {
    backupHtml += `<div style="margin-top:10px;"><button class="b" data-act="bkp_reverter">Desfazer última restauração (${snapTxt})</button></div>`;
  }

  return card('📊 Consumo de Memória & Limpeza Segura', storageHtml) + 
         card('💾 Backup e Restauração de Dados', backupHtml) + 
         (typeof cardApelidos === 'function' ? cardApelidos() : '');
}

// --- GAVETA LATERAL DE LEMBRETES (DRAWER) ---
function renderDrawer() {
  const lembretes = S.lembretes || [];
  const pendentes = lembretes.filter(l => !l.feito).length;
  const badgeHtml = pendentes > 0 ? `<span class="drawer-badge">${pendentes}</span>` : '';

  let itensHtml = lembretes.map(l => `
    <div class="drawer-item ${l.feito ? 'done' : ''}">
      <input type="checkbox" data-act="tog_lembrete" data-id="${l.id}" ${l.feito ? 'checked' : ''} title="Marcar como feito">
      <div class="drawer-item-text">
        <span class="txt">${esc(l.texto)}</span>
        <span class="time">${esc(l.hora || '')}${l.data ? ' • ' + esc(l.data) : ''}</span>
      </div>
      <button class="x" data-act="del_lembrete" data-id="${l.id}" title="Excluir lembrete" style="padding: 2px 6px;">✕</button>
    </div>
  `).join('') || '<div class="empty" style="padding: 28px 0;">Sem lembretes no momento.<br><span class="mu" style="font-size:12px;">Digite um recado rápido acima!</span></div>';

  return `
    <button id="btnToggleDrawer" class="drawer-fab" data-act="toggle_drawer" title="Abrir Lembretes Rápidos (Alt + N)">
      <span style="font-size:16px;">📝</span>
      <span class="fab-lbl">Notas</span>
      ${badgeHtml}
    </button>

    <div id="drawerOverlay" class="drawer-overlay ${drawerAberto ? 'open' : ''}" data-act="toggle_drawer"></div>

    <aside id="drawerLembretes" class="drawer-panel ${drawerAberto ? 'open' : ''}">
      <div class="drawer-header">
        <div style="display:flex; align-items:center; gap:8px;">
          <span style="font-size:18px;">📝</span>
          <b style="font-size:15px; color:var(--ac);">Lembretes Rápidos</b>
        </div>
        <button class="x" data-act="toggle_drawer" title="Fechar (Esc)" style="font-size:16px;">✕</button>
      </div>

      <form data-form="novo_lembrete" class="drawer-form">
        <input name="texto" id="inpNovoLembrete" placeholder="Lembrar de..." required autocomplete="off">
        <button class="b p" style="padding: 8px 14px; font-weight:bold;">＋</button>
      </form>
      <div class="mu" style="font-size:11.5px; margin: -2px 0 10px 2px;">Pressione Enter para adicionar rapidamente</div>

      <div class="drawer-list">
        ${itensHtml}
      </div>

      ${lembretes.some(l => l.feito) ? `
        <div class="drawer-footer">
          <button class="b" data-act="limpar_lembretes_concluidos" style="font-size:12px; width:100%;">
            🧹 Limpar lembretes concluídos
          </button>
        </div>
      ` : ''}
    </aside>
  `;
}

// --- ROTEADOR PRINCIPAL DE TELAS ---
function views() {
  if (buscaGlobalTermo.trim()) {
    const termos = norm(buscaGlobalTermo).split(/\s+/).filter(Boolean);
    const matchCorpus = texto => termos.every(t => texto.includes(t));

    const resAulas = S.aulas.filter(a => {
      const diaBr = typeof br === 'function' ? br(a.dia) : a.dia;
      const diaBrAno = a.dia ? a.dia.split('-').reverse().join('/') : '';
      const diaSem = typeof wd === 'function' ? wd(a.dia) : '';
      const corpus = `${norm(a.prof)} ${norm(a.turma)} ${norm(a.desc)} ${a.dia} ${diaBr} ${diaBrAno} ${diaSem} ${norm(a.hora)}`;
      return matchCorpus(corpus);
    });

    const resReparos = S.reparos.filter(r => {
      const diaReg = typeof br === 'function' ? br(r.dataReg) : r.dataReg;
      const corpus = `${norm(r.item)} ${norm(r.local)} ${norm(r.resp)} ${norm(r.obs)} ${norm(r.status)} ${diaReg}`;
      return matchCorpus(corpus);
    });

    const resOrc = (S.orc.itens || []).filter(i => {
      const corpus = `${norm(i.forn || i.nome)} ${norm(i.obs)} ${norm(i.link)} ${norm(S.orc.titulo)} ${norm(i.status)}`;
      return matchCorpus(corpus);
    });
    
    let html = `<div class="fx" style="margin-bottom:10px"><button class="b p" data-act="limparBuscaGlobal">✕ Limpar busca global</button></div>`;
    html += `<h3>Aulas encontradas (${resAulas.length})</h3>${resAulas.map(typeof aulaRow === 'function' ? aulaRow : (a => `<div class="row"><div class="t"><b>${esc(a.prof)} — ${esc(a.turma)}</b></div></div>`)).join('') || '<div class="empty">Nenhuma aula encontrada.</div>'}`;
    html += `<h3>Manutenções e Reparos (${resReparos.length})</h3>${resReparos.map(r => `<div class="row"><div class="t"><b>${esc(r.local ? `[${r.local}] ` : '')}${esc(r.item)}</b><span class="mu">${esc(r.status)}</span></div></div>`).join('') || '<div class="empty">Nenhum chamado correspondente.</div>'}`;
    html += `<h3>Cotações e Fornecedores (${resOrc.length})</h3>${resOrc.map(i => `<div class="row"><div class="t"><b>${esc(i.forn || i.nome)} — ${brl(itemTotal(i))}</b><span class="mu">${esc(S.orc.titulo || '')} • Status: ${i.status}</span></div></div>`).join('') || '<div class="empty">Nenhuma cotação encontrada.</div>'}`;
    return card(`Resultados para: "${esc(buscaGlobalTermo)}"`, html);
  }

  if (tab === 'hoje') {
    if (typeof viewHoje === 'function') return viewHoje();
    
    // Fallback nativo caso o ficheiro hoje.js não tenha sido carregado
    const aulasConf = S.aulas.filter(a => {
      if (a.dia < hoje) return false;
      const cDia = dataConfirmacaoAula(a.dia);
      return cDia === hoje || (cDia < hoje && !a.confirmada);
    });
    aulasConf.sort((a, b) => (a.dia + a.hora).localeCompare(b.dia + b.hora));
    const confPendentes = aulasConf.filter(a => !a.confirmada);
    const G = typeof groups === 'function' ? groups(mon(0), addD(mon(0), 6)) : [];
    const pendDocs = typeof docDone === 'function' ? G.filter(g => !docDone(g)) : [];
    const repPend = S.reparos.filter(r => r.status !== 'Concluído');
    const orcAguardando = (S.orc.itens || []).filter(i => i.status === 'Aguardando aprovação');
    const orcProblema = (S.orc.itens || []).filter(i => i.status === 'Com problema');
    const pendentesGeral = S.aulas.filter(a => a.dia >= hoje && !a.materialPronto);

    let proximaDataEntrega = null;
    let matsEnvio = [];

    if (pendentesGeral.length) {
      const prazosPendentes = [...new Set(pendentesGeral.map(a => prazoEntregaMaterial(a.dia)))].sort();
      proximaDataEntrega = prazosPendentes[0];
      const condicaoPrazo = proximaDataEntrega <= hoje 
        ? a => prazoEntregaMaterial(a.dia) <= hoje 
        : a => prazoEntregaMaterial(a.dia) === proximaDataEntrega;
      matsEnvio = S.aulas.filter(a => a.dia >= hoje && condicaoPrazo(a) && (!a.materialPronto || a.materialConcluidoEm === hoje));
    }

    matsEnvio.sort((a, b) => (a.dia + a.hora).localeCompare(b.dia + b.hora));
    const matsEnvioPendentes = matsEnvio.filter(a => !a.materialPronto);
    const alertaVolume = matsEnvioPendentes.length >= 4;

    const matRowHoje = a => `
      <div class="row" style="align-items: center; padding: 6px 8px;">
        <div class="t">
          <b>${esc(a.turma)}${a.desc ? ' — ' + esc(a.desc) : ''}</b>
          <span class="mu">Aula: <b>${wd(a.dia)} ${br(a.dia)}</b>${a.hora ? ' às ' + esc(a.hora) : ''} • Prof: ${esc(a.prof || 'A definir')}</span>
        </div>
        <button class="b" data-act="ir_fila_material" data-turma="${esc(a.turma)}" style="font-size: 11.5px; padding: 3px 8px;" title="Adicionar à fila de envio">📦 Fila</button>
      </div>
    `;

    const confRowHoje = a => `
      <div class="row" style="padding: 6px 8px;">
        <div class="t">
          <b>${esc(a.prof || 'Sem professor')} — ${esc(a.turma)}</b>
          <span class="mu">${wd(a.dia)} ${br(a.dia)}${a.hora ? ' às ' + esc(a.hora) : ''}${a.desc ? ' — ' + esc(a.desc) : ''}</span>
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
          <span class="mu">${esc(i.obs || i.link || S.orc.titulo || 'Cotação')}</span>
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
            ${alertaVolume ? '<span class="pill w" style="font-size:10px; padding:1px 6px;">⚠️ 4+</span>' : ''}
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

    let rotuloEnvio = '📦 Próximo Envio de Materiais';
    if (proximaDataEntrega) {
      if (proximaDataEntrega < hoje) rotuloEnvio = '📦 Próximo Envio — Pendências Atrasadas';
      else if (proximaDataEntrega === hoje) rotuloEnvio = '📦 Próximo Envio — Entrega Hoje';
      else if (proximaDataEntrega === amanha) rotuloEnvio = `📦 Próximo Envio — Entrega Amanhã (${br(proximaDataEntrega)})`;
      else rotuloEnvio = `📦 Próximo Envio — Entrega ${wd(proximaDataEntrega)} (${br(proximaDataEntrega)})`;
    }

    const linkTitulo = (texto, tabDest, subDest) => `
      <span data-act="goto_tab" data-tab="${tabDest}" ${subDest ? `data-sub="${subDest}"` : ''} style="cursor:pointer; display:inline-flex; align-items:center; gap:6px;">
        ${texto} <span style="font-size:12px; color:var(--ac);">&rarr;</span>
      </span>
    `;

    const bannerAlerta = alertaVolume
      ? `<div style="display:flex; align-items:center; gap:8px; padding:6px 10px; margin-bottom:8px; background:var(--wr-light); border:1px solid rgba(245, 158, 11, 0.25); border-radius:8px; font-size:12px; color:var(--wr); font-weight:500;">
           <span>⚠️</span> <span><b>Alerta de volume:</b> Há ${matsEnvioPendentes.length} materiais pendentes neste envio.</span>
         </div>`
      : '';

    let htmlMats = card(
      linkTitulo(rotuloEnvio, 'aulas', 'import'),
      matsEnvio.length
        ? `${bannerAlerta}<div style="max-height: 250px; overflow-y: auto;">${matsEnvio.map(matRowHoje).join('')}</div>`
        : '<div class="empty">🎉 Todos os materiais futuros estão em dia!</div>',
      matsEnvioPendentes.length
    );

    let htmlConf = card(
      linkTitulo('📅 Confirmações de Aula', 'aulas', 'quadro'),
      aulasConf.length
        ? `<div style="max-height: 240px; overflow-y: auto;">${aulasConf.map(confRowHoje).join('')}</div>`
        : '<div class="empty">Nenhuma aula pendente de confirmação para hoje.</div>',
      confPendentes.length
    );

    let htmlReps = card(
      linkTitulo('🛠️ Reparos e Manutenções Abertas', 'semana', 'reparos'),
      repPend.length 
        ? `<div style="max-height: 180px; overflow-y: auto;">${repPend.map(reparoRowHoje).join('')}</div>`
        : '<div class="empty" style="padding: 6px 0;">Nenhum chamado aberto!</div>', 
      repPend.length
    );

    const orcLista = orcAguardando.concat(orcProblema);
    let htmlOrc = card(
      linkTitulo('💰 Cotações e Orçamento que precisam de atenção', 'orc', ''),
      orcLista.length
        ? `<div style="max-height: 160px; overflow-y: auto;">${orcLista.map(orcRowHoje).join('')}</div>`
        : '<div class="empty">Nenhum orçamento com pendência.</div>', 
      orcLista.length
    );

    let htmlDocs = card(
      linkTitulo('📄 Recibos Docentes Pendentes (esta semana)', 'semana', 'docs'),
      pendDocs.length
        ? `<div style="max-height: 200px; overflow-y: auto;">${pendDocs.map(docRowHoje).join('')}</div>`
        : '<div class="empty">Tudo em dia para a semana atual.</div>',
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

  if (tab === 'aulas') return typeof viewAulas === 'function' ? viewAulas() : '';
  if (tab === 'semana') return typeof viewOperacional === 'function' ? viewOperacional() : '';
  if (tab === 'orc') return typeof viewOrc === 'function' ? viewOrc() : '';
  if (tab === 'config') return viewConfig();

  return '';
}

// --- MOTOR DE DESENHO (RENDER) ---
function render() {
  const navEl = document.getElementById('nav');
  const vEl = document.getElementById('v');
  if (!navEl || !vEl) return;

  const active = document.activeElement; 
  const activeId = active ? active.id : null;
  let selStart = null, selEnd = null;
  
  if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) { 
    try { selStart = active.selectionStart; selEnd = active.selectionEnd; } catch (e) {} 
  }
  
  navEl.innerHTML = 
    TABS.map(([k, n]) => `<button class="${k === tab && !buscaGlobalTermo ? 'on' : ''}" data-tab="${k}">${n}</button>`).join('') +
    `<button class="b ${tab === 'config' && !buscaGlobalTermo ? 'p' : ''}" data-act="abrir_config" style="margin-left:auto; display:inline-flex; align-items:center; gap:6px;">⚙️ Configurações</button>`;
  
  vEl.innerHTML = views();

  let drawerCont = document.getElementById('drawerContainer');
  if (!drawerCont && document.body) {
    drawerCont = document.createElement('div');
    drawerCont.id = 'drawerContainer';
    document.body.appendChild(drawerCont);
  }
  if (drawerCont) {
    drawerCont.innerHTML = renderDrawer();
  }
  
  if (activeId) {
    const el = document.getElementById(activeId);
    if (el) { 
      el.focus(); 
      if (selStart !== null && selEnd !== null) { 
        try { el.setSelectionRange(selStart, selEnd); } catch (e) {} 
      } 
    }
  }
}

// --- OUVINTES DE EVENTOS (LISTENERS) ---
document.addEventListener('input', e => {
  if (e.target.id === 'turmaPad') turmaPad = e.target.value;
  if (e.target.id === 'campoNovaTurmaManual') {
    novaTurmaManualNome = e.target.value;
    render();
  }
  if (e.target.id === 'buscaAulas') { 
    buscaAulas = e.target.value; 
    render(); 
  }
  if (e.target.id === 'buscaGlobal') { 
    buscaGlobalTermo = e.target.value; 
    render(); 
  }
  
  if (e.target.dataset && e.target.dataset.act === 'orcf') {
    const i = (S.orc.itens || []).find(x => x.id === e.target.dataset.id);
    if (i) { 
      i[e.target.dataset.f] = e.target.value; 
      save(); 
      if (typeof orcTotals === 'function') orcTotals(); 
    }
  }

  if (e.target.id === 'cad_precoSemFrete') {
    const qtd = num(S.orc.qtdTotal);
    const preco = num(e.target.value);
    const undInput = document.getElementById('cad_valorUnd');
    if (qtd > 0 && preco > 0 && undInput && !undInput.dataset.manual) {
      undInput.value = (preco / qtd).toFixed(2).replace('.', ',');
    }
  }
  if (e.target.id === 'cad_valorUnd') {
    e.target.dataset.manual = 'true';
  }
});

// Gesto de deslizar (swipe) no Carrossel de Orçamentos
let touchStartX = 0;
document.addEventListener('touchstart', e => {
  const vp = e.target.closest('#orcCarrosselViewport');
  if (vp) touchStartX = e.touches[0].clientX;
}, { passive: true });

document.addEventListener('touchend', e => {
  const vp = e.target.closest('#orcCarrosselViewport');
  if (!vp) return;
  const diffX = e.changedTouches[0].clientX - touchStartX;
  if (diffX < -50 && orcSlideAtivo === 0) {
    orcSlideAtivo = 1;
    render();
  } else if (diffX > 50 && orcSlideAtivo === 1) {
    orcSlideAtivo = 0;
    render();
  }
}, { passive: true });

// Arrastar e largar (Drag & Drop) no Conversor de Imagens
document.addEventListener('dragover', e => {
  const dz = e.target.closest('#dropzoneImagens');
  if (dz) {
    e.preventDefault();
    dz.classList.add('drag-over');
  }
});

document.addEventListener('dragleave', e => {
  const dz = e.target.closest('#dropzoneImagens');
  if (dz && !dz.contains(e.relatedTarget)) {
    dz.classList.remove('drag-over');
  }
});

document.addEventListener('drop', e => {
  const dz = e.target.closest('#dropzoneImagens');
  if (dz) {
    e.preventDefault();
    dz.classList.remove('drag-over');
    if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) {
      if (typeof adicionarArquivosConversor === 'function') {
        adicionarArquivosConversor(e.dataTransfer.files);
      }
    }
  }
});

// Teclado: ENTER em buscas, Alt + N (Lembretes) e Esc (Fechar gaveta)
document.addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    if (e.target.id === 'buscaGlobal') {
      e.preventDefault();
      buscaGlobalTermo = e.target.value.trim();
      render();
      return;
    }
    if (e.target.id === 'buscaAulas') {
      e.preventDefault();
      buscaAulas = e.target.value.trim();
      render();
      return;
    }
    if (e.target.id === 'campoNovaTurmaManual') {
      e.preventDefault();
      const profInput = document.querySelector('form[data-form="aula_manual_nova"] input[name="prof"]');
      if (profInput) profInput.focus();
      return;
    }
  }

  if (e.altKey && (e.key === 'n' || e.key === 'N')) {
    e.preventDefault();
    drawerAberto = !drawerAberto;
    render();
    if (drawerAberto) {
      setTimeout(() => {
        const inp = document.getElementById('inpNovoLembrete');
        if (inp) inp.focus();
      }, 100);
    }
  } else if (e.key === 'Escape' && drawerAberto) {
    drawerAberto = false;
    render();
  }
});

document.addEventListener('click', async e => {
  const t = e.target.closest('[data-tab],[data-act]'); 
  if (!t) return; 
  
  if (t.dataset.tab) { 
    tab = t.dataset.tab; 
    buscaGlobalTermo = ''; 
    const bg = document.getElementById('buscaGlobal'); 
    if (bg) bg.value = ''; 
    render(); 
    return; 
  }
  
  const a = t.dataset.act, id = t.dataset.id;

  if (a === 'toggle_drawer') {
    drawerAberto = !drawerAberto;
    render();
    if (drawerAberto) {
      setTimeout(() => {
        const inp = document.getElementById('inpNovoLembrete');
        if (inp) inp.focus();
      }, 100);
    }
    return;
  }

  if (a === 'tog_lembrete') {
    const item = (S.lembretes || []).find(x => x.id === t.dataset.id);
    if (item) {
      item.feito = t.checked;
      save();
      render();
    }
    return;
  }

  if (a === 'del_lembrete') {
    S.lembretes = (S.lembretes || []).filter(x => x.id !== id);
    save();
    render();
    toast('Lembrete excluído');
    return;
  }

  if (a === 'limpar_lembretes_concluidos') {
    const antes = (S.lembretes || []).length;
    S.lembretes = (S.lembretes || []).filter(x => !x.feito);
    const removidos = antes - S.lembretes.length;
    save();
    render();
    toast(`${removidos} lembretes concluídos removidos!`);
    return;
  }

  if (a === 'set_modo_crono') {
    modoEntradaCronograma = t.dataset.m;
    render();
    return;
  }

  if (a === 'limpar_turma_manual') {
    novaTurmaManualNome = '';
    render();
    return;
  }

  if (a === 'abrir_config') {
    tab = 'config';
    buscaGlobalTermo = '';
    render();
    return;
  }

  if (a === 'goto_card') {
    const target = document.getElementById(t.dataset.target);
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    return;
  }
  if (a === 'goto_tab') {
    tab = t.dataset.tab;
    if (t.dataset.sub) {
      if (tab === 'semana') subTabSemana = t.dataset.sub;
      if (tab === 'aulas') subTabAulas = t.dataset.sub;
    }
    buscaGlobalTermo = '';
    render();
    return;
  }

  if (a === 'ir_fila_material') {
    tab = 'aulas';
    subTabAulas = 'import';
    render();
    setTimeout(() => {
      const sel = document.querySelector('select[name="turma"]');
      if (sel) sel.value = t.dataset.turma;
      const inp = document.querySelector('input[name="caminho"]');
      if (inp) inp.focus();
    }, 60);
    return;
  }

  if (a === 'copiar_resumo') {
    const tipo = t.dataset.tipo;
    
    // Gerar planilha se for 3 ou 4 semanas
    if (tipo === '3' || tipo === '4') {
      if (typeof baixarPlanilhaResumo === 'function') {
        baixarPlanilhaResumo(tipo);
      }
    }

    if (typeof gerarResumoOperacional === 'function') {
      const txt = gerarResumoOperacional(tipo);
      copy(txt);
      const rotulo = tipo === 'dia' ? 'do dia' : (tipo === '4' ? 'do mês' : `de ${tipo} semana(s)`);
      toast(tipo === '3' || tipo === '4' ? 'Resumo copiado e Planilha descarregada!' : `Resumo ${rotulo} copiado!`);
    }
    return;
  }

  if (a === 'trigger_input_img') {
    const inp = document.getElementById('inputImagensPdf');
    if (inp) inp.click();
    return;
  }
  
  if (a === 'encurtar_link_form') {
    const inp = document.getElementById('cad_linkCompra');
    if (!inp || !inp.value.trim()) return toast('Cole o link do produto primeiro.');
    t.disabled = true;
    t.textContent = '⏳ Encurtando...';
    if (typeof encurtarUrlAmigavel === 'function') {
      const urlEncurtada = await encurtarUrlAmigavel(inp.value);
      inp.value = urlEncurtada;
      toast('Link higienizado!');
    }
    t.disabled = false;
    t.textContent = '✂️ Encurtar';
    return;
  }

  if (a === 'remover_img_conv') {
    const idx = +t.dataset.i;
    if (typeof arquivosConversor !== 'undefined' && arquivosConversor[idx]) {
      URL.revokeObjectURL(arquivosConversor[idx].previewUrl);
      arquivosConversor.splice(idx, 1);
      render();
    }
    return;
  }

  if (a === 'limpar_imagens_conv') {
    if (typeof arquivosConversor !== 'undefined') {
      arquivosConversor.forEach(item => URL.revokeObjectURL(item.previewUrl));
      arquivosConversor = [];
      render();
      toast('Lista de imagens limpa!');
    }
    return;
  }

  if (a === 'exec_converter_img') {
    const inp = document.getElementById('inputImagensPdf');
    const arquivos = (typeof arquivosConversor !== 'undefined' && arquivosConversor.length)
      ? arquivosConversor.map(x => x.file)
      : (inp && inp.files ? Array.from(inp.files) : []);

    if (!arquivos.length) return toast('Selecione ou arraste pelo menos uma imagem (JPG ou PNG).');
    
    toast('A processar imagens para PDF...');
    
    const prepararJsPdf = async () => {
      if (window.jspdf && window.jspdf.jsPDF) return window.jspdf.jsPDF;
      return new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
        s.onload = () => resolve(window.jspdf.jsPDF);
        s.onerror = () => reject(new Error('Falha ao carregar jsPDF'));
        document.head.appendChild(s);
      });
    };

    try {
      const jsPDF = await prepararJsPdf();
      let doc = null;

      for (let i = 0; i < arquivos.length; i++) {
        const file = arquivos[i];
        const dataUrl = await new Promise(res => {
          const reader = new FileReader();
          reader.onload = ev => res(ev.target.result);
          reader.readAsDataURL(file);
        });

        const { w, h } = await new Promise(res => {
          const img = new Image();
          img.onload = () => res({ w: img.naturalWidth, h: img.naturalHeight });
          img.src = dataUrl;
        });

        const orientacao = w > h ? 'landscape' : 'portrait';
        if (i === 0) {
          doc = new jsPDF({ orientation: orientacao, unit: 'px', format: [w, h] });
        } else {
          doc.addPage([w, h], orientacao);
        }

        const formato = file.type === 'image/png' ? 'PNG' : 'JPEG';
        doc.addImage(dataUrl, formato, 0, 0, w, h);
      }

      const nomeFinal = arquivos.length === 1
        ? arquivos[0].name.replace(/\.[^.]+$/, '') + '.pdf'
        : `compilado-imagens-${hoje}.pdf`;

      doc.save(nomeFinal);
      toast('PDF descarregado com sucesso!');
      if (typeof arquivosConversor !== 'undefined') {
        arquivosConversor.forEach(item => URL.revokeObjectURL(item.previewUrl));
        arquivosConversor = [];
      }
      if (inp) inp.value = '';
      render();
    } catch (err) {
      toast('Erro ao converter imagens.');
      console.error(err);
    }
    return;
  }
  
  if (a === 'sub_aulas') { subTabAulas = t.dataset.v; render(); return; }
  if (a === 'sub_semana') { subTabSemana = t.dataset.v; render(); return; }
  if (a === 'orc_ir_slide') { orcSlideAtivo = +t.dataset.s; render(); return; }
  if (a === 'orc_passar_slide') { orcSlideAtivo = Math.max(0, Math.min(1, orcSlideAtivo + (+t.dataset.dir))); render(); return; }

  if (a === 'limparBuscaGlobal') { 
    buscaGlobalTermo = ''; 
    const el = document.getElementById('buscaGlobal'); 
    if (el) el.value = ''; 
    render(); 
  }
  if (a === 'limpar_busca_aulas') { 
    buscaAulas = ''; 
    const el = document.getElementById('buscaAulas'); 
    if (el) el.value = ''; 
    render(); 
  }
  if (a === 'limparDestaques') { S.aulas.forEach(item => { item.destaque = null; }); save(); render(); toast('Avisos removidos'); }

  if (a === 'del_aula') confirmarExclusao(t, () => { S.aulas = S.aulas.filter(x => x.id !== id); save(); render(); toast('Excluída'); });
  if (a === 'del_reparo') confirmarExclusao(t, () => { S.reparos = S.reparos.filter(x => x.id !== id); save(); render(); toast('Excluído'); });
  if (a === 'del_orcitem') confirmarExclusao(t, () => { S.orc.itens = S.orc.itens.filter(x => x.id !== id); save(); render(); toast('Cotação excluída'); });
  if (a === 'del_orchist') confirmarExclusao(t, () => { S.orcHist = S.orcHist.filter(x => x.id !== id); save(); render(); toast('Removido'); });

  if (a === 'limpar_aulas_passadas') {
    confirmarExclusao(t, () => {
      const antes = S.aulas.length;
      S.aulas = S.aulas.filter(x => x.dia >= hoje);
      const removidas = antes - S.aulas.length;
      save(); 
      render(); 
      toast(`${removidas} aulas passadas removidas com segurança!`);
    });
  }

  if (a === 'limpar_reparos_concluidos') {
    confirmarExclusao(t, () => {
      const antes = S.reparos.length;
      S.reparos = S.reparos.filter(x => x.status !== 'Concluído');
      const removidos = antes - S.reparos.length;
      save(); 
      render(); 
      toast(`${removidos} manutenções concluídas removidas!`);
    });
  }

  if (a === 'limpar_orchist') {
    confirmarExclusao(t, () => {
      S.orcHist = [];
      save(); 
      render(); 
      toast('Histórico de cotações arquivadas limpo!');
    });
  }

  if (a === 'reset_seguro_total') {
    confirmarExclusao(t, async () => {
      toast('Gerando e baixando backup preventivo...');
      await baixarBackup('backup-preventivo-antes-do-reset');
      
      localStorage.setItem(KEY + '-snapshot-emergencia', JSON.stringify({ data: new Date().toISOString(), dados: JSON.parse(JSON.stringify(S)) }));
      
      S = {
        aulas: [],
        reparos: [],
        hist: [],
        orcHist: [],
        fornecedores: [],
        apelidos: [],
        filaMateriais: [],
        lembretes: [],
        docs: {},
        cat: {},
        meta: { ultimoReset: new Date().toISOString() },
        orc: { inst: 'Prius', titulo: '', solic: '', data: hoje, obs: '', qtdTotal: '', itens: [] }
      };
      save();
      render();
      alert('Memória redefinida com sucesso!\nUm arquivo de backup preventivo foi baixado no seu computador caso precise restaurar.');
    });
  }

  if (a === 'del_fila') { S.filaMateriais.splice(+t.dataset.i, 1); save(); render(); toast('Removido da fila'); }
  if (a === 'limpar_fila') { S.filaMateriais = []; save(); render(); toast('Fila limpa'); }
  if (a === 'copiar_fila') {
    const txt = S.filaMateriais.map(item => `${item.turma}\n${item.caminho}`).join('\n\n');
    copy(txt);
  }

  if (a === 'rel') {
    const ab = S.reparos.filter(x => x.status !== 'Concluído');
    const co = S.reparos.filter(x => x.status === 'Concluído');
    let txt = `*RELATÓRIO DE REPAROS E MANUTENÇÃO - ${br(hoje)}*\n\n📌 EM ABERTO / ANDAMENTO (${ab.length}):\n`;
    txt += ab.map(r => `• ${r.local ? `*${r.local}*: ` : ''}${r.item}\n  - Aberto em: ${br(r.dataReg || hoje)}${r.resp ? ` | Resp: ${r.resp}` : ''}${r.obs ? ` | Obs: ${r.obs}` : ''}`).join('\n') || 'Nenhum chamado aberto.\n';
    txt += `\n\n✅ FINALIZADOS RECENTEMENTE (${co.length}):\n`;
    txt += co.map(r => `• ${r.local ? `${r.local} - ` : ''}${r.item}${r.dataConc ? ` (concluído em ${br(r.dataConc)})` : ''}`).join('\n') || 'Nenhum chamado concluído.';
    copy(txt);
  }

  if (a === 'cpdoc') { const g = typeof groups === 'function' ? groups('0000-00-00', '9999-99-99').find(x => x.k === t.dataset.k) : null; if (g) copy(docTxt(g)); }
  if (a === 'wk') { wk += +t.dataset.d; render(); }
  if (a === 'past') { showPast = !showPast; render(); }
  if (a === 'pvx' && prev) { const r = prev.rows[+t.dataset.i]; if (r) { r.x = !r.x; render(); } }
  if (a === 'imp') aplicar();
  if (a === 'canc') { prev = null; pend = null; msg = ''; render(); }
  if (a === 'lerpaste') { const v = document.getElementById('paste').value; if (!v.trim()) return toast('Cole texto primeiro'); if (typeof start === 'function') start(splitText(v), 'Texto', turmaPad.trim()); }

  if (a === 'repf') { repFiltro = t.dataset.v; render(); }

  if (a === 'orcxlsx') if (typeof orcXlsx === 'function') orcXlsx();
  if (a === 'orccopy') if (typeof orcCopy === 'function') orcCopy();
  if (a === 'orcsalvarhist') {
    if (!S.orc.itens.length) return toast('Adicione fornecedores antes de arquivar');
    S.orcHist.unshift({ 
      id: uid(), 
      data: S.orc.data || hoje, 
      titulo: S.orc.titulo || 'Cotação', 
      qtdItens: S.orc.itens.length, 
      obs: S.orc.obs || '',
      itens: JSON.parse(JSON.stringify(S.orc.itens)) 
    });
    save(); render(); toast('Cotação arquivada no histórico!');
  }
  if (a === 'orc_carregar_hist') {
    const h = (S.orcHist || []).find(x => x.id === id);
    if (h && confirm(`Carregar a cotação "${h.titulo}"? Os dados atuais da tela serão substituídos.`)) {
      S.orc = { 
        inst: S.orc.inst || 'Prius', 
        titulo: h.titulo || '', 
        solic: h.solic || '', 
        data: h.data || hoje, 
        obs: h.obs || '', 
        qtdTotal: h.qtdTotal || '',
        itens: JSON.parse(JSON.stringify(h.itens || [])) 
      };
      save(); render(); toast('Cotação carregada com sucesso!');
    }
  }
  if (a === 'orcnovo') {
    if (!orcAsk) { orcAsk = true; t.textContent = 'Confirmar limpeza?'; setTimeout(() => { orcAsk = false; if (t.isConnected) t.textContent = '🧹 Limpar Orçamento'; }, 3000); return; }
    orcAsk = false; 
    S.orc = { inst: S.orc.inst, titulo: '', solic: S.orc.solic, data: hoje, obs: '', qtdTotal: '', itens: [] }; 
    save(); render(); toast('Orçamento limpo para nova cotação!');
  }

  if (a === 'bkp_download') {
    baixarBackup().then(ok => { if (ok) toast('Backup guardado com sucesso!'); });
  }
  if (a === 'bkp_reverter') reverterSnapshot();
  if (a === 'crsub') { destPre = destPre === t.dataset.t ? '' : t.dataset.t; render(); if (destPre) toast('Envie o PDF novo acima'); }
  if (a === 'crdel') { confirmarExclusao(t, () => { S.aulas = S.aulas.filter(x => x.turma !== t.dataset.t); if (destPre === t.dataset.t) destPre = ''; save(); render(); toast('Cronograma apagado'); }); }
  if (a === 'ap_unir') { if (typeof addApelido === 'function') addApelido(t.dataset.nome, [t.dataset.alt]); save(); render(); toast('Nomes unidos'); }
  if (a === 'ap_todas') { if (typeof sugApelidos === 'function' && typeof addApelido === 'function') sugApelidos().forEach(s => addApelido(s.nome, [s.alt])); save(); render(); toast('Sugestões aplicadas'); }
  if (a === 'del_apelido') confirmarExclusao(t, () => { S.apelidos = S.apelidos.filter(x => x.id !== t.dataset.id); save(); render(); toast('Desfeito'); });
});

document.addEventListener('change', async e => {
  const t = e.target, a = t.dataset.act;
  if (a === 'tog') { 
    const item = find(t.dataset.l, t.dataset.id); 
    if (item) { 
      item[t.dataset.f] = t.checked; 
      if (t.dataset.f === 'confirmada' && t.checked) item.destaque = null; 
      if (t.dataset.f === 'materialPronto') item.materialConcluidoEm = t.checked ? hoje : null;
      save(); 
      render(); 
    } 
  }
  if (a === 'tog_lembrete') {
    const item = (S.lembretes || []).find(x => x.id === t.dataset.id);
    if (item) { item.feito = t.checked; save(); render(); }
  }
  if (a === 'doc') { const d = S.docs[t.dataset.k] = S.docs[t.dataset.k] || {}; d[t.dataset.f] = t.checked; save(); render(); }
  if (a === 'rep_obs') { const r = find('reparos', t.dataset.id); if (r) { r.obs = t.value; save(); } }
  if (a === 'rep_st') { const r = find('reparos', t.dataset.id); if (r) { r.status = t.value; r.feito = (t.value === 'Concluído'); r.dataConc = r.feito ? hoje : ''; save(); render(); } }
  if (a === 'rep_check') { const r = find('reparos', t.dataset.id); if (r) { r.status = t.checked ? 'Concluído' : 'Pendente'; r.feito = t.checked; r.dataConc = t.checked ? hoje : ''; save(); render(); } }
  if (a === 'orcs') { const i = (S.orc.itens || []).find(x => x.id === t.dataset.id); if (i) { i.status = t.value; save(); render(); } }
  if (a === 'ae') { const item = find('aulas', t.dataset.id); if (item) { item[t.dataset.f] = t.value.trim(); save(); t.classList.toggle('miss', !t.value.trim()); } }
  if (t.id === 'rem' && prev) prev.rem = t.checked;
  if (t.id === 'arquivoBackup' && t.files[0]) { processarRestauracao(t.files[0]); t.value = ''; }
  if (t.id === 'inputImagensPdf' && t.files.length) {
    if (typeof adicionarArquivosConversor === 'function') {
      adicionarArquivosConversor(t.files);
    }
    t.value = '';
  }
  if (t.id === 'file' && t.files[0]) {
    const f = t.files[0];
    try {
      if (!window.pdfjsLib) { msg = 'Leitor de PDF não carregou.'; return render(); }
      pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
      const P = await pdfItems(await f.arrayBuffer());
      if (!P.some(p => p.length)) { msg = 'O PDF não tem texto.'; return render(); }
      if (typeof startPdf === 'function') startPdf(P, turmaPad.trim() || turmaDoNome(f.name), f.name);
    } catch (err) { msg = 'Erro ao ler o PDF.'; render(); } finally { t.value = ''; }
  }
  if (t.id === 'filtroProdGraf') { typeof window !== 'undefined' && (window.prodFiltroHist = t.value); render(); }
  if (t.id === 'dest' && pend) { dest = t.value; if (typeof montar === 'function') montar(); render(); }
  if (t.id === 'nomeNovo' && pend) { nomeNovo = t.value; if (typeof montar === 'function') montar(); render(); }
  if (t.dataset.orc) { S.orc[t.dataset.orc] = t.value; save(); }
});

// SUBMIT: Bloqueia recarregamento indevido de página
document.addEventListener('submit', e => {
  e.preventDefault();
  const f = e.target.dataset.form; 
  if (!f) return;
  const d = Object.fromEntries(new FormData(e.target)), id = uid();
  
  if (f === 'aula') { S.aulas.push({ id, ...d, confirmada: false, destaque: 'nova', modificadoEm: new Date().toISOString() }); toast('Aula adicionada!'); }
  
  // Submissão de Lembrete Rápido
  if (f === 'novo_lembrete') {
    const txt = (d.texto || '').trim();
    if (!txt) return;
    const agora = new Date();
    const hora = pad(agora.getHours()) + ':' + pad(agora.getMinutes());
    S.lembretes = S.lembretes || [];
    S.lembretes.unshift({
      id,
      texto: txt,
      feito: false,
      hora,
      data: br(hoje)
    });
    save();
    render();
    toast('Lembrete salvo!');
    setTimeout(() => {
      const inp = document.getElementById('inpNovoLembrete');
      if (inp) inp.focus();
    }, 50);
    return;
  }

  // Adição aula por aula no modo "Novo Cronograma"
  if (f === 'aula_manual_nova') {
    const turma = typeof novaTurmaManualNome !== 'undefined' ? novaTurmaManualNome.trim() : '';
    if (!turma) return toast('Informe o nome da turma primeiro!');
    S.aulas.push({
      id,
      turma,
      prof: d.prof.trim(),
      dia: d.dia,
      hora: d.hora.trim(),
      desc: (d.desc || '').trim(),
      confirmada: false,
      destaque: 'nova',
      modificadoEm: new Date().toISOString()
    });
    save();
    render();
    toast('Aula adicionada à turma!');
    
    const form = e.target;
    form.querySelector('input[name="prof"]').value = '';
    form.querySelector('input[name="desc"]').value = '';
    form.querySelector('input[name="prof"]').focus();
    return;
  }

  if (f === 'reparo') { 
    S.reparos.push({ 
      id, 
      local: (d.local || '').trim(),
      item: d.item.trim(), 
      resp: (d.resp || '').trim(), 
      dataReg: d.dataReg || hoje, 
      status: 'Pendente', 
      dataConc: '', 
      obs: '', 
      feito: false 
    }); 
    toast('Chamado registado!'); 
  }
  
  if (f === 'fila_material') {
    S.filaMateriais = S.filaMateriais || [];
    S.filaMateriais.push({ turma: d.turma.trim(), caminho: d.caminho.trim() });
    save(); render(); toast('Material adicionado à fila!');
    e.target.reset();
    return;
  }

  if (f === 'orcitem') {
    const forn = d.forn.trim();
    S.orc.itens.push({ 
      id, 
      forn, 
      precoSemFrete: d.precoSemFrete.trim(), 
      frete: (d.frete || '').trim(), 
      valorUnd: (d.valorUnd || '').trim(), 
      link: (d.link || '').trim(), 
      status: 'Aguardando aprovação' 
    });
    if (forn && !S.fornecedores.includes(forn)) S.fornecedores.push(forn);
    toast('Fornecedor adicionado à cotação!');
  }

  if (f === 'apelido') {
    e.stopImmediatePropagation();
    if (typeof addApelido === 'function' && addApelido(d.nome, String(d.alts || '').split(','))) { save(); render(); toast('Nomes unidos'); } else toast('Informe o nome e pelo menos um outro nome');
    return;
  }

  save(); render(); e.target.reset();
});

// --- INICIALIZAÇÃO SEGURA DO DOM ---
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', render);
} else {
  render();
}
