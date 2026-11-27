/* ========================================================
   APP.JS - ORQUESTRADOR CENTRAL, CONFIGURAÇÕES E EVENTOS
   ARGOS OPS
======================================================== */

// --- BACKUP E RESTAURAÇÃO ---
async function salvarArquivo(nome, dados, tipo) {
  try {
    const dl = (window.claude && typeof window.claude.use === 'function') ? await window.claude.use('downloads') : null;
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

function baixarBackup(prefixo = 'argos-ops-backup') {
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
      if (!dados || typeof dados !== 'object' || Array.isArray(dados) || (!dados.aulas && !dados.reparos)) return alert('Backup inválido.');
      if (!confirm('ATENÇÃO: Deseja restaurar este backup?\nUma cópia de segurança automática será guardada antes de prosseguir.')) return;
      localStorage.setItem(KEY + '-snapshot-emergencia', JSON.stringify({ data: new Date().toISOString(), dados: S }));
      S = normalizarEstado(dados);
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
      S = normalizarEstado(snap.dados);
      save(); 
      render(); 
      alert('Restauração desfeita com sucesso!'); 
    }
  } catch (e) { alert('Erro: ' + e.message); }
}

// --- MODAL UNIFICADO DE CONFIGURAÇÕES E SISTEMA ---
let settingsTabAtual = 'geral';

function renderSettingsGeralHtml() {
  const temaAtual = document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
  const isLight = temaAtual === 'light';

  let temaHtml = `
    <div style="margin-bottom: 6px;">
      <div class="mu" style="margin-bottom: 12px; font-size: 13px;">
        Personalize o tema visual do painel. Sua escolha fica gravada neste navegador com suporte a cores nítidas e alto contraste:
      </div>

      <div class="theme-selector-grid">
        <div class="theme-card-option ${!isLight ? 'selected' : ''}" data-act="set_tema" data-tema="dark" role="button" tabindex="0" title="Ativar Modo Escuro">
          <div class="theme-card-preview dark-preview">
            <div class="preview-header"></div>
            <div class="preview-body">
              <div class="preview-line accent"></div>
              <div class="preview-line"></div>
            </div>
          </div>
          <div class="theme-card-info">
            <div class="theme-card-title">
              <span><span class="ui-glyph" aria-hidden="true">☾</span> Modo Escuro</span>
              ${!isLight ? '<span class="pill o" style="font-size:10.5px; padding:1px 7px;">✓ Ativo</span>' : ''}
            </div>
            <span class="mu" style="font-size:11.5px;">Tema Notion Midnight com acentos Âmbar</span>
          </div>
        </div>

        <div class="theme-card-option ${isLight ? 'selected' : ''}" data-act="set_tema" data-tema="light" role="button" tabindex="0" title="Ativar Modo Claro">
          <div class="theme-card-preview light-preview">
            <div class="preview-header"></div>
            <div class="preview-body">
              <div class="preview-line accent"></div>
              <div class="preview-line"></div>
            </div>
          </div>
          <div class="theme-card-info">
            <div class="theme-card-title">
              <span><span class="ui-glyph" aria-hidden="true">☀\uFE0E</span> Modo Claro</span>
              ${isLight ? '<span class="pill o" style="font-size:10.5px; padding:1px 7px;">✓ Ativo</span>' : ''}
            </div>
            <span class="mu" style="font-size:11.5px;">Alto contraste para ambientes iluminados</span>
          </div>
        </div>
      </div>

      <div style="margin-top: 14px; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px;">
        <span class="mu" style="font-size: 12.5px;">Tema atual: <b style="color:var(--tx);">${isLight ? '☀\uFE0E Modo Claro (Alto Contraste)' : '☾ Modo Escuro (Midnight & Amber)'}</b></span>
        <button class="b p" data-act="toggle_tema" style="display:inline-flex; align-items:center; gap:6px;">
          <span class="ui-glyph" aria-hidden="true">${isLight ? '☾' : '☀\uFE0E'}</span>
          <span>${isLight ? 'Alternar para Modo Escuro' : 'Alternar para Modo Claro'}</span>
        </button>
      </div>
    </div>
  `;

  const totalAulas = S.aulas.length;
  const passadas = S.aulas.filter(a => a.dia < hoje).length;
  const reparosConcluidos = S.reparos.filter(r => r.status === 'Concluído').length;
  const orcHistQtd = (S.orcHist || []).length;

  const isSupaConfig = typeof supabaseConfigurado === 'function' && supabaseConfigurado();
  const isSupaAtivo = isSupaConfig && typeof sbClient !== 'undefined' && !!sbClient && (typeof sbConectado === 'undefined' || sbConectado);
  const ultSync = S.meta && S.meta.ultimoSyncNuvem ? new Date(S.meta.ultimoSyncNuvem).toLocaleString('pt-BR') : 'Ainda não sincronizado';
  const temPendLocal = typeof sbPendenciasLocais !== 'undefined' && sbPendenciasLocais;

  const ultBackup = S.meta && S.meta.ultimoBackup ? new Date(S.meta.ultimoBackup).toLocaleString('pt-BR') : 'Sem registo recente';
  const ultRest = S.meta && S.meta.ultimaRestauracao ? new Date(S.meta.ultimaRestauracao).toLocaleString('pt-BR') : 'Sem restauração recente';
  let snapRaw = null;
  try { snapRaw = localStorage.getItem(KEY + '-snapshot-emergencia'); } catch (e) {}
  let snapTxt = ''; 
  if (snapRaw) { try { snapTxt = new Date(JSON.parse(snapRaw).data).toLocaleString('pt-BR'); } catch (e) {} }

  let nuvemHtml = `
    <div style="margin-bottom: 14px;">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; flex-wrap:wrap; gap:8px;">
        <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
          <b>Status da Conexão:</b>
          <span class="pill ${isSupaAtivo ? 'o' : 'w'}" style="font-size:12px; padding:3px 10px;">
            ${isSupaAtivo ? '<span class="ui-glyph" aria-hidden="true">☁\uFE0E</span> Conectado ao Supabase' : '<span class="ui-glyph" aria-hidden="true">⚠\uFE0E</span> Modo Offline'}
          </span>
          ${temPendLocal ? '<span class="pill b" style="font-size:11px; padding:2px 8px;">Alterações locais pendentes</span>' : ''}
        </div>
        <button class="b p" data-act="forcar_sync_nuvem" title="Forçar sincronização imediata com o banco na nuvem">
          <span class="ui-glyph" aria-hidden="true">↻</span> Sincronizar Agora
        </button>
      </div>

      <div class="grid" style="margin-bottom:10px;">
        <div class="stat">
          <b style="font-size:14px; color:var(--tx);">${ultSync}</b>
          <span class="mu">Última sincronização na nuvem</span>
        </div>
        <div class="stat">
          <b style="font-size:14px; color:var(--tx);">${totalAulas} aulas • ${S.reparos.length} manutenções</b>
          <span class="mu">${passadas} passadas • ${reparosConcluidos} concluídas • ${orcHistQtd} cotações</span>
        </div>
      </div>
    </div>

    <h3 style="margin-top:16px;">Opções Seguras de Limpeza</h3>
    <div class="mu" style="margin-bottom:10px; font-size:12.5px;">
      Remova apenas registros antigos já encerrados sem afetar as aulas futuras ou o banco compartilhado:
    </div>

    <div class="fx" style="gap:8px;">
      <button class="b" data-act="limpar_aulas_passadas" ${passadas === 0 ? 'disabled' : ''} title="Remove aulas com datas anteriores a hoje">
        <span class="ui-glyph" aria-hidden="true">✕</span> Limpar Aulas Passadas (${passadas})
      </button>
      <button class="b" data-act="limpar_reparos_concluidos" ${reparosConcluidos === 0 ? 'disabled' : ''} title="Remove chamados que já foram finalizados">
        <span class="ui-glyph" aria-hidden="true">✕</span> Limpar Manutenções Concluídas (${reparosConcluidos})
      </button>
      <button class="b" data-act="limpar_orchist" ${orcHistQtd === 0 ? 'disabled' : ''} title="Remove histórico de orçamentos antigos">
        <span class="ui-glyph" aria-hidden="true">✕</span> Limpar Cotações Arquivadas (${orcHistQtd})
      </button>
    </div>
  `;

  let backupHtml = `
    <div class="grid" style="margin-bottom:12px;">
      <div class="stat"><b>Último backup</b><span class="mu">${ultBackup}</span></div>
      <div class="stat"><b>Última restauração</b><span class="mu">${ultRest}</span></div>
    </div>
    <div class="fx" style="margin-bottom:14px;">
      <button class="b p" data-act="bkp_download"><span class="ui-glyph" aria-hidden="true">⇩</span> Exportar Cópia de Segurança (.json)</button>
    </div>
    <div class="mu" style="margin-bottom:6px;"><b>Restaurar de arquivo .json:</b></div>
    <input type="file" id="arquivoBackup" accept=".json,application/json">
  `;
  if (snapRaw) {
    backupHtml += `<div style="margin-top:10px;"><button class="b" data-act="bkp_reverter">Desfazer última restauração (${snapTxt})</button></div>`;
  }

  return card('Aparência & Tema do Painel', temaHtml) +
         card('<span class="ui-glyph" aria-hidden="true">☁\uFE0E</span> Status da Nuvem & Manutenção de Dados', nuvemHtml) + 
         card('<span class="ui-glyph" aria-hidden="true">⇩</span> Backup e Restauração de Dados', backupHtml);
}

function viewConfig() {
  return renderSettingsGeralHtml();
}

function renderModalSystemSettings() {
  const modal = document.getElementById('modalSystemSettings');
  if (!modal) return;

  const validTabs = ['geral', 'presets', 'professores'];
  if (!validTabs.includes(settingsTabAtual)) settingsTabAtual = 'geral';

  modal.querySelectorAll('.modal-settings-tab').forEach(btn => {
    const isAtiva = btn.dataset.tab === settingsTabAtual;
    btn.classList.toggle('active', isAtiva);
    btn.setAttribute('aria-selected', isAtiva ? 'true' : 'false');
  });

  modal.querySelectorAll('.modal-settings-panel').forEach(panel => {
    const isAtivo = panel.dataset.settingsPanel === settingsTabAtual;
    panel.classList.toggle('active', isAtivo);
    panel.style.display = isAtivo ? 'block' : 'none';
  });

  const panelGeral = document.getElementById('settingsTabPanelGeral');
  const panelProf = document.getElementById('settingsTabPanelProfessores');

  if (settingsTabAtual === 'geral' && panelGeral) {
    panelGeral.innerHTML = renderSettingsGeralHtml();
  } else if (settingsTabAtual === 'presets') {
    if (typeof renderModalPresets === 'function') renderModalPresets();
  } else if (settingsTabAtual === 'professores' && panelProf) {
    panelProf.innerHTML = typeof cardApelidos === 'function' ? cardApelidos() : '';
  }
}

function abrirModalConfig(tabInicial = 'geral') {
  const validTabs = ['geral', 'presets', 'professores'];
  settingsTabAtual = validTabs.includes(tabInicial) ? tabInicial : 'geral';
  const modal = document.getElementById('modalSystemSettings');
  if (!modal) return;
  modal.style.display = 'flex';
  renderModalSystemSettings();
}

function fecharModalConfig() {
  const modal = document.getElementById('modalSystemSettings');
  if (modal) modal.style.display = 'none';
}

// --- MENU RÁPIDO DE PLANILHAS DE APOIO (POPOVER NO CABEÇALHO) ---
const MAX_SUPPORT_SHEETS = 10;

