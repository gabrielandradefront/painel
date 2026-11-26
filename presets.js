/* ========================================================
   PRESETS.JS - MOTOR DE PREDEFINIÇÕES EDITÁVEIS & MODAL
   ARGOS OPS
======================================================== */

const PRESET_SCHEMA = {
  reparos: [
    { key: 'locais', label: '📍 Locais / Ambientes', placeholder: 'Novo local / ambiente...' },
    { key: 'categorias', label: '🛠️ Categorias de Problema', placeholder: 'Nova categoria de problema...' },
    { key: 'prestadores', label: '👷 Prestadores / Técnicos', placeholder: 'Novo prestador ou técnico...' }
  ],
  professores: [
    { key: 'turnos', label: '⏰ Turnos', placeholder: 'Novo turno (ex: Manhã, Sábado)...' },
    { key: 'salas', label: '🚪 Salas de Aula / Turmas', placeholder: 'Nova sala ou turma padrão...' },
    { key: 'disciplinas', label: '📚 Disciplinas / Áreas', placeholder: 'Nova disciplina / área de atuação...' }
  ],
  orcamentos: [
    { key: 'fornecedores', label: '🏢 Fornecedores Favoritos', placeholder: 'Nome do fornecedor favorito...' },
    { key: 'categorias', label: '🏷️ Categorias / Centros de Custo', placeholder: 'Nova categoria / centro de custo...' },
    { key: 'unidades', label: '📏 Unidades de Medida', placeholder: 'Nova unidade (ex: un, cx, pct, kg)...' }
  ],
  notas: [
    { key: 'etiquetas', label: '🏷️ Etiquetas / Tags', placeholder: 'Nova etiqueta / tag...' }
  ]
};

let presetTabAtual = 'reparos';
let presetSubAtual = 'locais';

function getPresets() {
  S.presets = S.presets && typeof S.presets === 'object' ? S.presets : {};
  return S.presets;
}

function getPresetList(categoria, subcategoria) {
  const p = getPresets();
  if (p[categoria] && Array.isArray(p[categoria][subcategoria])) {
    return p[categoria][subcategoria];
  }
  return [];
}

function resolverTabSubPreset(catInicial = 'reparos', subInicial = '') {
  let cat = String(catInicial || 'reparos').trim();
  let sub = String(subInicial || '').trim();
  if (cat === 'orcamentos_fornecedores') {
    cat = 'orcamentos';
    sub = 'fornecedores';
  }
  if (!PRESET_SCHEMA[cat]) cat = 'reparos';
  const subs = PRESET_SCHEMA[cat];
  if (!sub || !subs.some(s => s.key === sub)) {
    sub = subs[0].key;
  }
  return { cat, sub };
}

function renderPresetSelectOptions(valores, selecionado = '', placeholder = 'Selecione...', incluirVazio = true) {
  const list = Array.isArray(valores) ? valores : [];
  const selStr = String(selecionado ?? '').trim();
  const normSel = norm(selStr);
  let achou = false;

  const opts = list.map(item => {
    const val = typeof item === 'string' ? item : (item && item.nome ? item.nome : '');
    const selected = normSel && norm(val) === normSel;
    if (selected) achou = true;
    return `<option value="${esc(val)}" ${selected ? 'selected' : ''}>${esc(val)}</option>`;
  });

  if (selStr && !achou) {
    opts.unshift(`<option value="${esc(selStr)}" selected>${esc(selStr)}</option>`);
  }

  const vazioHtml = incluirVazio ? `<option value="" ${!selStr ? 'selected' : ''}>${esc(placeholder)}</option>` : '';
  return vazioHtml + opts.join('');
}

function adicionarPreset(categoria, subcategoria, itemValor, extraLink = '') {
  const p = getPresets();
  p[categoria] = p[categoria] || {};
  p[categoria][subcategoria] = Array.isArray(p[categoria][subcategoria]) ? p[categoria][subcategoria] : [];

  const lista = p[categoria][subcategoria];
  const nomeLimpo = (itemValor || '').trim();
  if (!nomeLimpo) {
    toast('Digite o nome da opção.');
    return false;
  }

  if (categoria === 'orcamentos' && subcategoria === 'fornecedores') {
    const linkLimpo = (extraLink || '').trim();
    if (lista.some(x => (typeof x === 'object' ? norm(x.nome) : norm(x)) === norm(nomeLimpo))) {
      toast('Este fornecedor já existe na lista.');
      return false;
    }
    lista.push({ nome: nomeLimpo, link: linkLimpo });
  } else {
    if (lista.some(x => {
      const val = typeof x === 'string' ? x : (x && x.nome ? x.nome : '');
      return norm(val) === norm(nomeLimpo);
    })) {
      toast('Esta opção já existe na lista.');
      return false;
    }
    lista.push(nomeLimpo);
  }

  save();
  renderModalPresets();
  if (typeof render === 'function') render();
  toast('Opção adicionada com sucesso!');
  return true;
}

function removerPreset(categoria, subcategoria, indexOrName) {
  const p = getPresets();
  if (!p[categoria] || !Array.isArray(p[categoria][subcategoria])) return false;
  const lista = p[categoria][subcategoria];

  if (typeof indexOrName === 'number') {
    lista.splice(indexOrName, 1);
  } else {
    p[categoria][subcategoria] = lista.filter(x => {
      const val = typeof x === 'string' ? x : (x && x.nome ? x.nome : '');
      return norm(val) !== norm(indexOrName);
    });
  }

  save();
  renderModalPresets();
  if (typeof render === 'function') render();
  toast('Opção removida.');
  return true;
}

function renderModalPresets() {
  const container = document.getElementById('modalPresetsChipsContainer');
  const selectSub = document.getElementById('presetSelectSub');
  const inputExtra = document.getElementById('presetInputExtra');
  const inputNome = document.getElementById('presetInputNome');
  if (!container) return;

  const resolvido = resolverTabSubPreset(presetTabAtual, presetSubAtual);
  presetTabAtual = resolvido.cat;
  presetSubAtual = resolvido.sub;

  const modal = document.getElementById('modalSystemSettings');
  if (modal) {
    modal.querySelectorAll('.modal-presets-tab').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === presetTabAtual);
    });
  }

  const catKey = presetTabAtual;
  const subcategorias = PRESET_SCHEMA[catKey] || [];
  const subAtivaObj = subcategorias.find(s => s.key === presetSubAtual) || subcategorias[0];

  if (selectSub) {
    selectSub.innerHTML = subcategorias.map(s =>
      `<option value="${esc(s.key)}" ${s.key === presetSubAtual ? 'selected' : ''}>${esc(s.label)}</option>`
    ).join('');
  }

  if (inputNome && subAtivaObj) {
    inputNome.placeholder = subAtivaObj.placeholder || 'Nome da nova opção...';
  }

  if (inputExtra) {
    if (catKey === 'orcamentos' && presetSubAtual === 'fornecedores') {
      inputExtra.style.display = 'block';
      inputExtra.placeholder = 'Link padrão de compra (URL opcional)';
    } else {
      inputExtra.style.display = 'none';
      inputExtra.value = '';
    }
  }

  let html = '';
  subcategorias.forEach(sub => {
    const itens = getPresetList(catKey, sub.key);
    const ehAtiva = sub.key === presetSubAtual;
    html += `
      <div class="preset-sub-group ${ehAtiva ? 'active-sub' : ''}" data-sub-group="${esc(sub.key)}">
        <div class="preset-sub-header" data-act="preset_select_sub" data-sub="${esc(sub.key)}" title="Clique para selecionar esta subcategoria ao adicionar">
          <span class="preset-sub-title">${sub.label} (${itens.length})${ehAtiva ? ' <span class="pill o" style="font-size:10px; padding:1px 6px; margin-left:4px;">Selecionada</span>' : ''}</span>
          <span class="mu" style="font-size: 11px; font-weight:normal;">Clique no × para remover</span>
        </div>
        <div style="display:flex; flex-wrap:wrap; gap:6px;">
          ${itens.map(item => {
            const val = typeof item === 'string' ? item : (item && item.nome ? item.nome : '');
            const linkStr = (item && typeof item === 'object' && item.link) ? item.link.trim() : '';
            const hrefSeguro = linkStr ? (/^https?:\/\//i.test(linkStr) ? linkStr : 'https://' + linkStr) : '';
            const linkTag = hrefSeguro ? ` <a href="${esc(hrefSeguro)}" target="_blank" rel="noopener noreferrer" title="${esc(linkStr)}" style="color:var(--ac); font-size:11px; text-decoration:none;">🔗</a>` : '';
            return `
              <div class="preset-chip">
                <span>${esc(val)}${linkTag}</span>
                <button type="button" class="preset-chip-del" data-act="preset_del" data-cat="${esc(catKey)}" data-sub="${esc(sub.key)}" data-val="${esc(val)}" title="Remover">×</button>
              </div>
            `;
          }).join('') || '<span class="mu" style="font-size: 12px; font-style: italic;">Nenhum item cadastrado nesta subcategoria.</span>'}
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
}

function abrirModalPresets(catInicial = 'reparos', subInicial = '') {
  const { cat, sub } = resolverTabSubPreset(catInicial, subInicial);
  presetTabAtual = cat;
  presetSubAtual = sub;

  if (typeof abrirModalConfig === 'function') {
    abrirModalConfig('presets');
  } else {
    const modalFallback = document.getElementById('modalSystemSettings');
    if (modalFallback) modalFallback.style.display = 'flex';
  }

  const modal = document.getElementById('modalSystemSettings');
  if (modal) {
    const tabs = modal.querySelectorAll('.modal-presets-tab');
    tabs.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === cat);
    });
    renderModalPresets();
    setTimeout(() => {
      const inp = document.getElementById('presetInputNome');
      if (inp) inp.focus();
    }, 30);
  }
}

function fecharModalPresets() {
  if (typeof fecharModalConfig === 'function') {
    fecharModalConfig();
    return;
  }
  const modal = document.getElementById('modalSystemSettings');
  if (modal) modal.style.display = 'none';
}

// Botão discreto rápido (+ / ⚙️) ao lado de selects e campos de predefinições
function presetGearBtn(cat, sub, label = '⚙️', title = 'Gerenciar predefinições') {
  return `<button type="button" class="b preset-quick-btn" data-act="abrir_presets_sub" data-cat="${esc(cat)}" data-sub="${esc(sub)}" title="${esc(title)}" aria-label="${esc(title)}">${label}</button>`;
}

if (typeof PriusBus !== 'undefined') {
  PriusBus.register('presets', ['core']);
}