function renderSheetsPopover() {
  const btn = document.getElementById('btnOpenSheetsMenu');
  const pop = document.getElementById('sheetsQuickPopover');
  if (btn) {
    btn.classList.toggle('active', !!sheetsMenuAberto);
    btn.setAttribute('aria-expanded', sheetsMenuAberto ? 'true' : 'false');
  }
  if (!pop) return;

  if (!sheetsMenuAberto) {
    pop.style.display = 'none';
    return;
  }

  const sheets = Array.isArray(S.supportSheets) ? S.supportSheets : [];
  const atingiuLimite = sheets.length >= MAX_SUPPORT_SHEETS;
  const editItem = sheetsFormModo === 'edit' ? sheets.find(x => x.id === sheetsEditId) : null;
  if (sheetsFormModo === 'edit' && !editItem) {
    sheetsFormModo = '';
    sheetsEditId = '';
  }

  const formHtml = (sheetsFormModo === 'new' || sheetsFormModo === 'edit') ? `
    <form id="formSupportSheet" data-form="support_sheet" class="sheets-inline-form">
      <div class="sheets-inline-form-head">${sheetsFormModo === 'edit' ? 'Editar planilha' : 'Nova planilha de apoio'}</div>
      <div class="sheets-inline-field">
        <label for="inpSheetTask">Tarefa / Nome da Planilha *</label>
        <input id="inpSheetTask" name="task" placeholder="Ex.: Controle de Frequência" value="${esc(editItem ? editItem.task : '')}" required autocomplete="off">
      </div>
      <div class="sheets-inline-field">
        <label for="inpSheetUrl">Link da Planilha (URL) *</label>
        <input id="inpSheetUrl" name="url" placeholder="https://docs.google.com/spreadsheets/..." value="${esc(editItem ? editItem.url : '')}" required autocomplete="off">
      </div>
      <div class="sheets-inline-actions">
        <button type="submit" class="b p">Salvar</button>
        <button type="button" class="b" data-act="sheets_cancel_form">Cancelar</button>
      </div>
    </form>
  ` : '';

  const listHtml = sheets.map(s => {
    const safeUrl = typeof safeHttpUrl === 'function' ? safeHttpUrl(s.url) : s.url;
    const isEditing = sheetsFormModo === 'edit' && sheetsEditId === s.id;
    return `
      <div class="sheets-item ${isEditing ? 'is-editing' : ''}">
        <a class="sheets-item-link" href="${esc(safeUrl || '#')}" ${safeUrl ? 'target="_blank" rel="noopener noreferrer"' : 'data-act="sheets_invalid_link"'} title="${esc(s.url)}">
          <span class="sheets-item-task">${esc(s.task)}</span>
          <span class="sheets-item-ext" aria-hidden="true">↗</span>
        </a>
        <div class="sheets-item-actions">
          <button type="button" class="sheets-icon-btn" data-act="sheets_edit" data-id="${esc(s.id)}" title="Editar planilha" aria-label="Editar ${esc(s.task)}"><span class="ui-glyph" aria-hidden="true">✎</span></button>
          <button type="button" class="sheets-icon-btn is-del" data-act="sheets_del" data-id="${esc(s.id)}" title="Excluir planilha" aria-label="Excluir ${esc(s.task)}"><span class="ui-glyph" aria-hidden="true">✕</span></button>
        </div>
      </div>
    `;
  }).join('') || '<div class="empty sheets-empty">Nenhuma planilha salva.<br>Clique em <b>+ Nova</b> para adicionar.</div>';

  pop.innerHTML = `
    <div class="sheets-popover-header">
      <div class="sheets-popover-title-wrap">
        <b class="sheets-popover-title">Planilhas de Apoio</b>
        <span class="sheets-popover-count" title="Slots ocupados">${sheets.length}/${MAX_SUPPORT_SHEETS}</span>
      </div>
      <button type="button" class="b p sheets-btn-new" data-act="sheets_open_new" ${atingiuLimite ? 'disabled title="Limite máximo de 10 planilhas atingido"' : 'title="Adicionar nova planilha"'}>+ Nova</button>
    </div>
    ${formHtml}
    <div class="sheets-list">${listHtml}</div>
  `;
  pop.style.display = 'block';
}

// --- POPOVER DE FILTROS EMBUTIDO NA BUSCA GLOBAL ---
const SEARCH_FILTER_OPTIONS = [
  { value: 'todos', label: 'Todos os tipos', desc: 'Visão geral e todas as categorias' },
  { value: 'aulas', label: 'Aulas', desc: 'Quadro, cronogramas e materiais' },
  { value: 'operacional', label: 'Operacional', desc: 'Recibos, reparos e resumos' },
  { value: 'orc', label: 'Orçamento', desc: 'Cotações, fornecedores e histórico' }
];

function renderSearchFilterPopover() {
  const wrap = document.getElementById('globalSearchWrapper');
  const btn = document.getElementById('btnToggleSearchFilter');
  const dot = document.getElementById('searchFilterDot');
  const pop = document.getElementById('searchFilterPopover');
  const hasFilter = (buscaGlobalTipo && buscaGlobalTipo !== 'todos') || !!buscaGlobalExpandida;

  if (wrap) {
    wrap.classList.toggle('has-clear', !!(buscaGlobalTermo && buscaGlobalTermo.trim()));
  }
  if (btn) {
    btn.classList.toggle('is-active', !!hasFilter);
    btn.classList.toggle('is-open', !!searchFilterAberto);
    btn.setAttribute('aria-expanded', searchFilterAberto ? 'true' : 'false');
  }
  if (dot) {
    dot.style.display = hasFilter ? 'block' : 'none';
  }
  if (!pop) return;

  if (!searchFilterAberto) {
    pop.style.display = 'none';
    return;
  }

  const optsHtml = SEARCH_FILTER_OPTIONS.map(opt => {
    const active = (buscaGlobalTipo || 'todos') === opt.value;
    return `
      <button type="button" class="search-filter-option ${active ? 'active' : ''}" data-act="search_filter_select" data-tipo="${esc(opt.value)}">
        <span class="search-filter-option-main">
          <span class="search-filter-option-label">${esc(opt.label)}</span>
          <span class="search-filter-option-desc">${esc(opt.desc)}</span>
        </span>
        <span class="search-filter-option-check" aria-hidden="true">${active ? '✓' : ''}</span>
      </button>
    `;
  }).join('');

  pop.innerHTML = `
    <div class="search-filter-popover-header">
      <b class="search-filter-popover-title">Filtrar por categoria</b>
      <button type="button" class="search-filter-clear-btn" data-act="limpar_filtros_busca" ${!hasFilter ? 'disabled' : ''}>Limpar filtros</button>
    </div>
    <div class="search-filter-options-list">${optsHtml}</div>
  `;
  pop.style.display = 'block';
}

// --- GAVETA LATERAL DE LEMBRETES (DRAWER) ---
function renderDrawer() {
  const lembretes = S.lembretes || [];
  const total = lembretes.length;
  const concluidos = lembretes.filter(l => l.feito).length;
  const pendentes = total - concluidos;
  const pct = total === 0 ? 0 : Math.round((concluidos / total) * 100);
  const badgeHtml = pendentes > 0 ? `<span class="drawer-badge">${pendentes}</span>` : '';

  const tagsList = typeof getPresetList === 'function' ? getPresetList('notas', 'etiquetas') : [];
  if (typeof notaTagSelecionada === 'string' && notaTagSelecionada && !tagsList.some(t => norm(t) === norm(notaTagSelecionada))) {
    notaTagSelecionada = '';
  }

  const tagsChipsHtml = tagsList.map(tag => {
    const ativa = typeof notaTagSelecionada === 'string' && norm(notaTagSelecionada) === norm(tag);
    return `
      <span class="drawer-tag-chip ${ativa ? 'active' : ''}">
        <button type="button" class="drawer-tag-sel" data-act="nota_sel_tag" data-tag="${esc(tag)}" title="${ativa ? 'Remover seleção desta tag' : 'Aplicar tag na próxima nota'}">${esc(tag)}</button>
        <button type="button" class="drawer-tag-del" data-act="nota_del_tag" data-tag="${esc(tag)}" title="Excluir tag">×</button>
      </span>
    `;
  }).join('');

  const novaTagFormHtml = (typeof novaTagNotaAberta !== 'undefined' && novaTagNotaAberta) ? `
    <form data-form="nova_tag_nota" class="drawer-new-tag-form">
      <input id="inpNovaTagNota" name="tag" placeholder="Nome da nova tag..." autocomplete="off" required>
      <button type="submit" class="b p" style="padding:5px 10px; font-size:12px;">Adicionar</button>
      <button type="button" class="b" data-act="toggle_nova_tag_nota" style="padding:5px 8px; font-size:12px;" title="Cancelar">✕</button>
    </form>
  ` : '';

  let itensHtml = lembretes.map(l => `
    <div class="drawer-item ${l.feito ? 'done' : ''}">
      <input type="checkbox" data-act="tog_lembrete" data-id="${esc(l.id)}" ${l.feito ? 'checked' : ''} title="Marcar como feito">
      <div class="drawer-item-text">
        <span class="txt">${esc(l.texto)}</span>
        <span class="time">
          ${l.tag ? `<span class="drawer-item-tag">${esc(l.tag)}</span>` : ''}
          ${esc(l.hora || '')}${l.data ? ' • ' + esc(l.data) : ''}
        </span>
      </div>
      <button class="x" data-act="del_lembrete" data-id="${esc(l.id)}" title="Excluir lembrete" style="padding: 2px 6px;">✕</button>
    </div>
  `).join('') || '<div class="empty" style="padding: 28px 0;">Sem lembretes no momento.<br><span class="mu" style="font-size:12px;">Digite um recado rápido acima!</span></div>';

  const barraProgressoHtml = `
    <div class="drawer-progresso-card">
      <div class="drawer-progresso-topo">
        <div style="display:flex; align-items:center; gap:7px;">
          <span class="ui-glyph" style="font-size:14px;" aria-hidden="true">▤</span>
          <b class="drawer-progresso-titulo">Progresso de Lembretes</b>
        </div>
        <span class="drawer-progresso-pct ${pct === 100 ? 'done' : (pct > 0 ? 'progress' : '')}">
          ${pct}%
        </span>
      </div>

      <div class="drawer-progresso-track" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100" aria-label="Progresso de Lembretes">
        <div class="drawer-progresso-fill ${pct === 100 ? 'done' : ''}" style="width: ${pct}%;">
          <span class="drawer-progresso-shine"></span>
        </div>
      </div>

      <div class="drawer-progresso-sub">
        <span><b>${concluidos}</b> de <b>${total}</b> concluído${total === 1 ? '' : 's'}</span>
        ${total === 0 
          ? '<span class="mu">Sem notas</span>' 
          : (pct === 100 
              ? '<span class="drawer-progresso-ok">Tudo concluído! ✓</span>' 
              : `<span class="drawer-progresso-pend">${pendentes} pendente${pendentes === 1 ? '' : 's'}</span>`
            )
        }
      </div>
    </div>
  `;

  return `
    <button id="btnToggleDrawer" class="drawer-fab" data-act="toggle_drawer" title="Abrir Lembretes Rápidos (Alt + N)">
      <span class="ui-glyph" style="font-size:16px;" aria-hidden="true">✎</span>
      <span class="fab-lbl">Notas</span>
      ${badgeHtml}
    </button>

    <div id="drawerOverlay" class="drawer-overlay ${drawerAberto ? 'open' : ''}" data-act="toggle_drawer"></div>

    <aside id="drawerLembretes" class="drawer-panel ${drawerAberto ? 'open' : ''}">
      <div class="drawer-header">
        <div style="display:flex; align-items:center; gap:8px;">
          <span class="ui-glyph" style="font-size:18px; color:var(--ac);" aria-hidden="true">✎</span>
          <b style="font-size:15px; color:var(--ac);">Lembretes Rápidos</b>
        </div>
        <div style="display:flex; align-items:center; gap:6px;">
          <button class="x" data-act="toggle_drawer" title="Fechar (Esc)" style="font-size:16px;">✕</button>
        </div>
      </div>

      <form data-form="novo_lembrete" class="drawer-form">
        <input name="texto" id="inpNovoLembrete" placeholder="Lembrar de..." required autocomplete="off">
        <button class="b p" style="padding: 8px 14px; font-weight:bold;">+</button>
      </form>
      <div class="drawer-tags-bar">
        ${tagsChipsHtml}
        <button type="button" class="drawer-tag-add-btn ${(typeof novaTagNotaAberta !== 'undefined' && novaTagNotaAberta) ? 'active' : ''}" data-act="toggle_nova_tag_nota" title="Criar nova tag diretamente na gaveta">+ Nova Tag</button>
      </div>
      ${novaTagFormHtml}
      <div class="mu" style="font-size:11.5px; margin: 0 0 10px 2px;">${notaTagSelecionada ? `Etiqueta ativa: <b style="color:var(--ac);">${esc(notaTagSelecionada)}</b> • ` : ''}Pressione Enter para adicionar rapidamente</div>

      ${barraProgressoHtml}

      <div class="drawer-list">
        ${itensHtml}
      </div>

      ${lembretes.some(l => l.feito) ? `
        <div class="drawer-footer">
          <button class="b" data-act="limpar_lembretes_concluidos" style="font-size:12px; width:100%;">
            <span class="ui-glyph" aria-hidden="true">✕</span> Limpar lembretes concluídos
          </button>
        </div>
      ` : ''}
    </aside>
  `;
}

function coletarResultadosBuscaGlobal(termos) {
  const resAulas = S.aulas.filter(a => {
    const diaBr = typeof br === 'function' ? br(a.dia) : a.dia;
    const diaBrAno = a.dia ? a.dia.split('-').reverse().join('/') : '';
    const diaSem = typeof wd === 'function' ? wd(a.dia) : '';
    const profCorpus = typeof expandirCorpusProfessor === 'function' ? expandirCorpusProfessor(a.prof) : (a.prof || '');
    const corpus = `${profCorpus} ${a.turma || ''} ${a.desc || ''} ${a.turno || ''} ${a.formaEnvio || ''} ${a.dia || ''} ${diaBr} ${diaBrAno} ${diaSem} ${a.hora || ''}`;
    return matchBusca(corpus, termos);
  });

  const resReparos = S.reparos.filter(r => {
    const diaReg = typeof br === 'function' ? br(r.dataReg) : r.dataReg;
    const corpus = `${r.item || ''} ${r.local || ''} ${r.resp || ''} ${r.obs || ''} ${r.status || ''} ${diaReg}`;
    return matchBusca(corpus, termos);
  });

  const resDocs = (typeof groups === 'function' ? groups('0000-00-00', '9999-99-99') : []).filter(g => {
    const aulasStr = (g.aulas || []).map(a => `${a.turma || ''} ${a.desc || ''} ${a.hora || ''}`).join(' ');
    const profCorpus = typeof expandirCorpusProfessor === 'function' ? expandirCorpusProfessor(g.prof) : (g.prof || '');
    return matchBusca(`${profCorpus} ${br(g.dia)} ${wd(g.dia)} ${aulasStr}`, termos);
  });

  const resOrc = (S.orc.itens || []).filter(i => {
    const corpus = `${i.forn || ''} ${i.nome || ''} ${i.obs || ''} ${i.link || ''} ${S.orc.titulo || ''} ${S.orc.fornecedor || ''} ${S.orc.categoria || ''} ${i.status || ''}`;
    return matchBusca(corpus, termos);
  });

  const resOrcHist = (S.orcHist || []).filter(h => {
    const itensStr = (h.itens || []).map(x => `${x.forn || ''} ${x.nome || ''} ${x.obs || ''}`).join(' ');
    return matchBusca(`${h.titulo || ''} ${h.fornecedor || ''} ${h.categoria || ''} ${h.obs || ''} ${h.data || ''} ${itensStr}`, termos);
  });

  const resProfessores = (Array.isArray(S.professores) ? S.professores : []).filter(p => {
    const corpus = `${p.name || ''} ${(p.aliases || []).join(' ')} ${(p.subjects || []).join(' ')} ${p.turno || ''} ${p.sala || ''}`;
    return matchBusca(corpus, termos);
  });

  return { resAulas, resReparos, resDocs, resOrc, resOrcHist, resProfessores };
}

function renderResultadosBuscaGeral(termos, dados) {
  const { resAulas, resReparos, resDocs, resOrc, resOrcHist, resProfessores = [] } = dados || coletarResultadosBuscaGlobal(termos);
  const totalOp = resReparos.length + resDocs.length;
  const totalOrc = resOrc.length + resOrcHist.length;
  const totalResultados = resAulas.length + resProfessores.length + totalOp + totalOrc;

  let filtroCategoriasHtml = `
    <div class="search-category-filter-bar">
      <button class="b ${buscaGlobalTipo === 'todos' ? 'p' : ''}" data-act="set_filtro_busca" data-tipo="todos">
        Todos (${totalResultados})
      </button>
      <button class="b ${buscaGlobalTipo === 'aulas' ? 'p' : ''}" data-act="set_filtro_busca" data-tipo="aulas">
        Aulas (${resAulas.length})
      </button>
      <button class="b ${buscaGlobalTipo === 'operacional' ? 'p' : ''}" data-act="set_filtro_busca" data-tipo="operacional">
        Operacional (${totalOp})
      </button>
      <button class="b ${buscaGlobalTipo === 'orc' ? 'p' : ''}" data-act="set_filtro_busca" data-tipo="orc">
        Orçamento (${totalOrc})
      </button>
      <button class="b" data-act="limparBuscaGlobal" style="margin-left:auto;">
        ✕ Limpar busca
      </button>
    </div>
  `;

  let html = filtroCategoriasHtml;

  if ((buscaGlobalTipo === 'todos' || buscaGlobalTipo === 'aulas') && resProfessores.length) {
    html += `<div style="display:flex; justify-content:space-between; align-items:center; gap:8px; margin-top:8px;">
      <h3 style="margin:0;">Professores cadastrados (${resProfessores.length})</h3>
    </div>${resProfessores.map(p => {
      const aliasesTxt = (p.aliases || []).length ? `Apelidos: ${(p.aliases || []).join(', ')}` : '';
      const subjectsTxt = (p.subjects || []).length ? `Disciplinas: ${(p.subjects || []).join(', ')}` : '';
      const detalhes = [aliasesTxt, subjectsTxt].filter(Boolean).join(' • ') || 'Cadastro principal';
      return `<div class="row">
        <div class="t">
          <b>${esc(p.name)}</b>
          <span class="mu">${esc(detalhes)}</span>
        </div>
        <button type="button" class="b" data-act="abrir_prof_cadastro" data-id="${esc(p.id)}" style="font-size:11.5px; padding:3px 9px;">Abrir cadastro &rarr;</button>
      </div>`;
    }).join('')}`;
  }

  if (buscaGlobalTipo === 'todos' || buscaGlobalTipo === 'aulas') {
    html += `<div style="display:flex; justify-content:space-between; align-items:center; gap:8px; margin-top:8px;">
      <h3 style="margin:0;">Aulas encontradas (${resAulas.length})</h3>
      <button class="b" data-act="ir_aba_busca" data-tab="aulas" data-sub="quadro" style="font-size:11.5px; padding:3px 9px;">Abrir em Aulas &rarr;</button>
    </div>${resAulas.map(typeof aulaRow === 'function' ? aulaRow : (a => `<div class="row"><div class="t"><b>${esc(typeof profCanon === 'function' ? profCanon(a.prof) : a.prof)} — ${esc(a.turma)}</b><span class="mu">${wd(a.dia)} ${br(a.dia)}${a.hora ? ' • ' + esc(a.hora) : ''}${a.desc ? ' — ' + esc(a.desc) : ''}</span></div></div>`)).join('') || '<div class="empty">Nenhuma aula encontrada para este filtro.</div>'}`;
  }

  if (buscaGlobalTipo === 'todos' || buscaGlobalTipo === 'operacional') {
    html += `<div style="display:flex; justify-content:space-between; align-items:center; gap:8px; margin-top:12px;">
      <h3 style="margin:0;">Manutenções e Reparos (${resReparos.length})</h3>
      <button class="b" data-act="ir_aba_busca" data-tab="semana" data-sub="reparos" style="font-size:11.5px; padding:3px 9px;">Abrir em Operacional &rarr;</button>
    </div>${resReparos.map(r => `<div class="row"><div class="t"><b>${esc(r.local ? `[${r.local}] ` : '')}${esc(r.item)}</b><span class="mu">${esc(r.status)}${r.resp ? ' • ' + esc(r.resp) : ''}</span></div></div>`).join('') || '<div class="empty">Nenhum chamado correspondente para este filtro.</div>'}`;

    if (resDocs.length) {
      html += `<div style="display:flex; justify-content:space-between; align-items:center; gap:8px; margin-top:12px;">
        <h3 style="margin:0;">Recibos Docentes (${resDocs.length})</h3>
        <button class="b" data-act="ir_aba_busca" data-tab="semana" data-sub="docs" style="font-size:11.5px; padding:3px 9px;">Abrir Recibos &rarr;</button>
      </div>${resDocs.slice(0, 12).map(g => `<div class="row"><div class="t"><b>${esc(g.prof)} — ${wd(g.dia)} ${br(g.dia)}</b><span class="mu">${(g.aulas || []).map(a => esc(a.turma)).join(' + ')}</span></div></div>`).join('')}`;
    }
  }

  if (buscaGlobalTipo === 'todos' || buscaGlobalTipo === 'orc') {
    html += `<div style="display:flex; justify-content:space-between; align-items:center; gap:8px; margin-top:12px;">
      <h3 style="margin:0;">Cotações Atuais e Arquivadas (${totalOrc})</h3>
      <button class="b" data-act="ir_aba_busca" data-tab="orc" style="font-size:11.5px; padding:3px 9px;">Abrir em Orçamento &rarr;</button>
    </div>${resOrc.map(i => `<div class="row"><div class="t"><b>${esc(i.forn || i.nome)} — ${brl(itemTotal(i))}</b><span class="mu">${esc(S.orc.titulo || S.orc.fornecedor || '')} • Status: ${esc(i.status)}</span></div></div>`).join('')}${resOrcHist.map(h => `<div class="row"><div class="t"><b>▪ ${esc(h.titulo || h.fornecedor || 'Arquivado')} (${br(h.data)})</b><span class="mu">${(h.itens || []).length} registro(s)${h.categoria ? ' • ' + esc(h.categoria) : ''}</span></div></div>`).join('')}${totalOrc === 0 ? '<div class="empty">Nenhuma cotação encontrada para este filtro.</div>' : ''}`;
  }

  const rotuloTipo = buscaGlobalTipo === 'aulas' ? 'Aulas' : (buscaGlobalTipo === 'operacional' ? 'Operacional' : (buscaGlobalTipo === 'orc' ? 'Orçamento' : 'Todas as Categorias'));
  return card(`Resultados gerais no painel: "${esc(buscaGlobalTermo)}" [${rotuloTipo}]`, html);
}

// --- ROTEADOR PRINCIPAL DE TELAS ---
function renderTabAtiva() {
  if (tab === 'hoje') {
    if (typeof viewHoje === 'function') return viewHoje();

    // Fallback nativo caso o ficheiro hoje.js não tenha sido carregado
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
    const G = typeof groups === 'function' ? groups(mon(0), addD(mon(0), 6)) : [];
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
            ${alertaVolume ? '<span class="pill w" style="font-size:10px; padding:1px 6px;">⚠\uFE0E 4+</span>' : ''}
          </div>
          <span class="mu stat-link-label"><span>próximo envio de materiais</span>${typeof icoSeta === 'function' ? icoSeta('right', 13) : '&rarr;'}</span>
        </div>
        <div class="stat" data-act="goto_tab" data-tab="aulas" data-sub="quadro" style="cursor: pointer;" title="Ver quadro geral de aulas">
          <b>${confPendentes.length}</b>
          <span class="mu stat-link-label"><span>confirmações pendentes</span>${typeof icoSeta === 'function' ? icoSeta('right', 13) : '&rarr;'}</span>
        </div>
        <div class="stat" data-act="goto_tab" data-tab="semana" data-sub="reparos" style="cursor: pointer;" title="Ir para Manutenções">
          <b>${repPend.length}</b>
          <span class="mu stat-link-label"><span>reparos abertos</span>${typeof icoSeta === 'function' ? icoSeta('right', 13) : '&rarr;'}</span>
        </div>
        <div class="stat" data-act="goto_tab" data-tab="orc" style="cursor: pointer;" title="Ir para Orçamento">
          <b>${orcAguardando.length}</b>
          <span class="mu stat-link-label"><span>orçamentos aguardando</span>${typeof icoSeta === 'function' ? icoSeta('right', 13) : '&rarr;'}</span>
        </div>
        <div class="stat" data-act="goto_tab" data-tab="semana" data-sub="docs" style="cursor: pointer;" title="Ir para Recibos Docentes">
          <b>${typeof docPend === 'function' ? docPend(G) : 0}</b>
          <span class="mu stat-link-label"><span>recibos pendentes</span>${typeof icoSeta === 'function' ? icoSeta('right', 13) : '&rarr;'}</span>
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
      <span class="title-arrow-link" data-act="goto_tab" data-tab="${tabDest}" ${subDest ? `data-sub="${subDest}"` : ''}>
        <span>${texto}</span>
        <span class="title-arrow-badge">${typeof icoSeta === 'function' ? icoSeta('right', 13) : '&rarr;'}</span>
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
        : `<div class="empty">Todos os materiais futuros estão em dia!</div><div style="display:flex; justify-content:flex-end; align-items:center; gap:6px; margin-top:8px;"><span class="mu" style="font-size:11.5px;">Formas de envio:</span>${btnAddEnvio}</div>`,
      matsEnvioPendentes.length
    );

    let htmlConf = card(
      linkTitulo('Confirmações de Aula', 'aulas', 'quadro'),
      aulasConf.length
        ? `<div style="max-height: 240px; overflow-y: auto;">${aulasConf.map(confRowHoje).join('')}</div>`
        : '<div class="empty">Nenhuma aula pendente de confirmação para hoje.</div>',
      confPendentes.length
    );

    let htmlReps = card(
      linkTitulo('Reparos e Manutenções Abertas', 'semana', 'reparos'),
      repPend.length 
        ? `<div style="max-height: 180px; overflow-y: auto;">${repPend.map(reparoRowHoje).join('')}</div>`
        : '<div class="empty" style="padding: 6px 0;">Nenhum chamado aberto!</div>', 
      repPend.length
    );

    const orcLista = orcAguardando.concat(orcProblema);
    let htmlOrc = card(
      linkTitulo('Cotações e Orçamento que precisam de atenção', 'orc', ''),
      orcLista.length
        ? `<div style="max-height: 160px; overflow-y: auto;">${orcLista.map(orcRowHoje).join('')}</div>`
        : '<div class="empty">Nenhum orçamento com pendência.</div>', 
      orcLista.length
    );

    let htmlDocs = card(
      linkTitulo('Recibos Docentes Pendentes (esta semana)', 'semana', 'docs'),
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
  if (tab === 'config') {
    tab = 'hoje';
    return typeof viewHoje === 'function' ? viewHoje() : '';
  }

  return '';
}

function views() {
  const termosBusca = typeof getBuscaTermos === 'function' ? getBuscaTermos() : [];
  const htmlAba = renderTabAtiva();

  if (!termosBusca.length) {
    return htmlAba;
  }

  const dadosBusca = coletarResultadosBuscaGlobal(termosBusca);
  const totalOp = dadosBusca.resReparos.length + dadosBusca.resDocs.length;
  const totalOrc = dadosBusca.resOrc.length + dadosBusca.resOrcHist.length;
  const totalProfs = Array.isArray(dadosBusca.resProfessores) ? dadosBusca.resProfessores.length : 0;
  const totalGeral = dadosBusca.resAulas.length + totalProfs + totalOp + totalOrc;
  const expandida = typeof buscaGlobalExpandida !== 'undefined' && buscaGlobalExpandida;

  const barraBuscaHtml = `
    <div class="global-search-bar-status">
      <div class="global-search-status-info">
        <span><span class="ui-glyph" aria-hidden="true">⌕</span> Filtrando aba ativa por <b>"${esc(buscaGlobalTermo.trim())}"</b></span>
        <div class="global-search-scope-chips">
          <button type="button" class="global-search-scope-btn ${tab === 'aulas' ? 'active' : ''}" data-act="ir_aba_busca" data-tab="aulas" data-sub="quadro">Aulas (${dadosBusca.resAulas.length})</button>
          <button type="button" class="global-search-scope-btn ${tab === 'semana' ? 'active' : ''}" data-act="ir_aba_busca" data-tab="semana">Operacional (${totalOp})</button>
          <button type="button" class="global-search-scope-btn ${tab === 'orc' ? 'active' : ''}" data-act="ir_aba_busca" data-tab="orc">Orçamento (${totalOrc})</button>
        </div>
      </div>
      <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
        <button type="button" class="b ${expandida ? 'p' : ''}" data-act="toggle_busca_geral" style="font-size:12px; padding:5px 10px;">
          ${expandida ? 'Ocultar visão geral' : `Ver todos no painel (${totalGeral})`}
        </button>
        <button type="button" class="b" data-act="limparBuscaGlobal" style="font-size:12px; padding:5px 10px;">✕ Limpar</button>
      </div>
    </div>
  `;

  const mostrarPainelGeral = expandida || (tab === 'hoje' && buscaGlobalTipo !== 'todos');
  return barraBuscaHtml + htmlAba + (mostrarPainelGeral ? renderResultadosBuscaGeral(termosBusca, dadosBusca) : '');
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
  
  navEl.innerHTML = TABS.map(([k, n]) => `<button class="${k === tab ? 'on' : ''}" data-tab="${k}">${n}</button>`).join('');
  
  vEl.innerHTML = views();

  if (tab === 'orc' && typeof montarGraficoRechartsOrc === 'function') {
    montarGraficoRechartsOrc();
  } else if (window.PriusRecharts && typeof window.PriusRecharts.unmount === 'function') {
    window.PriusRecharts.unmount();
  }

  let drawerCont = document.getElementById('drawerContainer');
  if (!drawerCont && document.body) {
    drawerCont = document.createElement('div');
    drawerCont.id = 'drawerContainer';
    document.body.appendChild(drawerCont);
  }
  if (drawerCont) {
    drawerCont.innerHTML = renderDrawer();
  }

  const btnLimpar = document.getElementById('btnLimparBuscaTop');
  if (btnLimpar) {
    btnLimpar.style.display = buscaGlobalTermo.trim() ? 'block' : 'none';
  }
  
  const modalSettings = document.getElementById('modalSystemSettings');
  if (modalSettings && modalSettings.style && modalSettings.style.display !== 'none') {
    renderModalSystemSettings();
  }

  renderSearchFilterPopover();
  renderSheetsPopover();

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
  if (e.target.id === 'campoResumoEditavel') {
    resumoTextoCustomizado = e.target.innerText;
    return;
  }
  if (e.target.id === 'buscaGlobal') { 
    buscaGlobalTermo = e.target.value; 
    const btnLimpar = document.getElementById('btnLimparBuscaTop');
    if (btnLimpar) btnLimpar.style.display = buscaGlobalTermo.trim() ? 'block' : 'none';
    const wrap = document.getElementById('globalSearchWrapper');
    if (wrap) wrap.classList.toggle('has-clear', !!buscaGlobalTermo.trim());
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
  if (e.target.id === 'inpApNome' || e.target.id === 'inpApAlts') {
    atualizarAvisoApelidoForm();
  }
  if (e.target.id === 'filtroGestaoProfs') {
    filtroGestaoProfs = e.target.value;
    let selStart = null, selEnd = null;
    try { selStart = e.target.selectionStart; selEnd = e.target.selectionEnd; } catch (err) {}
    const panelProf = document.getElementById('settingsTabPanelProfessores');
    if (panelProf && typeof cardApelidos === 'function') {
      panelProf.innerHTML = cardApelidos();
      const inp = document.getElementById('filtroGestaoProfs');
      if (inp) {
        inp.focus();
        if (selStart !== null && selEnd !== null) {
          try { inp.setSelectionRange(selStart, selEnd); } catch (err) {}
        }
      }
    }
    return;
  }
});

function atualizarAvisoApelidoForm() {
  const box = document.getElementById('avisoApelidoForm');
  const inpNome = document.getElementById('inpApNome');
  const inpAlts = document.getElementById('inpApAlts');
  if (!box || !inpNome || !inpAlts || typeof analisarApelido !== 'function') return;

  const nomeVal = inpNome.value.trim();
  const altsVal = inpAlts.value.trim();
  if (!nomeVal && !altsVal) {
    box.style.display = 'none';
    box.textContent = '';
    box.className = 'ap-form-aviso';
    return;
  }

  const res = analisarApelido(nomeVal, altsVal.split(','));
  if (!res || res.motivo === 'vazio' || res.motivo === 'criado') {
    box.style.display = 'none';
    box.textContent = '';
    box.className = 'ap-form-aviso';
    return;
  }

  if (res.motivo === 'mesclado') {
    box.className = 'ap-form-aviso info';
    box.textContent = `ℹ\uFE0E "${res.nome}" já está na lista — os novos apelidos serão mesclados ao cadastro existente.`;
    box.style.display = 'block';
  } else if (res.motivo === 'info_oficial') {
    box.className = 'ap-form-aviso info';
    box.textContent = res.msg;
    box.style.display = 'block';
  } else {
    box.className = 'ap-form-aviso warn';
    box.textContent = res.msg;
    box.style.display = 'block';
  }
}

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
  } else if (e.key === 'Escape') {
    const modalSettings = document.getElementById('modalSystemSettings');
    if (modalSettings && modalSettings.style.display !== 'none') {
      fecharModalConfig();
    } else if (searchFilterAberto) {
      searchFilterAberto = false;
      renderSearchFilterPopover();
    } else if (sheetsMenuAberto) {
      sheetsMenuAberto = false;
      sheetsFormModo = '';
      sheetsEditId = '';
      renderSheetsPopover();
    } else if (drawerAberto) {
      drawerAberto = false;
      render();
    }
  } else if ((e.key === 'Enter' || e.key === ' ') && e.target.closest('[data-act="toggle_apelidos_box"]')) {
    e.preventDefault();
    apelidosAberto = !apelidosAberto;
    render();
  }
});

// Suporte a rolagem horizontal suave pelo mouse wheel na barra de navegação
document.addEventListener('wheel', e => {
  const nav = e.target.closest('nav#nav');
  if (nav && nav.scrollWidth > nav.clientWidth && e.deltaY !== 0) {
    e.preventDefault();
    nav.scrollLeft += e.deltaY;
  }
}, { passive: false });

document.addEventListener('click', async e => {
  if (searchFilterAberto && (!e.target || typeof e.target.closest !== 'function' || !e.target.closest('#globalSearchWrapper'))) {
    searchFilterAberto = false;
    renderSearchFilterPopover();
  }
  if (sheetsMenuAberto && (!e.target || typeof e.target.closest !== 'function' || !e.target.closest('#sheetsPopoverAnchor'))) {
    sheetsMenuAberto = false;
    sheetsFormModo = '';
    sheetsEditId = '';
    renderSheetsPopover();
  }
  const modalSettings = document.getElementById('modalSystemSettings');
  if (modalSettings && e.target === modalSettings) {
    fecharModalConfig();
    return;
  }
  const t = e.target.closest('[data-tab],[data-act]'); 
  if (!t) return; 
  
  if (t.dataset.tab && !t.dataset.act) { 
    tab = t.dataset.tab; 
    if (!buscaGlobalTermo.trim()) {
      if (tab === 'aulas') buscaGlobalTipo = 'aulas';
      else if (tab === 'semana') buscaGlobalTipo = 'operacional';
      else if (tab === 'orc') buscaGlobalTipo = 'orc';
      else buscaGlobalTipo = 'todos';
    }
    render(); 
    return; 
  }
  
  const a = t.dataset.act, id = t.dataset.id;

  if (a === 'set_filtro_busca') {
    buscaGlobalTipo = t.dataset.tipo || 'todos';
    render();
    return;
  }

  if (a === 'toggle_search_filter') {
    if (sheetsMenuAberto) {
      sheetsMenuAberto = false;
      sheetsFormModo = '';
      sheetsEditId = '';
      renderSheetsPopover();
    }
    searchFilterAberto = !searchFilterAberto;
    renderSearchFilterPopover();
    return;
  }

  if (a === 'search_filter_select') {
    buscaGlobalTipo = t.dataset.tipo || 'todos';
    if (buscaGlobalTipo === 'aulas') tab = 'aulas';
    else if (buscaGlobalTipo === 'operacional') tab = 'semana';
    else if (buscaGlobalTipo === 'orc') tab = 'orc';
    else if (buscaGlobalTipo === 'todos') tab = 'hoje';
    searchFilterAberto = false;
    render();
    return;
  }

  if (a === 'limpar_filtros_busca') {
    buscaGlobalTipo = 'todos';
    buscaGlobalExpandida = false;
    if (!buscaGlobalTermo.trim()) tab = 'hoje';
    searchFilterAberto = false;
    render();
    return;
  }

  if (a === 'toggle_tema') {
    const atual = document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
    const novo = atual === 'light' ? 'dark' : 'light';
    if (typeof aplicarTema === 'function') aplicarTema(novo);
    render();
    toast(novo === 'light' ? '☀\uFE0E Modo Claro ativado' : '☾ Modo Escuro ativado');
    return;
  }

  if (a === 'set_tema') {
    const novo = t.dataset.tema || 'dark';
    if (typeof aplicarTema === 'function') aplicarTema(novo);
    render();
    toast(novo === 'light' ? '☀\uFE0E Modo Claro ativado' : '☾ Modo Escuro ativado');
    return;
  }

  if (a === 'toggle_sheets_menu') {
    if (searchFilterAberto) {
      searchFilterAberto = false;
      renderSearchFilterPopover();
    }
    sheetsMenuAberto = !sheetsMenuAberto;
    if (!sheetsMenuAberto) {
      sheetsFormModo = '';
      sheetsEditId = '';
    }
    renderSheetsPopover();
    return;
  }

  if (a === 'sheets_open_new') {
    const sheets = Array.isArray(S.supportSheets) ? S.supportSheets : [];
    if (sheets.length >= MAX_SUPPORT_SHEETS) {
      toast(`Limite máximo de ${MAX_SUPPORT_SHEETS} planilhas atingido.`);
      return;
    }
    sheetsFormModo = 'new';
    sheetsEditId = '';
    renderSheetsPopover();
    setTimeout(() => {
      const inp = document.getElementById('inpSheetTask');
      if (inp) inp.focus();
    }, 30);
    return;
  }

  if (a === 'sheets_edit') {
    sheetsFormModo = 'edit';
    sheetsEditId = id || '';
    renderSheetsPopover();
    setTimeout(() => {
      const inp = document.getElementById('inpSheetTask');
      if (inp) inp.focus();
    }, 30);
    return;
  }

  if (a === 'sheets_cancel_form') {
    sheetsFormModo = '';
    sheetsEditId = '';
    renderSheetsPopover();
    return;
  }

  if (a === 'sheets_del') {
    confirmarExclusao(t, () => {
      S.supportSheets = (S.supportSheets || []).filter(x => x.id !== id);
      if (sheetsEditId === id) {
        sheetsFormModo = '';
        sheetsEditId = '';
      }
      save();
      render();
      toast('Planilha removida!');
    });
    return;
  }

  if (a === 'sheets_invalid_link') {
    toast('Link inválido. Edite a planilha para corrigir a URL.');
    return;
  }

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

  if (a === 'toggle_nova_tag_nota') {
    novaTagNotaAberta = !novaTagNotaAberta;
    render();
    if (novaTagNotaAberta) {
      setTimeout(() => {
        const inp = document.getElementById('inpNovaTagNota');
        if (inp) inp.focus();
      }, 40);
    }
    return;
  }

  if (a === 'nota_sel_tag') {
    const tagVal = (t.dataset.tag || '').trim();
    if (tagVal) {
      notaTagSelecionada = (norm(notaTagSelecionada) === norm(tagVal)) ? '' : tagVal;
      render();
    }
    return;
  }

  if (a === 'nota_del_tag') {
    const tagVal = (t.dataset.tag || '').trim();
    if (tagVal && typeof removerPreset === 'function') {
      if (norm(notaTagSelecionada) === norm(tagVal)) {
        notaTagSelecionada = '';
      }
      removerPreset('notas', 'etiquetas', tagVal);
    }
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

  if (a === 'abrir_config' || a === 'abrir_config_modal') {
    abrirModalConfig('geral');
    return;
  }
  if (a === 'fechar_config_modal') {
    fecharModalConfig();
    return;
  }
  if (a === 'settings_tab') {
    settingsTabAtual = t.dataset.tab || 'geral';
    renderModalSystemSettings();
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
    const tipo = t.dataset.tipo || 'dia';
    resumoTipoAtual = tipo;
    if (typeof resolverIntervaloResumo === 'function') {
      const iv = resolverIntervaloResumo(tipo);
      resumoDataIni = iv.dataIni;
      resumoDataFim = iv.dataFim;
    }
    resumoTextoCustomizado = null;

    if (typeof gerarResumoOperacional === 'function') {
      const txt = gerarResumoOperacional(tipo, resumoDataIni, resumoDataFim);
      const elResumo = document.getElementById('campoResumoEditavel');
      if (elResumo) elResumo.innerText = txt;
      copy(txt);
      const rotulo = tipo === 'dia' ? 'do dia' : (tipo === '4' ? 'do mês' : `de ${tipo} semana(s)`);
      toast(`Resumo ${rotulo} carregado e copiado!`);
    }
    render();
    return;
  }

  if (a === 'baixar_planilha_resumo') {
    if (typeof baixarPlanilhaResumo === 'function') {
      await baixarPlanilhaResumo(resumoTipoAtual || 'dia', resumoDataIni, resumoDataFim);
    }
    return;
  }

  if (a === 'copiar_resumo_editado') {
    const elResumo = document.getElementById('campoResumoEditavel');
    const txtPadrao = typeof gerarResumoOperacional === 'function'
      ? gerarResumoOperacional(resumoTipoAtual || 'dia', resumoDataIni, resumoDataFim)
      : '';
    const txt = elResumo ? elResumo.innerText : (typeof resumoTextoCustomizado === 'string' ? resumoTextoCustomizado : txtPadrao);
    copy(txt);
    toast('Resumo copiado para envio no WhatsApp!');
    return;
  }

  if (a === 'restaurar_resumo_original') {
    resumoTextoCustomizado = null;
    if (typeof gerarResumoOperacional === 'function') {
      const txt = gerarResumoOperacional(resumoTipoAtual || 'dia', resumoDataIni, resumoDataFim);
      const elResumo = document.getElementById('campoResumoEditavel');
      if (elResumo) elResumo.innerText = txt;
      toast('Modelo original restaurado!');
      render();
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
    t.textContent = '… Encurtando...';
    if (typeof encurtarUrlAmigavel === 'function') {
      const urlEncurtada = await encurtarUrlAmigavel(inp.value);
      inp.value = urlEncurtada;
      toast('Link higienizado!');
    }
    t.disabled = false;
    t.innerHTML = '<span class="ui-glyph" aria-hidden="true">✂\uFE0E</span> Encurtar';
    return;
  }

  if (a === 'encurtar_link_pedido') {
    const inp = document.getElementById('orc_linkFornecedor');
    if (!inp || !inp.value.trim()) return toast('Cole o link de compra primeiro.');
    t.disabled = true;
    t.textContent = '… Encurtando...';
    if (typeof encurtarUrlAmigavel === 'function') {
      const urlEncurtada = await encurtarUrlAmigavel(inp.value);
      inp.value = urlEncurtada;
      S.orc.link = urlEncurtada;
      save();
      render();
      toast('Link higienizado!');
    } else {
      t.disabled = false;
      t.innerHTML = '<span class="ui-glyph" aria-hidden="true">✂\uFE0E</span> Encurtar';
    }
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
          if (typeof doc.setProperties === 'function') {
            doc.setProperties({ title: 'ARGOS OPS — Compilado de Imagens', creator: 'ARGOS OPS' });
          }
        } else {
          doc.addPage([w, h], orientacao);
        }

        const formato = file.type === 'image/png' ? 'PNG' : 'JPEG';
        doc.addImage(dataUrl, formato, 0, 0, w, h);
      }

      const nomeFinal = arquivos.length === 1
        ? arquivos[0].name.replace(/\.[^.]+$/, '') + '.pdf'
        : `argos-ops-compilado-${hoje}.pdf`;

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
    buscaGlobalExpandida = false;
    const el = document.getElementById('buscaGlobal'); 
    if (el) el.value = ''; 
    const btnLimpar = document.getElementById('btnLimparBuscaTop');
    if (btnLimpar) btnLimpar.style.display = 'none';
    const wrap = document.getElementById('globalSearchWrapper');
    if (wrap) wrap.classList.remove('has-clear');
    render(); 
    if (el) el.focus();
    return;
  }
  if (a === 'toggle_busca_geral') {
    buscaGlobalExpandida = !buscaGlobalExpandida;
    render();
    return;
  }
  if (a === 'ir_aba_busca') {
    tab = t.dataset.tab || 'hoje';
    if (t.dataset.sub) {
      if (tab === 'aulas') subTabAulas = t.dataset.sub;
      if (tab === 'semana') subTabSemana = t.dataset.sub;
    }
    render();
    return;
  }
  if (a === 'limparDestaques') { S.aulas.forEach(item => { item.destaque = null; }); save(); render(); toast('Avisos removidos'); }

  if (a === 'del_aula') confirmarExclusao(t, () => {
    const aulaAlvo = S.aulas.find(x => x.id === id);
    S.aulas = S.aulas.filter(x => x.id !== id);
    if (aulaAlvo && aulaAlvo.turma) {
      const kTurma = norm(aulaAlvo.turma);
      const aindaTem = S.aulas.some(x => norm(x.turma) === kTurma);
      if (aindaTem) {
        if (typeof touchCronograma === 'function') touchCronograma(aulaAlvo.turma, false, new Date().toISOString());
      } else if (S.cronogramas && Object.prototype.hasOwnProperty.call(S.cronogramas, kTurma)) {
        delete S.cronogramas[kTurma];
      }
    }
    save(); render(); toast('Excluída');
  });
  if (a === 'del_reparo') confirmarExclusao(t, () => { S.reparos = S.reparos.filter(x => x.id !== id); save(); render(); toast('Excluído'); });
  if (a === 'del_orcitem') confirmarExclusao(t, () => { S.orc.itens = S.orc.itens.filter(x => x.id !== id); save(); render(); toast('Cotação excluída'); });
  if (a === 'del_orchist') confirmarExclusao(t, () => { S.orcHist = S.orcHist.filter(x => x.id !== id); save(); render(); toast('Removido'); });

  if (a === 'limpar_aulas_passadas') {
    confirmarExclusao(t, () => {
      const antes = S.aulas.length;
      const turmasAntes = new Set(S.aulas.map(x => norm(x.turma)).filter(Boolean));
      S.aulas = S.aulas.filter(x => x.dia >= hoje);
      const removidas = antes - S.aulas.length;
      if (removidas > 0 && S.cronogramas) {
        const turmasRestantes = new Set(S.aulas.map(x => norm(x.turma)).filter(Boolean));
        turmasAntes.forEach(kTurma => {
          if (!turmasRestantes.has(kTurma) && Object.prototype.hasOwnProperty.call(S.cronogramas, kTurma)) {
            delete S.cronogramas[kTurma];
          }
        });
      }
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

  if (a === 'forcar_sync_nuvem') {
    const supaOk = typeof supabaseConfigurado === 'function' && supabaseConfigurado();
    if (!supaOk) {
      toast('⚠\uFE0E Supabase não configurado. Modo offline ativo.');
      render();
      return;
    }

    toast('↻ Sincronizando com o Supabase...');
    let ok = false;
    if (typeof sbPendenciasLocais !== 'undefined' && sbPendenciasLocais && typeof enviarEstadoParaNuvem === 'function') {
      if (typeof sbSyncTimer !== 'undefined') clearTimeout(sbSyncTimer);
      ok = await enviarEstadoParaNuvem();
    } else if (typeof iniciarSupabase === 'function') {
      ok = await iniciarSupabase();
    }

    render();
    if (ok) {
      toast('☁\uFE0E ARGOS OPS sincronizado com sucesso!');
    } else {
      toast('⚠\uFE0E Não foi possível sincronizar. Modo offline ativo.');
    }
    return;
  }

  if (a === 'del_fila') { S.filaMateriais.splice(+t.dataset.i, 1); save(); render(); toast('Removido da fila'); }
  if (a === 'limpar_fila') { S.filaMateriais = []; save(); render(); toast('Fila limpa'); }
  if (a === 'concluir_fila_materiais') {
    const fila = S.filaMateriais || [];
    if (!fila.length) return toast('A fila de materiais já está vazia.');
    let baixadas = 0;
    fila.forEach(item => {
      const proximaAula = S.aulas
        .filter(au => au.dia >= hoje && !au.materialPronto && norm(au.turma) === norm(item.turma))
        .sort((p, q) => (p.dia + (p.hora || '')).localeCompare(q.dia + (q.hora || '')))[0];
      if (proximaAula) {
        const agoraIso = new Date().toISOString();
        proximaAula.materialPronto = true;
        proximaAula.materialConcluidoEm = hoje;
        proximaAula.modificadoEm = agoraIso;
        if (proximaAula.turma && typeof touchCronograma === 'function') {
          touchCronograma(proximaAula.turma, false, agoraIso);
        }
        baixadas++;
      }
    });
    S.filaMateriais = [];
    save();
    render();
    toast(baixadas > 0
      ? `✓ Envio concluído! ${baixadas} pendência(s) de material baixada(s).`
      : '✓ Fila concluída e limpa! Nenhuma pendência futura encontrada para as turmas da fila.');
    return;
  }
  if (a === 'copiar_fila') {
    const txt = S.filaMateriais.map(item => `${item.turma}\n${item.caminho}`).join('\n\n');
    copy(txt);
  }

  if (a === 'rel') {
    const ab = S.reparos.filter(x => x.status !== 'Concluído');
    const co = S.reparos.filter(x => x.status === 'Concluído');
    let txt = `*ARGOS OPS • RELATÓRIO DE REPAROS E MANUTENÇÃO - ${br(hoje)}*\n\n▪ EM ABERTO / ANDAMENTO (${ab.length}):\n`;
    txt += ab.map(r => `• ${r.local ? `*${r.local}*: ` : ''}${r.item}\n  - Aberto em: ${br(r.dataReg || hoje)}${r.resp ? ` | Resp: ${r.resp}` : ''}${r.obs ? ` | Obs: ${r.obs}` : ''}`).join('\n') || 'Nenhum chamado aberto.\n';
    txt += `\n\n✓ FINALIZADOS RECENTEMENTE (${co.length}):\n`;
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

  if (a === 'orc_set_modo') {
    const novoModo = t.dataset.modo === 'pedido_fornecedor' ? 'pedido_fornecedor' : 'comparativo_fornecedores';
    if (S.orc.modo !== novoModo || modoOrcamentoAtual !== novoModo) {
      modoOrcamentoAtual = novoModo;
      S.orc.modo = novoModo;
      if (cotacaoBaseComparacao && cotacaoBaseComparacao.modo !== novoModo) {
        cotacaoBaseComparacao = null;
      }
      save();
      render();
    }
    return;
  }
  if (a === 'orc_set_filtro_hist_modo') {
    const v = t.dataset.v;
    orcHistFiltroModo = (v === 'comparativo_fornecedores' || v === 'pedido_fornecedor') ? v : 'todos';
    render();
    return;
  }
  if (a === 'orc_tog_filtro_hist_modo') {
    orcHistFiltroModo = 'todos';
    render();
    return;
  }
  if (a === 'orc_limpar_comparacao') {
    cotacaoBaseComparacao = null;
    render();
    toast('Comparação de preços removida.');
    return;
  }
  if (a === 'orc_ver_hist_forn') {
    const forn = (t.dataset.forn || '').trim();
    if (!forn) return;
    orcFornHistorico = forn;
    orcItemHistorico = norm(S.orc.titulo || '');
    orcSlideAtivo = 0;
    render();
    requestAnimationFrame(() => {
      const cardEl = document.getElementById('orcRechartsCard');
      if (cardEl && typeof cardEl.scrollIntoView === 'function') {
        cardEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    });
    return;
  }
  if (a === 'orc_fechar_hist_forn') {
    orcFornHistorico = '';
    render();
    return;
  }
  if (a === 'orcxlsx') if (typeof orcXlsx === 'function') orcXlsx();
  if (a === 'orccopy') if (typeof orcCopy === 'function') orcCopy();
  if (a === 'orcsalvarhist') {
    const modoAtual = typeof orcModo === 'function' ? orcModo(S.orc) : (S.orc.modo === 'pedido_fornecedor' ? 'pedido_fornecedor' : 'comparativo_fornecedores');
    if (!S.orc.itens.length) return toast(modoAtual === 'pedido_fornecedor' ? 'Adicione itens ao pedido antes de arquivar' : 'Adicione fornecedores antes de arquivar');
    const tituloPadrao = modoAtual === 'pedido_fornecedor'
      ? (S.orc.fornecedor ? `Pedido — ${S.orc.fornecedor}` : 'Pedido Único')
      : 'Cotação';
    S.orcHist.unshift({ 
      id: uid(), 
      modo: modoAtual,
      data: S.orc.data || hoje, 
      titulo: (S.orc.titulo || '').trim() || tituloPadrao, 
      fornecedor: (S.orc.fornecedor || '').trim(),
      link: (S.orc.link || '').trim(),
      categoria: (S.orc.categoria || '').trim(),
      unidade: (S.orc.unidade || '').trim(),
      qtdTotal: S.orc.qtdTotal || '',
      qtdItens: S.orc.itens.length, 
      obs: S.orc.obs || '',
      itens: JSON.parse(JSON.stringify(S.orc.itens)) 
    });
    cotacaoBaseComparacao = null;
    save(); render(); toast('Cotação arquivada no histórico!');
  }
  if (a === 'orc_carregar_hist') {
    const h = (S.orcHist || []).find(x => x.id === id);
    if (h && confirm(`Carregar "${h.titulo || h.fornecedor || 'Cotação'}" na tela?\nOs dados atuais serão substituídos e a comparação de preços será ativada.`)) {
      const modoHist = h.modo === 'pedido_fornecedor' ? 'pedido_fornecedor' : 'comparativo_fornecedores';
      modoOrcamentoAtual = modoHist;
      S.orc = { 
        inst: (S.orc.inst && S.orc.inst !== 'Prius') ? S.orc.inst : 'ARGOS OPS',
        modo: modoHist,
        titulo: h.titulo || '', 
        fornecedor: h.fornecedor || '',
        link: h.link || '',
        categoria: h.categoria || '',
        unidade: h.unidade || '',
        solic: h.solic || '', 
        data: hoje, 
        obs: h.obs || '', 
        qtdTotal: h.qtdTotal || '',
        itens: JSON.parse(JSON.stringify(h.itens || [])) 
      };
      cotacaoBaseComparacao = typeof orcCriarBaseComparacao === 'function'
        ? orcCriarBaseComparacao(h)
        : null;
      orcFornHistorico = '';
      orcItemHistorico = '';
      orcSlideAtivo = 0;
      save(); render(); toast('▪ Orçamento carregado no modo correspondente com comparação ativa!');
    }
  }
  if (a === 'orcnovo') {
    if (!orcAsk) { orcAsk = true; t.textContent = 'Confirmar limpeza?'; setTimeout(() => { orcAsk = false; if (t.isConnected) t.innerHTML = '<span class="ui-glyph" aria-hidden="true">✕</span> Limpar'; }, 3000); return; }
    orcAsk = false;
    const modoAtual = typeof orcModo === 'function' ? orcModo(S.orc) : 'comparativo_fornecedores';
    S.orc = { inst: S.orc.inst, modo: modoAtual, titulo: '', fornecedor: '', link: '', categoria: '', unidade: '', solic: S.orc.solic, data: hoje, obs: '', qtdTotal: '', itens: [] }; 
    cotacaoBaseComparacao = null;
    orcFornHistorico = '';
    orcItemHistorico = '';
    save(); render(); toast('Orçamento limpo para nova cotação!');
  }

  if (a === 'bkp_download') {
    baixarBackup().then(ok => { if (ok) toast('Backup guardado com sucesso!'); });
  }
  if (a === 'bkp_reverter') reverterSnapshot();
  if (a === 'crsub') { destPre = destPre === t.dataset.t ? '' : t.dataset.t; render(); if (destPre) toast('Envie o PDF novo acima'); }
  if (a === 'crdel') {
    confirmarExclusao(t, () => {
      const alvo = t.dataset.t;
      S.aulas = S.aulas.filter(x => x.turma !== alvo);
      if (S.cronogramas && alvo) {
        const kTurma = norm(alvo);
        if (Object.prototype.hasOwnProperty.call(S.cronogramas, kTurma)) delete S.cronogramas[kTurma];
      }
      if (destPre === alvo) destPre = '';
      save(); render(); toast('Cronograma apagado');
    });
  }
  if (a === 'toggle_apelidos_box') {
    apelidosAberto = !apelidosAberto;
    render();
    return;
  }
  if (a === 'toggle_prof_card') {
    if (id && typeof profsExpandidos !== 'undefined' && profsExpandidos) {
      const cardEl = t.closest('.prof-card');
      const seraAberto = !profsExpandidos.has(id);
      if (seraAberto) profsExpandidos.add(id);
      else profsExpandidos.delete(id);
      if (cardEl) {
        cardEl.classList.toggle('is-expanded', seraAberto);
        t.setAttribute('aria-expanded', seraAberto ? 'true' : 'false');
      } else {
        renderModalSystemSettings();
      }
    }
    return;
  }
  if (a === 'prof_del_alias') {
    if (typeof removerApelidoProfessor === 'function') {
      const res = removerApelidoProfessor(id, t.dataset.val || '');
      if (res && res.ok) {
        if (typeof salvarESincronizarAgora === 'function') salvarESincronizarAgora();
        else save();
        render();
        toast(res.msg || 'Apelido removido.');
      } else if (res && res.msg) {
        toast(res.msg);
      }
    }
    return;
  }
  if (a === 'prof_del_subject') {
    if (typeof removerDisciplinaProfessor === 'function') {
      const res = removerDisciplinaProfessor(id, t.dataset.val || '');
      if (res && res.ok) {
        if (typeof salvarESincronizarAgora === 'function') salvarESincronizarAgora();
        else save();
        render();
        toast(res.msg || 'Disciplina removida.');
      } else if (res && res.msg) {
        toast(res.msg);
      }
    }
    return;
  }
  if (a === 'del_professor') {
    confirmarExclusao(t, () => {
      if (typeof removerProfessorCadastro === 'function' && removerProfessorCadastro(id)) {
        if (typeof salvarESincronizarAgora === 'function') salvarESincronizarAgora();
        else save();
        render();
        toast('Professor removido.');
      }
    });
    return;
  }
  if (a === 'abrir_prof_cadastro') {
    if (id && typeof profsExpandidos !== 'undefined' && profsExpandidos) {
      profsExpandidos.add(id);
    }
    if (typeof filtroGestaoProfs !== 'undefined') filtroGestaoProfs = '';
    abrirModalConfig('professores');
    setTimeout(() => {
      const cardEl = document.querySelector(`.prof-card[data-prof-id="${CSS && CSS.escape ? CSS.escape(id || '') : (id || '')}"]`);
      if (cardEl && typeof cardEl.scrollIntoView === 'function') {
        cardEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 60);
    return;
  }
  if (a === 'ap_unir') {
    if (typeof addApelido === 'function') {
      const res = addApelido(t.dataset.nome, [t.dataset.alt]);
      if (res && res.ok) {
        if (res.prof && typeof profsExpandidos !== 'undefined' && profsExpandidos) {
          profsExpandidos.add(res.prof.id);
        }
        if (typeof salvarESincronizarAgora === 'function') salvarESincronizarAgora();
        else save();
        render();
        toast(res.msg || 'Nomes unidos');
      } else if (res && res.msg) {
        toast(res.msg);
      }
    }
    return;
  }
  if (a === 'ap_todas') {
    if (typeof sugApelidos === 'function' && typeof addApelido === 'function') {
      const sugs = sugApelidos();
      let aplicados = 0;
      let ultimoAviso = '';
      sugs.forEach(s => {
        const res = addApelido(s.nome, [s.alt]);
        if (res && res.ok) {
          aplicados++;
          if (res.prof && typeof profsExpandidos !== 'undefined' && profsExpandidos) {
            profsExpandidos.add(res.prof.id);
          }
        }
        else if (res && res.msg) ultimoAviso = res.msg;
      });
      if (aplicados > 0) {
        if (typeof salvarESincronizarAgora === 'function') salvarESincronizarAgora();
        else save();
        render();
        toast(`✓ ${aplicados} sugestão(ões) aplicada(s)!`);
      } else {
        render();
        toast(ultimoAviso || 'ℹ\uFE0E Nenhuma nova sugestão para aplicar.');
      }
    }
    return;
  }
  if (a === 'del_apelido') confirmarExclusao(t, () => { S.apelidos = S.apelidos.filter(x => x.id !== t.dataset.id); save(); render(); toast('Desfeito'); });
  if (a === 'del_prof_perfil') {
    const key = t.dataset.key;
    if (key && S.profPerfis && S.profPerfis[key]) {
      confirmarExclusao(t, () => {
        delete S.profPerfis[key];
        save();
        render();
        toast('Ficha removida.');
      });
    }
    return;
  }

  // Ações do Gerenciador de Predefinições (dentro do Modal Unificado)
  if (a === 'abrir_presets') {
    if (typeof abrirModalPresets === 'function') abrirModalPresets('reparos', 'locais');
    return;
  }
  if (a === 'fechar_presets') {
    fecharModalConfig();
    return;
  }
  if (a === 'abrir_presets_sub') {
    const cat = t.dataset.cat || 'reparos';
    const sub = t.dataset.sub || '';
    if (typeof abrirModalPresets === 'function') abrirModalPresets(cat, sub);
    return;
  }
  if (a === 'preset_tab') {
    const tabKey = t.dataset.tab || 'reparos';
    presetTabAtual = tabKey;
    presetSubAtual = '';
    const modal = document.getElementById('modalSystemSettings');
    if (modal) {
      modal.querySelectorAll('.modal-presets-tab').forEach(b => b.classList.remove('active'));
      t.classList.add('active');
      if (typeof renderModalPresets === 'function') renderModalPresets();
    }
    return;
  }
  if (a === 'preset_select_sub') {
    const subKey = t.dataset.sub || '';
    if (subKey) {
      presetSubAtual = subKey;
      if (typeof renderModalPresets === 'function') renderModalPresets();
    }
    return;
  }
  if (a === 'preset_del') {
    const cat = t.dataset.cat;
    const sub = t.dataset.sub;
    const val = t.dataset.val;
    if (cat && sub && val) {
      if (confirm(`Remover "${val}" das predefinições?`)) {
        if (typeof removerPreset === 'function') removerPreset(cat, sub, val);
      }
    }
    return;
  }
  if (a === 'prof_preset_tab') {
    profPresetSubAtual = t.dataset.sub || 'disciplinas';
    renderModalSystemSettings();
    setTimeout(() => {
      const inp = document.getElementById('profPresetInputNome');
      if (inp) inp.focus();
    }, 30);
    return;
  }
});

// SUBMIT E FORMULÁRIO DO MODAL DE PREDEFINIÇÕES
document.addEventListener('submit', e => {
  if (e.target && e.target.id === 'formAddPreset') {
    e.preventDefault();
    const nomeInp = document.getElementById('presetInputNome');
    const extraInp = document.getElementById('presetInputExtra');
    const subSel = document.getElementById('presetSelectSub');
    const val = nomeInp ? nomeInp.value.trim() : '';
    const extra = extraInp ? extraInp.value.trim() : '';
    if (!val) return;

    const catKey = typeof presetTabAtual === 'string' ? presetTabAtual : 'reparos';
    const subKey = (subSel && subSel.value) ? subSel.value : (typeof presetSubAtual === 'string' ? presetSubAtual : 'locais');

    if (typeof adicionarPreset === 'function') {
      const ok = adicionarPreset(catKey, subKey, val, extra);
      if (ok) {
        if (nomeInp) nomeInp.value = '';
        if (extraInp) extraInp.value = '';
      }
    }
    return;
  }
});

document.addEventListener('change', async e => {
  const t = e.target, a = t.dataset.act;

  if (t.id === 'presetSelectSub') {
    presetSubAtual = t.value;
    if (typeof renderModalPresets === 'function') renderModalPresets();
    return;
  }
  if (t.id === 'selTurmaSalaPreset') {
    if (t.value) {
      novaTurmaManualNome = t.value;
      render();
    }
    return;
  }
  if (t.id === 'orcFornecedorPresetSelect') {
    const idx = t.value;
    if (idx !== '') {
      const lista = typeof getPresetList === 'function' ? getPresetList('orcamentos', 'fornecedores') : [];
      const fav = lista[+idx];
      if (fav) {
        const nomeF = typeof fav === 'string' ? fav : (fav.nome || '');
        const linkF = (fav && typeof fav === 'object' && fav.link) ? fav.link : '';
        S.orc.fornecedor = nomeF;
        S.orc.link = linkF;
        save();
        render();
        toast(`Fornecedor "${nomeF}" preenchido!`);
      }
    }
    return;
  }
  if (t.id === 'orcComparativoFavSelect') {
    const idx = t.value;
    if (idx !== '') {
      const lista = typeof getPresetList === 'function' ? getPresetList('orcamentos', 'fornecedores') : [];
      const fav = lista[+idx];
      if (fav) {
        const nomeF = typeof fav === 'string' ? fav : (fav.nome || '');
        const linkF = (fav && typeof fav === 'object' && fav.link) ? fav.link : '';
        const inpForn = document.getElementById('cad_fornNome');
        const inpLink = document.getElementById('cad_linkCompra');
        if (inpForn) inpForn.value = nomeF;
        if (inpLink) inpLink.value = linkF;
      }
    }
    return;
  }
  if (a === 'tog') { 
    const item = find(t.dataset.l, t.dataset.id); 
    if (item) { 
      const agoraIso = new Date().toISOString();
      item[t.dataset.f] = t.checked; 
      if (t.dataset.l === 'aulas') {
        if (t.dataset.f === 'confirmada' && t.checked) item.destaque = null; 
        if (t.dataset.f === 'materialPronto') item.materialConcluidoEm = t.checked ? hoje : null;
        item.modificadoEm = agoraIso;
        if (item.turma && typeof touchCronograma === 'function') {
          touchCronograma(item.turma, false, agoraIso);
        }
      }
      save(); 
      render(); 
    } 
  }
  if (a === 'tog_lembrete') {
    const item = (S.lembretes || []).find(x => x.id === t.dataset.id);
    if (item) { item.feito = t.checked; save(); render(); }
  }
  if (a === 'doc') {
    const kDoc = t.dataset.k;
    if (kDoc && kDoc !== '__proto__' && kDoc !== 'constructor' && kDoc !== 'prototype') {
      const d = S.docs[kDoc] = Object.prototype.hasOwnProperty.call(S.docs, kDoc) && S.docs[kDoc] ? S.docs[kDoc] : {};
      d[t.dataset.f] = t.checked;
      save();
      render();
    }
  }
  if (a === 'rep_obs') { const r = find('reparos', t.dataset.id); if (r) { r.obs = t.value; save(); } }
  if (a === 'rep_st') { const r = find('reparos', t.dataset.id); if (r) { r.status = t.value; r.feito = (t.value === 'Concluído'); r.dataConc = r.feito ? hoje : ''; save(); render(); } }
  if (a === 'rep_check') { const r = find('reparos', t.dataset.id); if (r) { r.status = t.checked ? 'Concluído' : 'Pendente'; r.feito = t.checked; r.dataConc = t.checked ? hoje : ''; save(); render(); } }
  if (a === 'orcs') { const i = (S.orc.itens || []).find(x => x.id === t.dataset.id); if (i) { i.status = t.value; save(); render(); } }
  if (a === 'orcf_sel') {
    const i = (S.orc.itens || []).find(x => x.id === t.dataset.id);
    if (i) {
      i[t.dataset.f] = t.value;
      save();
      render();
    }
  }
  if (a === 'ae') {
    const item = find('aulas', t.dataset.id);
    if (item) {
      const campo = t.dataset.f;
      if (campo === '__proto__' || campo === 'constructor' || campo === 'prototype') return;
      const novoValor = t.value.trim();
      const anterior = item[campo] == null ? '' : String(item[campo]);
      if (anterior !== novoValor) {
        const agoraIso = new Date().toISOString();
        item[campo] = novoValor;
        item.modificadoEm = agoraIso;
        if (campo === 'turma') {
          if (anterior && S.aulas.some(x => x.id !== item.id && norm(x.turma) === norm(anterior))) {
            if (typeof touchCronograma === 'function') touchCronograma(anterior, false, agoraIso);
          } else if (anterior && S.cronogramas && Object.prototype.hasOwnProperty.call(S.cronogramas, norm(anterior))) {
            delete S.cronogramas[norm(anterior)];
          }
          if (novoValor && typeof touchCronograma === 'function') {
            const eraNova = !S.aulas.some(x => x.id !== item.id && norm(x.turma) === norm(novoValor));
            touchCronograma(novoValor, eraNova, agoraIso);
          }
        } else if (item.turma && typeof touchCronograma === 'function') {
          touchCronograma(item.turma, false, agoraIso);
        }
        save();
      }
      t.classList.toggle('miss', !novoValor);
    }
  }
  if (a === 'ae_sel') {
    const item = find('aulas', t.dataset.id);
    if (item) {
      const campo = t.dataset.f;
      if (campo === '__proto__' || campo === 'constructor' || campo === 'prototype') return;
      const novoValor = t.value;
      const anterior = item[campo] == null ? '' : String(item[campo]);
      if (anterior !== novoValor) {
        const agoraIso = new Date().toISOString();
        item[campo] = novoValor;
        item.modificadoEm = agoraIso;
        if (item.turma && typeof touchCronograma === 'function') {
          touchCronograma(item.turma, false, agoraIso);
        }
        save();
      }
    }
  }
  if (a === 'prof_perfil_upd') {
    const key = t.dataset.key;
    if (key && key !== '__proto__' && key !== 'constructor' && key !== 'prototype' && S.profPerfis && Object.prototype.hasOwnProperty.call(S.profPerfis, key)) {
      S.profPerfis[key][t.dataset.f] = t.value;
      save();
    }
  }
  if (t.name === 'prof' && t.form && (t.form.dataset.form === 'aula' || t.form.dataset.form === 'aula_manual_nova')) {
    const profObj = typeof buscarProfessorCadastro === 'function' ? buscarProfessorCadastro(t.value) : null;
    const canon = profObj ? profObj.name : (typeof profCanon === 'function' ? profCanon(t.value) : t.value.trim());
    const perfil = (S.profPerfis && canon) ? S.profPerfis[norm(canon)] : null;
    const discPref = (profObj && Array.isArray(profObj.subjects) && profObj.subjects.length ? profObj.subjects[0] : '') || (perfil ? perfil.disciplina : '');
    const turnoPref = (profObj && profObj.turno) || (perfil ? perfil.turno : '');
    const salaPref = (profObj && profObj.sala) || (perfil ? perfil.sala : '');
    if (discPref || turnoPref || salaPref) {
      const inpDesc = t.form.querySelector('input[name="desc"]');
      const selTurno = t.form.querySelector('select[name="turno"]');
      const inpTurma = t.form.querySelector('input[name="turma"]');
      if (inpDesc && !inpDesc.value.trim() && discPref) inpDesc.value = discPref;
      if (selTurno && !selTurno.value && turnoPref) selTurno.value = turnoPref;
      if (inpTurma && !inpTurma.value.trim() && salaPref) inpTurma.value = salaPref;
    }
  }
  if (t.id === 'resumoDataIni' || t.id === 'resumoDataFim') {
    const iniEl = document.getElementById('resumoDataIni');
    const fimEl = document.getElementById('resumoDataFim');
    let ini = (iniEl && iniEl.value) ? iniEl.value : (resumoDataIni || hoje);
    let fim = (fimEl && fimEl.value) ? fimEl.value : (resumoDataFim || ini);
    if (t.id === 'resumoDataIni' && ini > fim) fim = ini;
    if (t.id === 'resumoDataFim' && fim < ini) ini = fim;
    resumoTipoAtual = 'custom';
    resumoDataIni = ini;
    resumoDataFim = fim;
    resumoTextoCustomizado = null;
    render();
    return;
  }
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
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
      const P = await pdfItems(await f.arrayBuffer());
      if (!P.some(p => p.length)) { msg = 'O PDF não tem texto.'; return render(); }
      if (typeof startPdf === 'function') startPdf(P, turmaPad.trim() || turmaDoNome(f.name), f.name);
    } catch (err) { msg = 'Erro ao ler o PDF.'; render(); } finally { t.value = ''; }
  }
  if (t.id === 'filtroProdGraf') { prodFiltroHist = t.value; render(); }
  if (t.id === 'orcFornecedorItemGraf') { orcItemHistorico = t.value; render(); }
  if (t.id === 'dest' && pend) { dest = t.value; if (typeof montar === 'function') montar(); render(); }
  if (t.id === 'nomeNovo' && pend) { nomeNovo = t.value; if (typeof montar === 'function') montar(); render(); }
  if (t.dataset.orc) {
    const campo = t.dataset.orc;
    if (campo === '__proto__' || campo === 'constructor' || campo === 'prototype') return;
    if (campo === 'link') {
      const linkLimpo = typeof sanitizeOptionalLink === 'function' ? sanitizeOptionalLink(t.value) : t.value.trim();
      if (t.value.trim() && !linkLimpo) {
        toast('URL inválida. Informe um link http:// ou https:// válido.');
      }
      S.orc.link = linkLimpo;
    } else {
      S.orc[campo] = t.value;
    }
    save();
    if (campo === 'qtdTotal' && typeof orcTotals === 'function') orcTotals();
    if (campo === 'link' || campo === 'fornecedor' || campo === 'data' || campo === 'categoria' || campo === 'unidade') render();
  }
});

// SUBMIT: Bloqueia recarregamento indevido de página
document.addEventListener('submit', e => {
  e.preventDefault();
  const f = e.target.dataset.form; 
  if (!f) return;
  const d = Object.fromEntries(new FormData(e.target)), id = uid();
  
  if (f === 'aula') {
    const agoraIso = new Date().toISOString();
    const turmaVal = (d.turma || '').trim();
    const eraNova = turmaVal ? !S.aulas.some(x => norm(x.turma) === norm(turmaVal)) : false;
    S.aulas.push({
      id,
      prof: (d.prof || '').trim(),
      turma: turmaVal,
      turno: (d.turno || '').trim(),
      dia: d.dia,
      hora: (d.hora || '').trim(),
      desc: (d.desc || '').trim(),
      confirmada: false,
      destaque: 'nova',
      createdAt: agoraIso,
      modificadoEm: agoraIso
    });
    if (turmaVal && typeof touchCronograma === 'function') {
      touchCronograma(turmaVal, eraNova, agoraIso);
    }
    toast('Aula adicionada!');
  }
  
  if (f === 'prof_novo') {
    if (typeof criarOuObterProfessor === 'function') {
      const res = criarOuObterProfessor(d.nome, { disciplina: d.disciplina });
      if (res && res.prof && typeof profsExpandidos !== 'undefined' && profsExpandidos) {
        profsExpandidos.add(res.prof.id);
      }
      if (res && res.ok) {
        if (typeof salvarESincronizarAgora === 'function') salvarESincronizarAgora();
        else save();
        render();
        toast(res.msg || 'Professor salvo!');
      } else if (res && res.msg) {
        if (res.prof) render();
        toast(res.msg);
      }
    }
    return;
  }

  if (f === 'prof_add_alias') {
    const profId = e.target.dataset.id;
    const aliasVal = (d.alias || '').trim();
    if (!aliasVal) return;
    if (typeof adicionarApelidoProfessor === 'function') {
      const res = adicionarApelidoProfessor(profId, aliasVal);
      if (typeof profsExpandidos !== 'undefined' && profsExpandidos && profId) {
        profsExpandidos.add(profId);
      }
      if (res && res.ok) {
        if (typeof salvarESincronizarAgora === 'function') salvarESincronizarAgora();
        else save();
        render();
        toast(res.msg || 'Apelido adicionado.');
        setTimeout(() => {
          const inp = document.getElementById('inpProfAlias_' + profId);
          if (inp) inp.focus();
        }, 30);
      } else if (res && res.msg) {
        toast(res.msg);
      }
    }
    return;
  }

  if (f === 'prof_add_subject') {
    const profId = e.target.dataset.id;
    const subjVal = (d.subject || '').trim();
    if (!subjVal) return;
    if (typeof adicionarDisciplinaProfessor === 'function') {
      const res = adicionarDisciplinaProfessor(profId, subjVal);
      if (typeof profsExpandidos !== 'undefined' && profsExpandidos && profId) {
        profsExpandidos.add(profId);
      }
      if (res && res.ok) {
        if (typeof salvarESincronizarAgora === 'function') salvarESincronizarAgora();
        else save();
        render();
        toast(res.msg || 'Disciplina vinculada.');
        setTimeout(() => {
          const inp = document.getElementById('inpProfSubject_' + profId);
          if (inp) inp.focus();
        }, 30);
      } else if (res && res.msg) {
        toast(res.msg);
      }
    }
    return;
  }

  if (f === 'prof_perfil') {
    if (typeof salvarProfPerfil === 'function') {
      const ok = salvarProfPerfil(d.nome, d.disciplina, d.turno, d.sala);
      if (ok) {
        if (typeof salvarESincronizarAgora === 'function') salvarESincronizarAgora();
        else save();
        render();
        toast('Ficha do professor salva!');
      } else {
        toast('Informe o nome do professor.');
      }
    }
    return;
  }

  if (f === 'prof_preset_add') {
    const sub = (d.sub || (typeof profPresetSubAtual === 'string' ? profPresetSubAtual : 'disciplinas')).trim();
    const nome = (d.nome || '').trim();
    if (nome && typeof adicionarPreset === 'function') {
      const ok = adicionarPreset('professores', sub, nome);
      if (ok) {
        setTimeout(() => {
          const inp = document.getElementById('profPresetInputNome');
          if (inp) inp.focus();
        }, 30);
      }
    }
    return;
  }

  if (f === 'nova_tag_nota') {
    const tagNome = (d.tag || '').trim();
    if (!tagNome) return;
    if (typeof adicionarPreset === 'function') {
      const ok = adicionarPreset('notas', 'etiquetas', tagNome);
      if (ok) {
        notaTagSelecionada = tagNome;
        novaTagNotaAberta = false;
        render();
      }
    }
    return;
  }

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
      tag: (typeof notaTagSelecionada === 'string' ? notaTagSelecionada.trim() : ''),
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
    const agoraIso = new Date().toISOString();
    const eraNova = !S.aulas.some(x => norm(x.turma) === norm(turma));
    S.aulas.push({
      id,
      turma,
      prof: d.prof.trim(),
      turno: (d.turno || '').trim(),
      dia: d.dia,
      hora: d.hora.trim(),
      desc: (d.desc || '').trim(),
      confirmada: false,
      destaque: 'nova',
      createdAt: agoraIso,
      modificadoEm: agoraIso
    });
    if (typeof touchCronograma === 'function') {
      touchCronograma(turma, eraNova, agoraIso);
    }
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
    S.filaMateriais.push({
      turma: (d.turma || '').trim(),
      caminho: (d.caminho || '').trim(),
      formaEnvio: (d.formaEnvio || '').trim()
    });
    save(); render(); toast('Material adicionado à fila!');
    e.target.reset();
    return;
  }

  if (f === 'orcitem') {
    const forn = d.forn.trim();
    const rawLink = (d.link || '').trim();
    const safeLink = rawLink && typeof sanitizeOptionalLink === 'function' ? sanitizeOptionalLink(rawLink) : rawLink;
    if (rawLink && !safeLink) {
      toast('Link inválido ignorado. Utilize http:// ou https://.');
    }
    S.orc.itens.push({ 
      id, 
      forn, 
      precoSemFrete: d.precoSemFrete.trim(), 
      frete: (d.frete || '').trim(), 
      valorUnd: (d.valorUnd || '').trim(), 
      link: safeLink, 
      status: 'Aguardando aprovação' 
    });
    if (forn && !S.fornecedores.includes(forn)) S.fornecedores.push(forn);
    toast('Fornecedor adicionado à cotação!');
  }

  if (f === 'orc_pedido_item') {
    const nome = (d.nome || '').trim();
    if (!nome) return toast('Informe o nome do item.');
    S.orc.itens.push({
      id,
      nome,
      qtd: (d.qtd || '1').trim(),
      un: (d.un || 'un').trim(),
      valorUnd: (d.valorUnd || '0').trim(),
      status: 'Aguardando aprovação'
    });
    save();
    render();
    toast('Item adicionado ao pedido!');
    setTimeout(() => {
      const inp = document.getElementById('ped_nomeItem');
      if (inp) inp.focus();
    }, 30);
    return;
  }

  if (f === 'support_sheet') {
    const task = (d.task || '').trim();
    const rawUrl = (d.url || '').trim();
    if (!task) return toast('Informe o nome da tarefa ou planilha.');
    const cleanUrl = typeof safeHttpUrl === 'function' ? safeHttpUrl(rawUrl) : rawUrl;
    if (!cleanUrl) return toast('Informe um link válido (ex.: https://docs.google.com/...).');

    S.supportSheets = Array.isArray(S.supportSheets) ? S.supportSheets : [];
    if (sheetsFormModo === 'edit' && sheetsEditId) {
      const alvo = S.supportSheets.find(x => x.id === sheetsEditId);
      if (alvo) {
        alvo.task = task;
        alvo.url = cleanUrl;
        toast('Planilha atualizada!');
      }
    } else {
      if (S.supportSheets.length >= MAX_SUPPORT_SHEETS) {
        sheetsFormModo = '';
        sheetsEditId = '';
        renderSheetsPopover();
        return toast(`Limite máximo de ${MAX_SUPPORT_SHEETS} planilhas atingido.`);
      }
      S.supportSheets.push({ id, task, url: cleanUrl });
      toast('Planilha adicionada!');
    }
    sheetsFormModo = '';
    sheetsEditId = '';
    save();
    render();
    return;
  }

  if (f === 'apelido') {
    e.stopImmediatePropagation();
    if (typeof addApelido === 'function') {
      const res = addApelido(d.nome, String(d.alts || '').split(','));
      if (res && res.ok) {
        save();
        render();
        toast(res.msg || 'Nomes unidos');
      } else {
        toast((res && res.msg) || 'Informe o nome e pelo menos um outro nome');
      }
    }
    return;
  }

  save(); render(); e.target.reset();
});

// --- INICIALIZAÇÃO CONTROLADA PELA ÁRVORE DE DEPENDÊNCIAS (PRIUS BUS) ---
let painelInicializado = false;
function inicializarPainel() {
  if (painelInicializado) return;
  painelInicializado = true;
  render();
  if (typeof iniciarSupabase === 'function') {
    iniciarSupabase();
  }
}

if (typeof PriusBus !== 'undefined') {
  PriusBus.register(
    'app',
    ['core', 'presets', 'orcamento', 'operacional', 'aulas', 'hoje'],
    inicializarPainel,
    { dom: true }
  );

  // Fallback de segurança caso algum módulo opcional falhe no carregamento de rede
  setTimeout(() => {
    if (!painelInicializado && PriusBus.isReady('core', { dom: true })) {
      console.warn('[PriusBus] Inicialização por fallback; módulos pendentes:', PriusBus.getPendingModules());
      inicializarPainel();
    }
  }, 3000);
} else if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', inicializarPainel);
} else {
  inicializarPainel();
}
