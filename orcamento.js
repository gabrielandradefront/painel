/* ========================================================
   ORCAMENTO.JS - COTAÇÕES, COMPARAÇÃO E HISTÓRICO
   Painel Operacional Prius
======================================================== */

// Utilitário para limpar parâmetros de rastreamento e encurtar URLs
async function encurtarUrlAmigavel(urlBruta) {
  let url = (urlBruta || '').trim();
  if (!url) return '';
  if (!/^https?:\/\//i.test(url)) url = 'https://' + url;

  try {
    const u = new URL(url);
    const paramsParaRemover = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'fbclid', 'gclid', 'ref', 'source', 'tracking_id'];
    paramsParaRemover.forEach(p => u.searchParams.delete(p));
    const urlLimpa = u.toString();

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2500);

    const resp = await fetch(`https://is.gd/create.php?format=json&url=${encodeURIComponent(urlLimpa)}`, {
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (resp.ok) {
      const data = await resp.json();
      if (data && data.shorturl) return data.shorturl;
    }
  } catch (err) {}

  try {
    const u = new URL(url);
    const paramsParaRemover = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'fbclid', 'gclid', 'ref'];
    paramsParaRemover.forEach(p => u.searchParams.delete(p));
    return u.toString();
  } catch (e) {
    return url;
  }
}

function extrairDominio(link) {
  if (!link) return '';
  try {
    const u = new URL(/^https?:\/\//i.test(link) ? link : 'https://' + link);
    return u.hostname.replace(/^www\./i, '');
  } catch (e) {
    return 'link';
  }
}

// Helpers de modo de cotação e comparação de preços
function orcModo(o = S.orc) {
  return (o && o.modo === 'pedido_fornecedor') ? 'pedido_fornecedor' : 'comparativo_fornecedores';
}

function orcItemQtd(i) {
  if (!i || i.qtd === undefined || i.qtd === '') return 1;
  return Math.max(0, num(i.qtd));
}

function orcItemValorUnitario(i, modo = orcModo(), qtdTotal = num(S.orc.qtdTotal)) {
  if (!i) return 0;
  if (modo === 'pedido_fornecedor') return num(i.valorUnd);
  if (i.valorUnd !== undefined && i.valorUnd !== '') return num(i.valorUnd);
  if (qtdTotal > 0) return itemPrecoSemFrete(i) / qtdTotal;
  return itemTotal(i);
}

function orcItemSubtotal(i, modo = orcModo()) {
  if (!i) return 0;
  if (modo === 'pedido_fornecedor') return orcItemQtd(i) * num(i.valorUnd);
  return itemTotal(i);
}

function orcTotalReferencia(o = S.orc) {
  const modo = orcModo(o);
  const itens = (o && Array.isArray(o.itens)) ? o.itens : [];
  if (!itens.length) return 0;
  if (modo === 'pedido_fornecedor') {
    return itens.reduce((acc, i) => acc + orcItemSubtotal(i, modo), 0);
  }
  const positivos = itens.map(itemTotal).filter(v => v > 0);
  return positivos.length ? Math.min(...positivos) : Math.min(...itens.map(itemTotal));
}

function orcChaveItem(i, modo = orcModo()) {
  if (!i) return '';
  return norm(modo === 'pedido_fornecedor' ? (i.nome || i.forn || '') : (i.forn || i.nome || ''));
}

function orcCriarBaseComparacao(h) {
  const modo = orcModo(h);
  const qtdTotal = num(h.qtdTotal);
  const itensMap = {};
  (h.itens || []).forEach(i => {
    const k = orcChaveItem(i, modo);
    if (k) itensMap[k] = orcItemValorUnitario(i, modo, qtdTotal);
  });
  return {
    data: h.data || hoje,
    modo,
    total: orcTotalReferencia(h),
    itens: itensMap
  };
}

function orcBadgeComparacaoHtml(i, modo = orcModo(), qtdTotal = num(S.orc.qtdTotal)) {
  if (!cotacaoBaseComparacao || cotacaoBaseComparacao.modo !== modo) return '';
  const chave = orcChaveItem(i, modo);
  if (!chave) return '';

  const mapa = cotacaoBaseComparacao.itens || {};
  if (!Object.prototype.hasOwnProperty.call(mapa, chave)) {
    return '<span class="orc-cmp-badge novo">🆕 novo</span>';
  }

  const valorAnt = num(mapa[chave]);
  const valorAtual = orcItemValorUnitario(i, modo, qtdTotal);

  if (Math.abs(valorAtual - valorAnt) < 0.005) {
    return '<span class="orc-cmp-badge igual">= igual</span>';
  }

  const diff = valorAtual - valorAnt;
  const pctRaw = valorAnt > 0 ? Math.abs((diff / valorAnt) * 100) : 100;
  const pctStr = pctRaw < 1 && pctRaw > 0 ? pctRaw.toFixed(1).replace('.', ',') : String(Math.round(pctRaw));

  if (diff > 0) {
    return `<span class="orc-cmp-badge alta">▲ +${pctStr}% (era ${brl(valorAnt)})</span>`;
  }
  return `<span class="orc-cmp-badge baixa">▼ -${pctStr}% (era ${brl(valorAnt)})</span>`;
}

function orcResumoComparacaoInnerHtml(modo = orcModo()) {
  if (!cotacaoBaseComparacao || cotacaoBaseComparacao.modo !== modo) return '';
  const baseTotal = cotacaoBaseComparacao.total || 0;
  const atualTotal = orcTotalReferencia(S.orc);
  const dif = atualTotal - baseTotal;
  const difClass = dif > 0.005 ? 'alta' : (dif < -0.005 ? 'baixa' : 'igual');
  const difSinal = dif > 0.005 ? '+' : (dif < -0.005 ? '-' : '');
  const difFmt = `${difSinal}${brl(Math.abs(dif))}`;

  return `
    <div class="orc-cmp-summary-text">
      <span>📊 Pedido anterior (<b>${br(cotacaoBaseComparacao.data)}</b>): <b>${brl(baseTotal)}</b></span>
      <span class="orc-cmp-arrow">→</span>
      <span>Atual: <b>${brl(atualTotal)}</b></span>
      <span class="orc-cmp-sep">|</span>
      <span>Diferença: <b class="orc-cmp-diff ${difClass}">${difFmt}</b></span>
    </div>
    <button type="button" class="b orc-cmp-clear" data-act="orc_limpar_comparacao" title="Remover referência de comparação">✕ Limpar comparação</button>
  `;
}

function orcTotals() {
  const modo = orcModo();
  const itens = S.orc.itens || [];
  const qtdTotal = num(S.orc.qtdTotal);

  if (modo === 'pedido_fornecedor') {
    let somaPedido = 0;
    itens.forEach(i => {
      const sub = orcItemSubtotal(i, modo);
      somaPedido += sub;
      const elSub = document.getElementById(`os-${i.id}`);
      if (elSub) elSub.textContent = brl(sub);
      const elCmp = document.getElementById(`ocmp-${i.id}`);
      if (elCmp) elCmp.innerHTML = orcBadgeComparacaoHtml(i, modo, qtdTotal);
    });
    const elTotalPedido = document.getElementById('orcPedidoTotal');
    if (elTotalPedido) elTotalPedido.textContent = brl(somaPedido);
  } else {
    itens.forEach(i => {
      const total = itemTotal(i);
      const elTot = document.getElementById(`ot-${i.id}`);
      if (elTot) elTot.textContent = brl(total);

      const elUnd = document.getElementById(`ou-${i.id}`);
      if (elUnd) {
        if (i.valorUnd !== undefined && i.valorUnd !== '') {
          elUnd.textContent = brl(num(i.valorUnd));
        } else if (qtdTotal > 0) {
          elUnd.textContent = brl(itemPrecoSemFrete(i) / qtdTotal);
        } else {
          elUnd.textContent = '—';
        }
      }

      const elCmp = document.getElementById(`ocmp-${i.id}`);
      if (elCmp) elCmp.innerHTML = orcBadgeComparacaoHtml(i, modo, qtdTotal);
    });

    const menorValor = itens.length ? Math.min(...itens.map(itemTotal)) : 0;
    itens.forEach(i => {
      const badgeMenor = document.getElementById(`ob-${i.id}`);
      if (badgeMenor) {
        badgeMenor.style.display = (itemTotal(i) === menorValor && menorValor > 0) ? 'inline-block' : 'none';
      }
    });
  }

  const elResumo = document.getElementById('orcComparacaoResumo');
  if (elResumo) {
    if (cotacaoBaseComparacao && cotacaoBaseComparacao.modo === modo) {
      elResumo.style.display = 'flex';
      elResumo.innerHTML = orcResumoComparacaoInnerHtml(modo);
    } else {
      elResumo.style.display = 'none';
      elResumo.innerHTML = '';
    }
  }

  if (tab === 'orc' && orcSlideAtivo === 0 && typeof montarGraficoRechartsOrc === 'function') {
    montarGraficoRechartsOrc();
  }
}

// ========================================================
// GRÁFICO RECHARTS: HISTÓRICO DE PREÇOS POR FORNECEDOR
// ========================================================
function orcFornecedorAtivoGrafico() {
  if (orcModo() === 'pedido_fornecedor') {
    return (S.orc.fornecedor || '').trim();
  }
  return (orcFornHistorico || '').trim();
}

function orcHistoricoFornecedorDados(fornecedorNome) {
  const fornLimpo = (fornecedorNome || '').trim();
  const fornKey = norm(fornLimpo);
  if (!fornKey) return { fornecedor: '', itens: [] };

  const itensMap = new Map();

  function registrarPonto(nomeBruto, dataIso, preco, origem, tituloCot) {
    const nome = (nomeBruto || '').trim();
    const key = norm(nome);
    if (!key || !(preco > 0)) return;
    if (!itensMap.has(key)) {
      itensMap.set(key, { key, nome, pontos: [] });
    }
    itensMap.get(key).pontos.push({
      data: dataIso || hoje,
      preco: Number(preco.toFixed(2)),
      origem,
      titulo: (tituloCot || '').trim()
    });
  }

  (S.orcHist || []).forEach(h => {
    const hModo = orcModo(h);
    const hQtd = num(h.qtdTotal);
    const hData = h.data || hoje;
    if (hModo === 'pedido_fornecedor') {
      if (norm(h.fornecedor || '') === fornKey) {
        (h.itens || []).forEach(it => {
          const preco = orcItemValorUnitario(it, 'pedido_fornecedor', hQtd);
          registrarPonto(it.nome || it.forn || h.titulo, hData, preco, 'historico', h.titulo);
        });
      }
    } else {
      (h.itens || []).forEach(it => {
        if (norm(it.forn || '') === fornKey) {
          const nomeItem = (h.titulo || '').trim() || (it.nome || '').trim() || 'Item cotado';
          const preco = orcItemValorUnitario(it, 'comparativo_fornecedores', hQtd);
          registrarPonto(nomeItem, hData, preco, 'historico', h.titulo);
        }
      });
    }
  });

  // Inclui a cotação ativa na tela para refletir variações em tempo real
  const aModo = orcModo(S.orc);
  const aQtd = num(S.orc.qtdTotal);
  const aData = S.orc.data || hoje;
  if (aModo === 'pedido_fornecedor') {
    if (norm(S.orc.fornecedor || '') === fornKey) {
      (S.orc.itens || []).forEach(it => {
        const preco = orcItemValorUnitario(it, 'pedido_fornecedor', aQtd);
        registrarPonto(it.nome || it.forn || S.orc.titulo, aData, preco, 'atual', S.orc.titulo);
      });
    }
  } else {
    (S.orc.itens || []).forEach(it => {
      if (norm(it.forn || '') === fornKey) {
        const nomeItem = (S.orc.titulo || '').trim() || (it.nome || '').trim() || 'Item cotado';
        const preco = orcItemValorUnitario(it, 'comparativo_fornecedores', aQtd);
        registrarPonto(nomeItem, aData, preco, 'atual', S.orc.titulo);
      }
    });
  }

  const itens = Array.from(itensMap.values()).map(entry => {
    entry.pontos.sort((a, b) => {
      const cmp = (a.data || '').localeCompare(b.data || '');
      if (cmp !== 0) return cmp;
      if (a.origem === b.origem) return 0;
      return a.origem === 'historico' ? -1 : 1;
    });

    const recentes = entry.pontos.slice(-12);
    const contagemDatas = {};
    const pontosFormatados = recentes.map((p, idx) => {
      const baseLabel = br(p.data);
      contagemDatas[baseLabel] = (contagemDatas[baseLabel] || 0) + 1;
      const label = p.origem === 'atual' && contagemDatas[baseLabel] > 1
        ? `${baseLabel} (Atual)`
        : contagemDatas[baseLabel] > 1
          ? `${baseLabel} #${contagemDatas[baseLabel]}`
          : baseLabel;

      let deltaPct = null;
      if (idx > 0 && recentes[idx - 1].preco > 0) {
        const raw = ((p.preco - recentes[idx - 1].preco) / recentes[idx - 1].preco) * 100;
        deltaPct = (Math.abs(raw) < 1 && raw !== 0) ? Number(raw.toFixed(1)) : Math.round(raw);
      }

      return { ...p, label, deltaPct };
    });

    return {
      key: entry.key,
      nome: entry.nome,
      pontos: pontosFormatados
    };
  });

  itens.sort((a, b) => {
    if (b.pontos.length !== a.pontos.length) return b.pontos.length - a.pontos.length;
    return a.nome.localeCompare(b.nome, 'pt-BR');
  });

  return { fornecedor: fornLimpo, itens };
}

function orcSelecionarItemHistorico(dados) {
  if (!dados || !dados.itens.length) return null;
  if (orcItemHistorico) {
    const chave = norm(orcItemHistorico);
    const achado = dados.itens.find(it => it.key === orcItemHistorico || it.key === chave);
    if (achado) return achado;
  }
  return dados.itens[0];
}

function orcMetricasItemHistorico(pontos) {
  if (!pontos || !pontos.length) return null;
  const precos = pontos.map(p => p.preco);
  const ultimo = precos[precos.length - 1];
  const menor = Math.min(...precos);
  const media = precos.reduce((acc, v) => acc + v, 0) / precos.length;
  const primeiro = precos[0];

  let varTexto = '1ª cotação';
  let varCor = 'var(--mu)';
  if (pontos.length > 1 && primeiro > 0) {
    const raw = ((ultimo - primeiro) / primeiro) * 100;
    const pct = (Math.abs(raw) < 1 && raw !== 0) ? Number(raw.toFixed(1)) : Math.round(raw);
    if (pct > 0) {
      varTexto = `▲ +${pct}%`;
      varCor = 'var(--er)';
    } else if (pct < 0) {
      varTexto = `▼ ${pct}%`;
      varCor = 'var(--ok)';
    } else {
      varTexto = '= 0%';
    }
  }
  return { ultimo, menor, media, varTexto, varCor };
}

function orcFooterHistoricoFornecedorHtml(fornecedorNome, permiteFechar = false) {
  const forn = (fornecedorNome || '').trim();
  if (!forn) return '';

  const dados = orcHistoricoFornecedorDados(forn);
  const itemSel = orcSelecionarItemHistorico(dados);
  const metricas = itemSel ? orcMetricasItemHistorico(itemSel.pontos) : null;

  const selectItensHtml = dados.itens.length
    ? `
      <select id="orcFornecedorItemGraf" style="font-size:12.5px; padding:5px 8px; max-width:260px;" title="Selecione o item recorrente para ver o histórico de preços">
        ${dados.itens.map(it => `<option value="${esc(it.key)}" ${itemSel && it.key === itemSel.key ? 'selected' : ''}>${esc(it.nome)} (${it.pontos.length} ${it.pontos.length === 1 ? 'cotação' : 'cotações'})</option>`).join('')}
      </select>
    `
    : '';

  const btnFecharHtml = permiteFechar
    ? `<button class="b" data-act="orc_fechar_hist_forn" style="font-size:11.5px; padding:4px 9px;" title="Ocultar histórico deste fornecedor">✕ Fechar</button>`
    : '';

  const corpoHtml = itemSel && metricas
    ? `
      <div class="orc-recharts-kpis">
        <div class="orc-recharts-kpi">
          <span class="orc-recharts-kpi-label">Último Preço</span>
          <b class="orc-recharts-kpi-val" id="orcRcKpiUltimo">${brl(metricas.ultimo)}</b>
        </div>
        <div class="orc-recharts-kpi">
          <span class="orc-recharts-kpi-label">Menor Histórico</span>
          <b class="orc-recharts-kpi-val" id="orcRcKpiMenor" style="color:var(--ok);">${brl(metricas.menor)}</b>
        </div>
        <div class="orc-recharts-kpi">
          <span class="orc-recharts-kpi-label">Preço Médio</span>
          <b class="orc-recharts-kpi-val" id="orcRcKpiMedia">${brl(metricas.media)}</b>
        </div>
        <div class="orc-recharts-kpi">
          <span class="orc-recharts-kpi-label">Variação no Período</span>
          <b class="orc-recharts-kpi-val" id="orcRcKpiVar" style="color:${metricas.varCor};">${metricas.varTexto}</b>
        </div>
      </div>
      <div id="orcRechartsContainer" class="orc-recharts-box"></div>
      <div class="mu" style="font-size:11.5px; margin-top:8px;">
        ${itemSel.pontos.length === 1
          ? 'Apenas 1 cotação registrada para este item com este fornecedor. Arquive novas cotações para acompanhar a curva de variação.'
          : `Exibindo ${itemSel.pontos.length} cotações recentes de <b>${esc(itemSel.nome)}</b> com <b>${esc(forn)}</b>. Passe o mouse sobre os pontos para ver a variação percentual.`}
      </div>
    `
    : `
      <div class="empty" style="padding:18px 12px;">
        Ainda não há itens com valor registrado para <b>${esc(forn)}</b>. Adicione itens com preço unitário ou arquive cotações para visualizar o gráfico de variação.
      </div>
    `;

  return `
    <div id="orcRechartsCard" class="card orc-recharts-card">
      <div class="orc-recharts-header">
        <div>
          <h2 style="margin-bottom:2px;">📈 Histórico de Preços — ${esc(forn)}</h2>
          <div class="mu" style="font-size:12px;">Variação de preço unitário de itens recorrentes nas últimas cotações</div>
        </div>
        <div class="orc-recharts-controls">
          ${selectItensHtml}
          ${btnFecharHtml}
        </div>
      </div>
      ${corpoHtml}
    </div>
  `;
}

function montarGraficoRechartsOrc() {
  const container = document.getElementById('orcRechartsContainer');
  if (!container) {
    if (window.PriusRecharts && typeof window.PriusRecharts.unmount === 'function') {
      window.PriusRecharts.unmount();
    }
    return;
  }

  const fornAtivo = orcFornecedorAtivoGrafico();
  const dados = orcHistoricoFornecedorDados(fornAtivo);
  const itemSel = orcSelecionarItemHistorico(dados);

  if (!itemSel || !itemSel.pontos.length) {
    if (window.PriusRecharts && typeof window.PriusRecharts.unmount === 'function') {
      window.PriusRecharts.unmount();
    }
    return;
  }

  const metricas = orcMetricasItemHistorico(itemSel.pontos);
  if (metricas) {
    const elUlt = document.getElementById('orcRcKpiUltimo');
    const elMen = document.getElementById('orcRcKpiMenor');
    const elMed = document.getElementById('orcRcKpiMedia');
    const elVar = document.getElementById('orcRcKpiVar');
    if (elUlt) elUlt.textContent = brl(metricas.ultimo);
    if (elMen) elMen.textContent = brl(metricas.menor);
    if (elMed) elMed.textContent = brl(metricas.media);
    if (elVar) {
      elVar.textContent = metricas.varTexto;
      elVar.style.color = metricas.varCor;
    }
  }

  if (!window.PriusRecharts || typeof window.PriusRecharts.renderLineChart !== 'function') {
    container.innerHTML = '<div class="empty" style="padding:70px 12px;">Carregando gráfico de histórico...</div>';
    return;
  }

  const tema = document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
  window.PriusRecharts.renderLineChart(container, {
    data: itemSel.pontos,
    itemNome: itemSel.nome,
    fornecedorNome: dados.fornecedor,
    media: metricas ? metricas.media : 0,
    tema
  });
}

async function orcXlsx() {
  const modo = orcModo();
  const itens = S.orc.itens || [];
  if (!itens.length) return toast('Adicione itens antes de exportar.');

  const tituloRaw = (S.orc.titulo || (modo === 'pedido_fornecedor' && S.orc.fornecedor ? `Pedido - ${S.orc.fornecedor}` : 'Cotação')).trim();
  const slugTitulo = norm(tituloRaw).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'orcamento';
  const dataCotacao = S.orc.data ? br(S.orc.data) : br(hoje);
  const qtdTotal = num(S.orc.qtdTotal);
  const agora = new Date();
  const geradoEm = `${agora.toLocaleDateString('pt-BR')} às ${pad(agora.getHours())}:${pad(agora.getMinutes())}`;

  if (modo === 'pedido_fornecedor') {
    const fornecedorNome = (S.orc.fornecedor || 'Fornecedor não informado').trim();
    const totalPedido = orcTotalReferencia(S.orc);
    if (typeof window.ExcelJS === 'undefined') {
      let csv = '\uFEFFItem;Quantidade;Valor Unitário;Subtotal\n';
      itens.forEach(i => {
        const q = orcItemQtd(i);
        const vu = num(i.valorUnd);
        csv += `"${(i.nome || '').replace(/"/g, '""')}";"${q}";"${brl(vu)}";"${brl(q * vu)}"\n`;
      });
      csv += `"TOTAL DO PEDIDO";"";"";"${brl(totalPedido)}"\n`;
      await salvarArquivo(`pedido-${slugTitulo}-${iso(agora)}.csv`, new TextEncoder().encode(csv), 'text/csv;charset=utf-8;');
      toast('Planilha CSV do pedido exportada com sucesso!');
      return;
    }

    try {
      toast('Gerando planilha do pedido...');
      const wb = new window.ExcelJS.Workbook();
      wb.creator = 'ARGOS OPS';
      wb.created = agora;
      wb.modified = agora;
      const ws = wb.addWorksheet('Pedido Único', {
        views: [{ state: 'frozen', ySplit: 6, showGridLines: false }]
      });

      ws.mergeCells('A1:D1');
      ws.getCell('A1').value = 'ARGOS OPS  •  PEDIDO DE COMPRA (FORNECEDOR ÚNICO)';
      ws.getCell('A1').font = { name: 'Calibri', size: 13, bold: true, color: { argb: 'FFFFFFFF' } };
      ws.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF121316' } };
      ws.getCell('A1').alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
      ws.getRow(1).height = 32;

      ws.mergeCells('A2:D2');
      ws.getCell('A2').value = `Fornecedor: ${fornecedorNome}   |   Referência: ${tituloRaw}   |   Data: ${dataCotacao}   |   Exportado em: ${geradoEm}`;
      ws.getCell('A2').font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFBBF24' } };
      ws.getCell('A2').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1B1E26' } };
      ws.getCell('A2').alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
      ws.getRow(2).height = 22;

      ws.mergeCells('A3:D3');
      ws.getCell('A3').value = `Link: ${S.orc.link || 'Não informado'}   |   Obs: ${S.orc.obs || '—'}`;
      ws.getCell('A3').font = { name: 'Calibri', size: 9.5, color: { argb: 'FF475569' } };
      ws.getRow(3).height = 18;
      ws.getRow(4).height = 8;

      const hdr = ws.getRow(5);
      hdr.values = ['Item do Pedido', 'Quantidade', 'Valor Unitário (R$)', 'Subtotal (R$)'];
      hdr.height = 24;
      hdr.eachCell((cell, col) => {
        cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
        cell.alignment = { vertical: 'middle', horizontal: col === 1 ? 'left' : 'right', indent: col === 1 ? 1 : 0 };
      });

      const firstRow = 6;
      itens.forEach((i, idx) => {
        const rNum = firstRow + idx;
        const q = orcItemQtd(i);
        const vu = num(i.valorUnd);
        const row = ws.getRow(rNum);
        row.values = [i.nome || 'Item', q, vu, { formula: `B${rNum}*C${rNum}`, result: q * vu }];
        row.height = 22;
        row.getCell(2).numFmt = '#,##0.##';
        row.getCell(3).numFmt = '"R$ "#,##0.00';
        row.getCell(4).numFmt = '"R$ "#,##0.00';
        row.getCell(4).font = { name: 'Calibri', size: 10, bold: true };
      });

      const lastRow = firstRow + itens.length - 1;
      const totRow = ws.getRow(lastRow + 1);
      totRow.values = ['TOTAL DO PEDIDO', { formula: `SUM(B${firstRow}:B${lastRow})` }, '', { formula: `SUM(D${firstRow}:D${lastRow})`, result: totalPedido }];
      totRow.height = 26;
      totRow.eachCell((cell, col) => {
        cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF065F46' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFECFDF5' } };
        if (col === 4) cell.numFmt = '"R$ "#,##0.00';
      });

      ws.columns = [{ width: 42 }, { width: 14 }, { width: 20 }, { width: 20 }];
      const buffer = await wb.xlsx.writeBuffer();
      const ok = await salvarArquivo(
        `pedido-${slugTitulo}-${iso(agora)}.xlsx`,
        new Uint8Array(buffer),
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      if (ok) toast('Planilha Excel (.xlsx) do pedido exportada!');
    } catch (err) {
      console.error('Erro ao gerar planilha Excel:', err);
      toast('Erro ao gerar a planilha Excel.');
    }
    return;
  }

  // Ordena cópia do menor para o maior total para facilitar comparação executiva
  const ordenados = [...itens].sort((a, b) => itemTotal(a) - itemTotal(b));
  const totaisPositivos = ordenados.map(itemTotal).filter(v => v > 0);
  const menorValor = totaisPositivos.length ? Math.min(...totaisPositivos) : (ordenados.length ? itemTotal(ordenados[0]) : 0);

  if (typeof window.ExcelJS === 'undefined') {
    let csv = '\uFEFFPosição;Fornecedor;Valor Sem Frete;Frete;Valor Total;Valor Unitário;Status;Link de Compra\n';
    ordenados.forEach((i, idx) => {
      const vTot = itemTotal(i);
      const vUnd = (i.valorUnd !== undefined && i.valorUnd !== '') ? num(i.valorUnd) : (qtdTotal > 0 ? (itemPrecoSemFrete(i) / qtdTotal) : 0);
      csv += `"${idx + 1}º";"${(i.forn || '').replace(/"/g, '""')}";"${brl(itemPrecoSemFrete(i))}";"${brl(itemFrete(i))}";"${brl(vTot)}";"${brl(vUnd)}";"${i.status}";"${(i.link || i.obs || '').replace(/"/g, '""')}"\n`;
    });
    await salvarArquivo(`cotacao-${slugTitulo}-${iso(agora)}.csv`, new TextEncoder().encode(csv), 'text/csv;charset=utf-8;');
    toast('Planilha CSV exportada com sucesso!');
    return;
  }

  try {
    toast('Gerando planilha formatada...');
    const wb = new window.ExcelJS.Workbook();
    wb.creator = 'ARGOS OPS';
    wb.created = agora;
    wb.modified = agora;

    const ws = wb.addWorksheet('Mapa Comparativo', {
      views: [{ state: 'frozen', ySplit: 7, showGridLines: false }],
      pageSetup: {
        paperSize: 9,
        orientation: 'landscape',
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 0,
        margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 }
      }
    });

    const FONT_NAME = 'Calibri';
    const C_MIDNIGHT = 'FF121316';
    const C_SLATE_DARK = 'FF1E293B';
    const C_SLATE_SUB = 'FF1B1E26';
    const C_AMBER = 'FFF59E0B';
    const C_AMBER_LIGHT = 'FFFBBF24';
    const C_BORDER = 'FFCBD5E1';
    const C_ZEBRA = 'FFF8FAFC';
    const C_WHITE = 'FFFFFFFF';
    const C_TEXT = 'FF0F172A';
    const C_MUTED = 'FF475569';
    const C_EMERALD_BG = 'FFECFDF5';
    const C_EMERALD_PILL = 'FFD1FAE5';
    const C_EMERALD_TX = 'FF065F46';
    const C_AMBER_BG = 'FFFFFBEB';
    const C_AMBER_PILL = 'FFFEF3C7';
    const C_AMBER_TX = 'FF92400E';
    const C_BLUE_BG = 'FFEFF6FF';
    const C_BLUE_PILL = 'FFDBEAFE';
    const C_BLUE_TX = 'FF1E40AF';
    const C_ROSE_PILL = 'FFFFE4E6';
    const C_ROSE_TX = 'FF9F1239';

    const borderThin = {
      top: { style: 'thin', color: { argb: C_BORDER } },
      left: { style: 'thin', color: { argb: C_BORDER } },
      bottom: { style: 'thin', color: { argb: C_BORDER } },
      right: { style: 'thin', color: { argb: C_BORDER } }
    };

    const STATUS_COLORS = {
      'Aprovado': { bg: C_EMERALD_PILL, tx: C_EMERALD_TX },
      'Entregue': { bg: C_EMERALD_PILL, tx: C_EMERALD_TX },
      'Conferido': { bg: C_EMERALD_PILL, tx: C_EMERALD_TX },
      'Aguardando aprovação': { bg: C_AMBER_PILL, tx: C_AMBER_TX },
      'Orçamento': { bg: C_AMBER_PILL, tx: C_AMBER_TX },
      'Pedido feito': { bg: C_BLUE_PILL, tx: C_BLUE_TX },
      'A caminho': { bg: C_BLUE_PILL, tx: C_BLUE_TX },
      'Com problema': { bg: C_ROSE_PILL, tx: C_ROSE_TX }
    };

    const firstDataRow = 8;
    const lastDataRow = firstDataRow + ordenados.length - 1;

    // --- LINHA 1: BANNER PRINCIPAL ---
    ws.mergeCells('A1:I1');
    const cBanner = ws.getCell('A1');
    cBanner.value = 'ARGOS OPS  •  MAPA COMPARATIVO DE COTAÇÃO';
    cBanner.font = { name: FONT_NAME, size: 14, bold: true, color: { argb: C_WHITE } };
    cBanner.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C_MIDNIGHT } };
    cBanner.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    ws.getRow(1).height = 34;

    // --- LINHA 2: SUBTÍTULO COM METADADOS ---
    ws.mergeCells('A2:I2');
    const cSub = ws.getCell('A2');
    cSub.value = `Objeto: ${tituloRaw}   |   Data: ${dataCotacao}   |   Qtd. Itens: ${qtdTotal > 0 ? qtdTotal : 'Não informada'}   |   Exportado em: ${geradoEm}`;
    cSub.font = { name: FONT_NAME, size: 10, bold: true, color: { argb: C_AMBER_LIGHT } };
    cSub.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C_SLATE_SUB } };
    cSub.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    for (let col = 1; col <= 9; col++) {
      ws.getCell(2, col).border = { bottom: { style: 'medium', color: { argb: C_AMBER } } };
    }
    ws.getRow(2).height = 23;

    // --- LINHA 3: ESPAÇADOR ---
    ws.getRow(3).height = 10;

    // --- LINHAS 4-5: CARTÕES DE RESUMO EXECUTIVO (KPIs) ---
    const kpiCards = [
      {
        rangeLabel: 'A4:B4', rangeVal: 'A5:B5',
        label: 'FORNECEDORES COTADOS',
        formula: `COUNTA(B${firstDataRow}:B${lastDataRow})`,
        result: ordenados.length,
        numFmt: '#,##0',
        bg: C_ZEBRA, labelColor: C_MUTED, valColor: C_TEXT
      },
      {
        rangeLabel: 'C4:D4', rangeVal: 'C5:D5',
        label: '🏆 MELHOR OFERTA (TOTAL)',
        formula: `MIN(E${firstDataRow}:E${lastDataRow})`,
        result: menorValor,
        numFmt: '"R$ "#,##0.00',
        bg: C_EMERALD_BG, labelColor: C_EMERALD_TX, valColor: C_EMERALD_TX
      },
      {
        rangeLabel: 'E4:F4', rangeVal: 'E5:F5',
        label: 'MÉDIA DAS COTAÇÕES',
        formula: `AVERAGE(E${firstDataRow}:E${lastDataRow})`,
        result: ordenados.reduce((s, x) => s + itemTotal(x), 0) / ordenados.length,
        numFmt: '"R$ "#,##0.00',
        bg: C_AMBER_BG, labelColor: C_AMBER_TX, valColor: C_AMBER_TX
      },
      {
        rangeLabel: 'G4:I4', rangeVal: 'G5:I5',
        label: 'ECONOMIA POTENCIAL (MÁX - MÍN)',
        formula: `MAX(E${firstDataRow}:E${lastDataRow})-MIN(E${firstDataRow}:E${lastDataRow})`,
        result: Math.max(...ordenados.map(itemTotal)) - Math.min(...ordenados.map(itemTotal)),
        numFmt: '"R$ "#,##0.00',
        bg: C_BLUE_BG, labelColor: C_BLUE_TX, valColor: C_BLUE_TX
      }
    ];

    ws.getRow(4).height = 18;
    ws.getRow(5).height = 26;
    kpiCards.forEach(k => {
      ws.mergeCells(k.rangeLabel);
      ws.mergeCells(k.rangeVal);
      const lblCell = ws.getCell(k.rangeLabel.split(':')[0]);
      lblCell.value = k.label;
      lblCell.font = { name: FONT_NAME, size: 8.5, bold: true, color: { argb: k.labelColor } };
      lblCell.alignment = { vertical: 'bottom', horizontal: 'center' };

      const valCell = ws.getCell(k.rangeVal.split(':')[0]);
      valCell.value = { formula: k.formula, result: k.result };
      valCell.numFmt = k.numFmt;
      valCell.font = { name: FONT_NAME, size: 13, bold: true, color: { argb: k.valColor } };
      valCell.alignment = { vertical: 'middle', horizontal: 'center' };

      const [startCol, endCol] = k.rangeLabel.split(':').map(ref => ws.getCell(ref).col);
      for (let c = startCol; c <= endCol; c++) {
        const topC = ws.getCell(4, c);
        const botC = ws.getCell(5, c);
        topC.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: k.bg } };
        botC.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: k.bg } };
        topC.border = {
          top: { style: 'thin', color: { argb: C_BORDER } },
          left: c === startCol ? { style: 'thin', color: { argb: C_BORDER } } : undefined,
          right: c === endCol ? { style: 'thin', color: { argb: C_BORDER } } : undefined
        };
        botC.border = {
          bottom: { style: 'thin', color: { argb: C_BORDER } },
          left: c === startCol ? { style: 'thin', color: { argb: C_BORDER } } : undefined,
          right: c === endCol ? { style: 'thin', color: { argb: C_BORDER } } : undefined
        };
      }
    });

    // --- LINHA 6: ESPAÇADOR ---
    ws.getRow(6).height = 10;

    // --- LINHA 7: CABEÇALHO DA TABELA ---
    const headers = [
      'Posição',
      'Fornecedor',
      'Valor s/ Frete',
      'Frete',
      'Valor Total',
      'Valor Unitário',
      'Dif. vs Melhor',
      'Status',
      'Link / Referência'
    ];
    const headerRow = ws.getRow(7);
    headerRow.height = 28;
    headers.forEach((h, i) => {
      const cell = headerRow.getCell(i + 1);
      cell.value = h;
      cell.font = { name: FONT_NAME, size: 10.5, bold: true, color: { argb: C_WHITE } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C_SLATE_DARK } };
      cell.alignment = {
        vertical: 'middle',
        horizontal: (i === 0 || i === 7) ? 'center' : (i >= 2 && i <= 6 ? 'right' : 'left'),
        wrapText: true
      };
      cell.border = {
        top: { style: 'thin', color: { argb: C_SLATE_DARK } },
        bottom: { style: 'medium', color: { argb: C_AMBER } },
        left: { style: 'thin', color: { argb: 'FF334155' } },
        right: { style: 'thin', color: { argb: 'FF334155' } }
      };
    });

    ws.autoFilter = {
      from: { row: 7, column: 1 },
      to: { row: lastDataRow, column: 9 }
    };

    // Controle de larguras mínimas para evitar truncamento ("###")
    const colWidths = [11, 26, 16, 13, 17, 16, 16, 22, 30];

    // --- LINHAS DE DADOS ---
    ordenados.forEach((item, idx) => {
      const r = firstDataRow + idx;
      const row = ws.getRow(r);
      row.height = 24;

      const vSemFrete = itemPrecoSemFrete(item);
      const vFrete = itemFrete(item);
      const vTot = vSemFrete + vFrete;
      const hasCustomUnd = item.valorUnd !== undefined && item.valorUnd !== '';
      const vUnd = hasCustomUnd ? num(item.valorUnd) : (qtdTotal > 0 ? (vSemFrete / qtdTotal) : null);
      const ehMenor = (vTot === menorValor && menorValor > 0);
      const diffVal = (menorValor > 0 && vTot > menorValor) ? ((vTot - menorValor) / menorValor) : 0;
      const urlCompra = (item.link || item.obs || '').trim();
      const dom = extrairDominio(urlCompra);
      const statusTexto = item.status || 'Aguardando aprovação';

      const baseBg = ehMenor ? C_EMERALD_BG : (idx % 2 === 1 ? C_ZEBRA : C_WHITE);

      // 1. Posição
      const cPos = row.getCell(1);
      cPos.value = ehMenor ? `🏆 ${idx + 1}º` : `${idx + 1}º`;
      cPos.alignment = { vertical: 'middle', horizontal: 'center' };
      cPos.font = { name: FONT_NAME, size: 10.5, bold: ehMenor, color: { argb: ehMenor ? C_EMERALD_TX : C_MUTED } };

      // 2. Fornecedor
      const cForn = row.getCell(2);
      const nomeForn = item.forn || 'Fornecedor não informado';
      cForn.value = nomeForn;
      cForn.alignment = { vertical: 'middle', horizontal: 'left' };
      cForn.font = { name: FONT_NAME, size: 10.5, bold: true, color: { argb: C_TEXT } };
      colWidths[1] = Math.max(colWidths[1], Math.min(42, nomeForn.length + 5));

      // 3. Valor s/ Frete
      const cSemFrete = row.getCell(3);
      cSemFrete.value = vSemFrete;
      cSemFrete.numFmt = '"R$ "#,##0.00';
      cSemFrete.alignment = { vertical: 'middle', horizontal: 'right' };
      cSemFrete.font = { name: FONT_NAME, size: 10.5, color: { argb: C_TEXT } };

      // 4. Frete
      const cFrete = row.getCell(4);
      cFrete.value = vFrete;
      cFrete.numFmt = '"R$ "#,##0.00';
      cFrete.alignment = { vertical: 'middle', horizontal: 'right' };
      cFrete.font = { name: FONT_NAME, size: 10.5, color: { argb: vFrete === 0 ? C_MUTED : C_TEXT } };

      // 5. Valor Total (Fórmula dinâmica)
      const cTot = row.getCell(5);
      cTot.value = { formula: `C${r}+D${r}`, result: vTot };
      cTot.numFmt = '"R$ "#,##0.00';
      cTot.alignment = { vertical: 'middle', horizontal: 'right' };
      cTot.font = { name: FONT_NAME, size: 11, bold: true, color: { argb: ehMenor ? C_EMERALD_TX : C_TEXT } };

      // 6. Valor Unitário
      const cUnd = row.getCell(6);
      if (hasCustomUnd) {
        cUnd.value = vUnd;
        cUnd.numFmt = '"R$ "#,##0.00';
        cUnd.alignment = { vertical: 'middle', horizontal: 'right' };
        cUnd.font = { name: FONT_NAME, size: 10.5, color: { argb: C_TEXT } };
      } else if (qtdTotal > 0) {
        cUnd.value = { formula: `C${r}/${qtdTotal}`, result: vUnd };
        cUnd.numFmt = '"R$ "#,##0.00';
        cUnd.alignment = { vertical: 'middle', horizontal: 'right' };
        cUnd.font = { name: FONT_NAME, size: 10.5, color: { argb: C_TEXT } };
      } else {
        cUnd.value = '—';
        cUnd.alignment = { vertical: 'middle', horizontal: 'right' };
        cUnd.font = { name: FONT_NAME, size: 10.5, color: { argb: C_MUTED } };
      }

      // 7. Diferença percentual vs Melhor Preço (Fórmula dinâmica)
      const cDiff = row.getCell(7);
      cDiff.value = {
        formula: `IF(MIN($E$${firstDataRow}:$E$${lastDataRow})>0,(E${r}-MIN($E$${firstDataRow}:$E$${lastDataRow}))/MIN($E$${firstDataRow}:$E$${lastDataRow}),0)`,
        result: diffVal
      };
      cDiff.numFmt = '+0.0%;-0.0%;"Melhor Preço"';
      cDiff.alignment = { vertical: 'middle', horizontal: 'right' };
      cDiff.font = {
        name: FONT_NAME,
        size: 10,
        bold: ehMenor,
        color: { argb: ehMenor ? C_EMERALD_TX : (diffVal > 0.2 ? C_ROSE_TX : C_AMBER_TX) }
      };

      // 8. Status (Crachá colorido)
      const cStatus = row.getCell(8);
      cStatus.value = statusTexto;
      cStatus.alignment = { vertical: 'middle', horizontal: 'center' };
      const stTheme = STATUS_COLORS[statusTexto] || { bg: baseBg, tx: C_TEXT };
      cStatus.font = { name: FONT_NAME, size: 9.5, bold: true, color: { argb: stTheme.tx } };

      // 9. Link de Compra / Observação
      const cLink = row.getCell(9);
      const isUrl = /^(https?:\/\/|www\.)/i.test(urlCompra) || (dom && dom !== 'link' && urlCompra.includes('.'));
      if (urlCompra && isUrl) {
        const fullUrl = /^https?:\/\//i.test(urlCompra) ? urlCompra : 'https://' + urlCompra;
        const label = dom ? `🔗 ${dom}` : urlCompra;
        cLink.value = { text: label, hyperlink: fullUrl };
        cLink.font = { name: FONT_NAME, size: 10, underline: true, color: { argb: 'FF2563EB' } };
        colWidths[8] = Math.max(colWidths[8], Math.min(48, label.length + 5));
      } else if (urlCompra) {
        cLink.value = urlCompra;
        cLink.font = { name: FONT_NAME, size: 10, color: { argb: C_MUTED } };
        colWidths[8] = Math.max(colWidths[8], Math.min(48, urlCompra.length + 5));
      } else {
        cLink.value = '—';
        cLink.font = { name: FONT_NAME, size: 10, color: { argb: C_MUTED } };
      }
      cLink.alignment = { vertical: 'middle', horizontal: 'left' };

      // Aplicar preenchimento e bordas da linha
      for (let col = 1; col <= 9; col++) {
        const cell = row.getCell(col);
        cell.border = borderThin;
        if (col !== 8) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: baseBg } };
        } else {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: stTheme.bg } };
        }
      }
    });

    // --- LINHAS DE RESUMO DA TABELA (MÉDIA & MENOR PREÇO) ---
    const avgRowIdx = lastDataRow + 1;
    const avgRow = ws.getRow(avgRowIdx);
    avgRow.height = 24;
    ws.mergeCells(`A${avgRowIdx}:B${avgRowIdx}`);
    avgRow.getCell(1).value = 'MÉDIA GERAL DOS FORNECEDORES';
    avgRow.getCell(1).alignment = { vertical: 'middle', horizontal: 'right' };

    const avgSemFrete = ordenados.reduce((s, x) => s + itemPrecoSemFrete(x), 0) / ordenados.length;
    const avgFrete = ordenados.reduce((s, x) => s + itemFrete(x), 0) / ordenados.length;
    const avgTotal = ordenados.reduce((s, x) => s + itemTotal(x), 0) / ordenados.length;

    avgRow.getCell(3).value = { formula: `AVERAGE(C${firstDataRow}:C${lastDataRow})`, result: avgSemFrete };
    avgRow.getCell(4).value = { formula: `AVERAGE(D${firstDataRow}:D${lastDataRow})`, result: avgFrete };
    avgRow.getCell(5).value = { formula: `AVERAGE(E${firstDataRow}:E${lastDataRow})`, result: avgTotal };

    for (let col = 1; col <= 9; col++) {
      const cell = avgRow.getCell(col);
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
      cell.font = { name: FONT_NAME, size: 10, bold: true, color: { argb: C_MUTED } };
      cell.border = {
        top: { style: 'medium', color: { argb: C_BORDER } },
        bottom: { style: 'thin', color: { argb: C_BORDER } },
        left: { style: 'thin', color: { argb: C_BORDER } },
        right: { style: 'thin', color: { argb: C_BORDER } }
      };
      if (col >= 3 && col <= 5) {
        cell.numFmt = '"R$ "#,##0.00';
        cell.alignment = { vertical: 'middle', horizontal: 'right' };
      }
    }

    const minRowIdx = lastDataRow + 2;
    const minRow = ws.getRow(minRowIdx);
    minRow.height = 25;
    ws.mergeCells(`A${minRowIdx}:B${minRowIdx}`);
    minRow.getCell(1).value = '🏆 MENOR VALOR ENCONTRADO';
    minRow.getCell(1).alignment = { vertical: 'middle', horizontal: 'right' };

    minRow.getCell(3).value = { formula: `MIN(C${firstDataRow}:C${lastDataRow})`, result: Math.min(...ordenados.map(itemPrecoSemFrete)) };
    minRow.getCell(4).value = { formula: `MIN(D${firstDataRow}:D${lastDataRow})`, result: Math.min(...ordenados.map(itemFrete)) };
    minRow.getCell(5).value = { formula: `MIN(E${firstDataRow}:E${lastDataRow})`, result: menorValor };

    for (let col = 1; col <= 9; col++) {
      const cell = minRow.getCell(col);
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C_EMERALD_BG } };
      cell.font = { name: FONT_NAME, size: 10.5, bold: true, color: { argb: C_EMERALD_TX } };
      cell.border = {
        top: { style: 'thin', color: { argb: C_BORDER } },
        bottom: { style: 'medium', color: { argb: C_EMERALD_TX } },
        left: { style: 'thin', color: { argb: C_BORDER } },
        right: { style: 'thin', color: { argb: C_BORDER } }
      };
      if (col >= 3 && col <= 5) {
        cell.numFmt = '"R$ "#,##0.00';
        cell.alignment = { vertical: 'middle', horizontal: 'right' };
      }
    }

    // --- OBSERVAÇÕES DA COTAÇÃO (SE HOUVER) ---
    if ((S.orc.obs || '').trim()) {
      const obsRowIdx = minRowIdx + 2;
      ws.mergeCells(`A${obsRowIdx}:I${obsRowIdx}`);
      const cObs = ws.getCell(`A${obsRowIdx}`);
      cObs.value = `Observações: ${S.orc.obs.trim()}`;
      cObs.font = { name: FONT_NAME, size: 10, italic: true, color: { argb: C_MUTED } };
      cObs.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C_ZEBRA } };
      cObs.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true, indent: 1 };
      ws.getRow(obsRowIdx).height = 28;
      for (let col = 1; col <= 9; col++) {
        ws.getCell(obsRowIdx, col).border = borderThin;
      }
    }

    // Aplicar larguras calculadas nas colunas
    colWidths.forEach((w, idx) => {
      ws.getColumn(idx + 1).width = w;
    });

    // --- SEGUNDA ABA: HISTÓRICO COMPARATIVO (QUANDO EXISTIR) ---
    const hist = S.orcHist || [];
    if (hist.length > 0) {
      const wsHist = wb.addWorksheet('Histórico de Cotações', {
        views: [{ state: 'frozen', ySplit: 4, showGridLines: false }],
        pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 }
      });

      wsHist.mergeCells('A1:E1');
      const hTitle = wsHist.getCell('A1');
      hTitle.value = 'ARGOS OPS  •  HISTÓRICO DE COTAÇÕES ARQUIVADAS';
      hTitle.font = { name: FONT_NAME, size: 13, bold: true, color: { argb: C_WHITE } };
      hTitle.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C_MIDNIGHT } };
      hTitle.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
      wsHist.getRow(1).height = 30;
      for (let c = 1; c <= 5; c++) {
        wsHist.getCell(1, c).border = { bottom: { style: 'medium', color: { argb: C_AMBER } } };
      }

      wsHist.getRow(2).height = 10;

      const histHeaders = ['Data', 'Objeto / Título', 'Fornecedores', 'Melhor Valor', 'Observações'];
      const hHeadRow = wsHist.getRow(4);
      hHeadRow.height = 26;
      histHeaders.forEach((txt, i) => {
        const cell = hHeadRow.getCell(i + 1);
        cell.value = txt;
        cell.font = { name: FONT_NAME, size: 10.5, bold: true, color: { argb: C_WHITE } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C_SLATE_DARK } };
        cell.alignment = { vertical: 'middle', horizontal: i === 2 ? 'center' : (i === 3 ? 'right' : 'left') };
        cell.border = { bottom: { style: 'medium', color: { argb: C_AMBER } } };
      });

      hist.forEach((h, idx) => {
        const r = 5 + idx;
        const row = wsHist.getRow(r);
        row.height = 22;
        const vals = (h.itens || []).map(itemTotal);
        const minHist = vals.length ? Math.min(...vals) : 0;
        const bg = idx % 2 === 1 ? C_ZEBRA : C_WHITE;

        row.getCell(1).value = br(h.data || '');
        row.getCell(2).value = h.titulo || 'Sem título';
        row.getCell(3).value = h.qtdItens || (h.itens || []).length;
        row.getCell(4).value = minHist;
        row.getCell(4).numFmt = '"R$ "#,##0.00';
        row.getCell(5).value = h.obs || '—';

        for (let c = 1; c <= 5; c++) {
          const cell = row.getCell(c);
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
          cell.border = borderThin;
          cell.font = {
            name: FONT_NAME,
            size: 10,
            bold: c === 2 || c === 4,
            color: { argb: c === 4 ? C_EMERALD_TX : C_TEXT }
          };
          cell.alignment = { vertical: 'middle', horizontal: c === 3 ? 'center' : (c === 4 ? 'right' : 'left') };
        }
      });

      [14, 34, 15, 18, 36].forEach((w, idx) => {
        wsHist.getColumn(idx + 1).width = w;
      });
    }

    const buffer = await wb.xlsx.writeBuffer();
    const ok = await salvarArquivo(
      `cotacao-${slugTitulo}-${iso(agora)}.xlsx`,
      new Uint8Array(buffer),
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    if (ok) toast('Planilha Excel (.xlsx) exportada com sucesso!');
  } catch (err) {
    console.error('Erro ao gerar planilha Excel:', err);
    toast('Erro ao gerar a planilha Excel.');
  }
}

function orcCopy() {
  const modo = orcModo();
  const itens = S.orc.itens || [];
  if (!itens.length) return toast('Nada para copiar.');

  if (modo === 'pedido_fornecedor') {
    const forn = S.orc.fornecedor || 'Fornecedor';
    let txt = `*PEDIDO DE COMPRA — ${forn}${S.orc.titulo ? ' (' + S.orc.titulo + ')' : ''} — ${br(S.orc.data || hoje)}*\n`;
    if (S.orc.link) txt += `🔗 Link: ${S.orc.link}\n`;
    if (S.orc.obs) txt += `📝 Obs: ${S.orc.obs}\n`;
    txt += '\n';
    itens.forEach((i, idx) => {
      const q = orcItemQtd(i);
      const vu = num(i.valorUnd);
      txt += `${idx + 1}. *${i.nome || 'Item'}* — ${q}x ${brl(vu)} = *${brl(q * vu)}*\n`;
    });
    txt += `\n💰 *Valor Total do Pedido:* ${brl(orcTotalReferencia(S.orc))}`;
    copy(txt);
    return;
  }

  let txt = `*COTAÇÃO - ${S.orc.titulo || 'ARGOS OPS'} (${br(S.orc.data || hoje)})*\n\n`;
  itens.forEach((i, idx) => {
    txt += `${idx + 1}. *${i.forn || 'Fornecedor'}*\n`;
    txt += `   • Sem frete: ${brl(itemPrecoSemFrete(i))} | Frete: ${brl(itemFrete(i))}\n`;
    txt += `   • Total: *${brl(itemTotal(i))}* | Status: ${i.status}\n`;
    if (i.link || i.obs) txt += `   • Link: ${i.link || i.obs}\n`;
    txt += '\n';
  });
  copy(txt);
}

function renderSwitchModoOrcamento(modo = orcModo()) {
  const ehPedido = modo === 'pedido_fornecedor';
  return `
    <div class="orc-mode-switcher" role="tablist" aria-label="Tipo de cotação">
      <button type="button" class="orc-mode-btn ${!ehPedido ? 'active' : ''}" data-act="orc_set_modo" data-modo="comparativo_fornecedores" role="tab" aria-selected="${!ehPedido}">
        <span class="orc-mode-title">🏢 1 Item • Vários Fornecedores</span>
        <span class="orc-mode-sub">Comparar o mesmo item entre fornecedores e destacar o menor preço</span>
      </button>
      <button type="button" class="orc-mode-btn ${ehPedido ? 'active' : ''}" data-act="orc_set_modo" data-modo="pedido_fornecedor" role="tab" aria-selected="${ehPedido}">
        <span class="orc-mode-title">📦 Vários Itens • 1 Fornecedor</span>
        <span class="orc-mode-sub">Montar lista de compras com vários itens, quantidades e soma do pedido</span>
      </button>
    </div>
  `;
}

function viewOrc() {
  const modo = orcModo();
  modoOrcamentoAtual = modo;
  const ehPedido = modo === 'pedido_fornecedor';
  const itens = S.orc.itens || [];
  const menorValor = !ehPedido && itens.length ? Math.min(...itens.map(itemTotal)) : 0;
  const maiorValor = itens.length ? Math.max(...itens.map(i => orcItemSubtotal(i, modo))) : 0;
  const qtdTotal = num(S.orc.qtdTotal);
  const totalPedidoAtual = ehPedido ? orcTotalReferencia(S.orc) : 0;
  const comparacaoAtiva = !!(cotacaoBaseComparacao && cotacaoBaseComparacao.modo === modo);

  const slideControls = `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px; flex-wrap:wrap; gap:8px;">
      <div style="display:flex; gap:6px;">
        <button class="b ${orcSlideAtivo === 0 ? 'p' : ''}" data-act="orc_ir_slide" data-s="0">📋 Tabela de Cotação</button>
        <button class="b ${orcSlideAtivo === 1 ? 'p' : ''}" data-act="orc_ir_slide" data-s="1">📈 Comparativo & Histórico</button>
      </div>
      <div class="slide-nav-group">
        <button class="b arrow-icon-btn nav-prev" data-act="orc_passar_slide" data-dir="-1" ${orcSlideAtivo === 0 ? 'disabled' : ''} title="Tela anterior (Slide 1)" aria-label="Slide anterior">
          ${typeof icoSeta === 'function' ? icoSeta('left', 16) : '◀'}
        </button>
        <span class="slide-nav-count">${orcSlideAtivo + 1} / 2</span>
        <button class="b arrow-icon-btn nav-next" data-act="orc_passar_slide" data-dir="1" ${orcSlideAtivo === 1 ? 'disabled' : ''} title="Próxima tela (Slide 2)" aria-label="Próximo slide">
          ${typeof icoSeta === 'function' ? icoSeta('right', 16) : '▶'}
        </button>
      </div>
    </div>
  `;

  // Seletor reutilizável de Modo de Cotação (exibido em ambas as sub-abas)
  const seletorModoHtml = renderSwitchModoOrcamento(modo);

  const resumoComparacaoHtml = `
    <div id="orcComparacaoResumo" class="orc-cmp-summary" style="display:${comparacaoAtiva ? 'flex' : 'none'};">
      ${comparacaoAtiva ? orcResumoComparacaoInnerHtml(modo) : ''}
    </div>
  `;

  let slide1 = '';

  if (ehPedido) {
    // --- MODO: VÁRIOS ITENS • 1 FORNECEDOR ---
    const linkFornecedor = (S.orc.link || '').trim();
    const domFornecedor = extrairDominio(linkFornecedor);

    const linhasPedido = itens.map(i => {
      const sub = orcItemSubtotal(i, modo);
      const cmpHtml = orcBadgeComparacaoHtml(i, modo, qtdTotal);
      return `
        <tr style="border-bottom:1px solid var(--bd);">
          <td style="padding:10px 8px; min-width:210px;">
            <input class="obs" style="margin:0; width:100%;" data-act="orcf" data-id="${i.id}" data-f="nome" value="${esc(i.nome || '')}" placeholder="Nome do item">
            <div id="ocmp-${i.id}" class="orc-cmp-slot">${cmpHtml}</div>
          </td>
          <td style="padding:10px 8px; width:110px;">
            <input class="obs" style="margin:0; width:90px; text-align:right;" data-act="orcf" data-id="${i.id}" data-f="qtd" value="${esc(i.qtd ?? '1')}" placeholder="1">
          </td>
          <td style="padding:10px 8px; width:130px;">
            <input class="obs" style="margin:0; width:110px; text-align:right;" data-act="orcf" data-id="${i.id}" data-f="valorUnd" value="${esc(i.valorUnd ?? '')}" placeholder="0,00">
          </td>
          <td style="padding:10px 8px; font-weight:700; text-align:right; font-variant-numeric:tabular-nums;" id="os-${i.id}">
            ${brl(sub)}
          </td>
          <td style="padding:10px 8px; text-align:right; width:56px;">
            <button class="b danger" data-act="del_orcitem" data-id="${i.id}" style="font-size:11px; padding:3px 7px;" title="Remover item">✕</button>
          </td>
        </tr>
      `;
    }).join('');

    slide1 = `
      <div style="flex: 0 0 100%; min-width: 100%;">
        <div class="card" style="margin-bottom:14px;">
          <h2>Tipo e Dados do Pedido</h2>
          ${seletorModoHtml}
          <div class="fx" style="gap:10px; margin-top:12px;">
            <input data-orc="fornecedor" placeholder="Nome do Fornecedor / Loja (ex: Kalunga, Amazon, Atacadão)" value="${esc(S.orc.fornecedor || '')}" style="flex:2 1 220px;">
            <input data-orc="titulo" placeholder="Referência / Título do Pedido (ex: Material de Escritório)" value="${esc(S.orc.titulo || '')}" style="flex:2 1 200px;">
            <input data-orc="data" type="date" value="${S.orc.data || hoje}" style="flex:1 1 135px;">
          </div>
          <div class="fx" style="gap:10px; margin-top:10px; align-items:center;">
            <div class="input-link-wrapper" style="flex:3 1 260px;">
              <input id="orc_linkFornecedor" data-orc="link" placeholder="Link de compra do fornecedor / carrinho (URL)" value="${esc(linkFornecedor)}" style="flex:1;">
              <button type="button" class="b" data-act="encurtar_link_pedido" title="Encurta o link e limpa parâmetros de rastreio" style="font-size:11.5px; padding:4px 9px;">✂️ Encurtar</button>
              ${linkFornecedor ? `<a href="${esc(/^https?:\/\//i.test(linkFornecedor) ? linkFornecedor : 'https://' + linkFornecedor)}" target="_blank" rel="noopener noreferrer" class="btn-link-produto" title="${esc(linkFornecedor)}">🔗 ${esc(domFornecedor)}</a>` : ''}
            </div>
            <input data-orc="obs" placeholder="Observação (prazo, frete, forma de pagamento...)" value="${esc(S.orc.obs || '')}" style="flex:2 1 200px;">
          </div>
        </div>

        <div class="card" style="margin-bottom:14px;">
          <h2>Adicionar Item ao Pedido</h2>
          <form data-form="orc_pedido_item" id="formNovoItemPedido">
            <input name="nome" id="ped_nomeItem" placeholder="Nome do item (ex: Resma A4, Marcador Quadro, Pilha AA)" required style="flex:3 1 240px;">
            <input name="qtd" id="ped_qtdItem" placeholder="Qtd." value="1" required style="flex:1 1 85px;">
            <input name="valorUnd" id="ped_valorUnd" placeholder="Valor Unitário (R$)" required style="flex:1 1 130px;">
            <button class="b p" style="white-space:nowrap;">➕ Adicionar item</button>
          </form>
        </div>

        <div class="card">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; flex-wrap:wrap; gap:8px;">
            <h2>Itens do Pedido (${itens.length})</h2>
            <div style="display:flex; gap:6px; flex-wrap:wrap;">
              <button class="b" data-act="orccopy">📋 Copiar Pedido</button>
              <button class="b" data-act="orcxlsx" title="Exportar lista do pedido em planilha Excel (.xlsx)">📥 Exportar Planilha</button>
              <button class="b p" data-act="orcsalvarhist">💾 Arquivar no Histórico</button>
              <button class="b danger" data-act="orcnovo">🧹 Limpar</button>
            </div>
          </div>

          <div style="overflow-x:auto;">
            <table style="width:100%; border-collapse:collapse; font-size:13px; text-align:left;">
              <thead>
                <tr style="border-bottom:2px solid var(--bd); color:var(--mu);">
                  <th style="padding:8px;">Nome do Item</th>
                  <th style="padding:8px; text-align:right;">Quantidade</th>
                  <th style="padding:8px; text-align:right;">Valor Unitário</th>
                  <th style="padding:8px; text-align:right;">Subtotal</th>
                  <th style="padding:8px; text-align:right;">Ações</th>
                </tr>
              </thead>
              <tbody>
                ${linhasPedido || '<tr><td colspan="5" class="empty">Nenhum item adicionado ao pedido ainda. Use o formulário acima para começar.</td></tr>'}
              </tbody>
            </table>
          </div>

          <div class="orc-pedido-total-bar">
            <span class="mu">Valor Total do Pedido (${itens.length} ${itens.length === 1 ? 'item' : 'itens'})</span>
            <b id="orcPedidoTotal" class="orc-pedido-total-val">${brl(totalPedidoAtual)}</b>
          </div>

          ${resumoComparacaoHtml}
        </div>
        ${orcFooterHistoricoFornecedorHtml(S.orc.fornecedor, false)}
      </div>
    `;
  } else {
    // --- MODO: 1 ITEM • VÁRIOS FORNECEDORES (PADRÃO) ---
    const tabelaLinhas = itens.map(i => {
      const vTot = itemTotal(i);
      const vUnd = (i.valorUnd !== undefined && i.valorUnd !== '') ? num(i.valorUnd) : (qtdTotal > 0 ? (itemPrecoSemFrete(i) / qtdTotal) : 0);
      const ehMenor = (vTot === menorValor && menorValor > 0);
      const urlCompra = i.link || i.obs || '';
      const dom = extrairDominio(urlCompra);
      const cmpHtml = orcBadgeComparacaoHtml(i, modo, qtdTotal);

      return `
        <tr style="border-bottom:1px solid var(--bd);">
          <td style="padding:10px 8px; font-weight:600;">
            <div>
              ${esc(i.forn || '—')}
              <span id="ob-${i.id}" class="pill o" style="font-size:10px; margin-left:4px; display:${ehMenor ? 'inline-block' : 'none'};">🏆 Menor Preço</span>
            </div>
            <div id="ocmp-${i.id}" class="orc-cmp-slot">${cmpHtml}</div>
          </td>
          <td style="padding:10px 8px;">
            <input class="obs" style="margin:0; width:100px; text-align:right;" data-act="orcf" data-id="${i.id}" data-f="precoSemFrete" value="${esc(i.precoSemFrete ?? i.preco ?? '')}">
          </td>
          <td style="padding:10px 8px;">
            <input class="obs" style="margin:0; width:80px; text-align:right;" data-act="orcf" data-id="${i.id}" data-f="frete" value="${esc(i.frete ?? '')}">
          </td>
          <td style="padding:10px 8px; font-weight:700; text-align:right;" id="ot-${i.id}">
            ${brl(vTot)}
          </td>
          <td style="padding:10px 8px; text-align:right;" id="ou-${i.id}">
            ${vUnd > 0 ? brl(vUnd) : '—'}
          </td>
          <td style="padding:10px 8px; text-align:center;">
            ${urlCompra 
              ? `<a href="${esc(urlCompra)}" target="_blank" rel="noopener noreferrer" class="btn-link-produto" title="${esc(urlCompra)}">🔗 ${esc(dom)}</a>` 
              : '<span class="mu" style="font-size:12px;">—</span>'}
          </td>
          <td style="padding:10px 8px;">
            <select data-act="orcs" data-id="${i.id}" style="font-size:12px; padding:4px 6px;">
              ${ORC_ST.map(st => `<option value="${st}" ${i.status === st ? 'selected' : ''}>${st}</option>`).join('')}
            </select>
          </td>
          <td style="padding:10px 8px; text-align:right; white-space:nowrap;">
            ${i.forn ? `<button class="b ${norm(orcFornHistorico) === norm(i.forn) ? 'p' : ''}" data-act="orc_ver_hist_forn" data-forn="${esc(i.forn)}" style="font-size:11px; padding:3px 7px; margin-right:4px;" title="Ver histórico de preços deste fornecedor">📈</button>` : ''}
            <button class="b danger" data-act="del_orcitem" data-id="${i.id}" style="font-size:11px; padding:3px 7px;">✕</button>
          </td>
        </tr>
      `;
    }).join('');

    slide1 = `
      <div style="flex: 0 0 100%; min-width: 100%;">
        <div class="card" style="margin-bottom:14px;">
          <h2>Tipo e Dados da Cotação</h2>
          ${seletorModoHtml}
          <div class="fx" style="gap:10px; margin-top:12px;">
            <input data-orc="titulo" placeholder="Título da Cotação (ex: Folhas A4, Pilhas, Canetas)" value="${esc(S.orc.titulo || '')}" style="flex:3 1 220px;">
            <input data-orc="qtdTotal" placeholder="Quantidade Total de Itens" value="${esc(S.orc.qtdTotal || '')}" style="flex:1 1 120px;" title="Usada para calcular o valor por unidade">
            <input data-orc="data" type="date" value="${S.orc.data || hoje}" style="flex:1 1 130px;">
          </div>
        </div>

        <div class="card" style="margin-bottom:14px;">
          <h2>Novo Fornecedor</h2>
          <form data-form="orcitem" id="formNovoFornecedor">
            <input name="forn" placeholder="Nome do Fornecedor / Loja" required style="flex:2 1 160px;">
            <input name="precoSemFrete" id="cad_precoSemFrete" placeholder="Preço (sem frete)" required style="flex:1 1 120px;">
            <input name="frete" placeholder="Frete (R$)" style="flex:1 1 90px;">
            <input name="valorUnd" id="cad_valorUnd" placeholder="Valor Und." style="flex:1 1 90px;" title="Calculado automaticamente se preenchida a quantidade total">
            
            <div class="input-link-wrapper">
              <input name="link" id="cad_linkCompra" placeholder="Link de compra (URL do produto)" style="flex:1;">
              <button type="button" class="b" data-act="encurtar_link_form" title="Encurta o link e limpa parâmetros de rastreio" style="font-size:11.5px; padding:4px 9px;">✂️ Encurtar</button>
            </div>

            <button class="b p" style="white-space:nowrap;">➕ Inserir Fornecedor</button>
          </form>
        </div>

        <div class="card">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; flex-wrap:wrap; gap:8px;">
            <h2>Tabela de Valores (${itens.length})</h2>
            <div style="display:flex; gap:6px; flex-wrap:wrap;">
              <button class="b" data-act="orccopy">📋 Copiar Cotação</button>
              <button class="b" data-act="orcxlsx" title="Gerar planilha Excel (.xlsx) formatada com KPIs, fórmulas e destaque do melhor preço">📥 Exportar Planilha</button>
              <button class="b p" data-act="orcsalvarhist">💾 Arquivar no Histórico</button>
              <button class="b danger" data-act="orcnovo">🧹 Limpar</button>
            </div>
          </div>

          <div style="overflow-x:auto;">
            <table style="width:100%; border-collapse:collapse; font-size:13px; text-align:left;">
              <thead>
                <tr style="border-bottom:2px solid var(--bd); color:var(--mu);">
                  <th style="padding:8px;">Fornecedor</th>
                  <th style="padding:8px; text-align:right;">Sem Frete</th>
                  <th style="padding:8px; text-align:right;">Frete</th>
                  <th style="padding:8px; text-align:right;">Total</th>
                  <th style="padding:8px; text-align:right;">Und.</th>
                  <th style="padding:8px; text-align:center;">Link</th>
                  <th style="padding:8px;">Status</th>
                  <th style="padding:8px; text-align:right;">Ações</th>
                </tr>
              </thead>
              <tbody>
                ${tabelaLinhas || '<tr><td colspan="8" class="empty">Nenhum fornecedor cadastrado nesta cotação.</td></tr>'}
              </tbody>
            </table>
          </div>

          ${resumoComparacaoHtml}
        </div>
        ${orcFornHistorico ? orcFooterHistoricoFornecedorHtml(orcFornHistorico, true) : ''}
      </div>
    `;
  }

  // --- SLIDE 2: Comparativo Gráfico de Barras & Linha do Tempo Histórica ---

  // 1. Gráfico de Barras Comparativo da Cotação/Pedido Atual
  let grafBarrasHtml = '';
  if (itens.length > 0) {
    if (ehPedido) {
      const ordenados = [...itens].sort((a, b) => orcItemSubtotal(b, modo) - orcItemSubtotal(a, modo));
      grafBarrasHtml = ordenados.map(i => {
        const sub = orcItemSubtotal(i, modo);
        const pctLargura = maiorValor > 0 ? Math.max(8, Math.round((sub / maiorValor) * 100)) : 0;
        const pesoPct = totalPedidoAtual > 0 ? Math.round((sub / totalPedidoAtual) * 100) : 0;
        return `
          <div style="margin-bottom:12px;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px; font-size:13px;">
              <div>
                <b>${esc(i.nome || 'Item')}</b>
                <span class="mu" style="font-size:11.5px; margin-left:6px;">(${orcItemQtd(i)}x ${brl(num(i.valorUnd))})</span>
              </div>
              <div style="display:flex; align-items:center; gap:8px;">
                <span class="pill b" style="font-size:10px;">${pesoPct}% do pedido</span>
                <b style="font-variant-numeric: tabular-nums;">${brl(sub)}</b>
              </div>
            </div>
            <div style="width:100%; height:12px; background:var(--bd); border-radius:999px; overflow:hidden;">
              <div style="width:${pctLargura}%; height:100%; background:var(--ac); border-radius:999px; transition:width 0.4s ease;"></div>
            </div>
          </div>
        `;
      }).join('');
    } else {
      const ordenados = [...itens].sort((a, b) => itemTotal(a) - itemTotal(b));
      grafBarrasHtml = ordenados.map(i => {
        const vTot = itemTotal(i);
        const ehMenor = (vTot === menorValor && menorValor > 0);
        const pctLargura = maiorValor > 0 ? Math.max(8, Math.round((vTot / maiorValor) * 100)) : 0;
        const difPct = (menorValor > 0 && vTot > menorValor) 
          ? `+${Math.round(((vTot - menorValor) / menorValor) * 100)}%` 
          : (ehMenor ? '🏆 Melhor Preço' : '');

        return `
          <div style="margin-bottom:12px;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px; font-size:13px;">
              <div>
                <b>${esc(i.forn || 'Fornecedor')}</b>
                ${ehMenor ? '<span class="pill o" style="font-size:10px; margin-left:6px;">🏆 Menor Valor</span>' : ''}
              </div>
              <div style="display:flex; align-items:center; gap:8px;">
                ${difPct && !ehMenor ? `<span class="pill w" style="font-size:10px;">${difPct}</span>` : ''}
                <b style="font-variant-numeric: tabular-nums;">${brl(vTot)}</b>
              </div>
            </div>
            <div style="width:100%; height:12px; background:var(--bd); border-radius:999px; overflow:hidden;">
              <div style="width:${pctLargura}%; height:100%; background:${ehMenor ? 'var(--ok)' : 'var(--ac)'}; border-radius:999px; transition:width 0.4s ease;"></div>
            </div>
          </div>
        `;
      }).join('');
    }
  } else {
    grafBarrasHtml = `<div class="empty">${ehPedido ? 'Adicione itens ao pedido para visualizar a distribuição de custos.' : 'Adicione fornecedores na tabela para visualizar o gráfico comparativo de preços.'}</div>`;
  }

  // 2. Gráfico e Histórico de Variação por Produto / Título
  const produtosDisponiveis = [...new Set((S.orcHist || []).map(h => (h.titulo || '').trim()).filter(Boolean))].sort();
  if (!prodFiltroHist && produtosDisponiveis.length) {
    prodFiltroHist = produtosDisponiveis[0];
  }

  const historicoFiltrado = (S.orcHist || []).filter(h => !prodFiltroHist || norm(h.titulo) === norm(prodFiltroHist));
  historicoFiltrado.sort((a, b) => (a.data || '').localeCompare(b.data || ''));

  let linhaDoTempoHtml = '';
  if (historicoFiltrado.length > 1) {
    let ultimoRef = null;
    linhaDoTempoHtml = historicoFiltrado.map(h => {
      const mHist = orcModo(h);
      const valRef = orcTotalReferencia(h);
      let varStr = '—';
      let pillClass = 'mu';

      if (ultimoRef !== null && ultimoRef > 0 && valRef > 0) {
        const diff = Math.round(((valRef - ultimoRef) / ultimoRef) * 100);
        if (diff > 0) {
          varStr = `${typeof icoSeta === 'function' ? icoSeta('trend-up', 12) : '▲'} +${diff}%`;
          pillClass = 'e';
        } else if (diff < 0) {
          varStr = `${typeof icoSeta === 'function' ? icoSeta('trend-down', 12) : '▼'} ${diff}%`;
          pillClass = 'o';
        } else {
          varStr = '= 0%';
          pillClass = 'b';
        }
      }
      ultimoRef = valRef;

      const subDesc = mHist === 'pedido_fornecedor'
        ? `${(h.itens || []).length} item(ns) • ${esc(h.fornecedor || 'Pedido único')}`
        : `${h.qtdItens || (h.itens || []).length} fornecedores comparados`;

      return `
        <div style="display:flex; align-items:center; justify-content:space-between; padding:8px 10px; border-bottom:1px solid var(--bd);">
          <div>
            <b>${br(h.data)}</b> — <span class="mu">${esc(h.titulo)}</span>
            <div class="mu" style="font-size:11.5px;">${subDesc}</div>
          </div>
          <div style="display:flex; align-items:center; gap:8px;">
            <span class="pill ${pillClass}" style="font-size:11px;">${varStr}</span>
            <b style="font-size:14px; font-variant-numeric: tabular-nums;">${brl(valRef)}</b>
          </div>
        </div>
      `;
    }).join('');
  } else if (historicoFiltrado.length === 1) {
    linhaDoTempoHtml = `<div class="empty">Apenas 1 cotação arquivada para "${esc(prodFiltroHist)}". Arquive novas cotações nos próximos meses para ver a linha do tempo de variação percentual.</div>`;
  } else {
    linhaDoTempoHtml = '<div class="empty">Nenhuma cotação arquivada para comparar variações históricas.</div>';
  }

  // 3. Lista Completa de Arquivos (com destaque e filtro opcional pelo modo ativo, preservando registros antigos)
  const todoHist = S.orcHist || [];
  const qtdNoModoAtivo = todoHist.filter(h => orcModo(h) === modo).length;
  const histExibidos = orcHistFiltrarModo
    ? todoHist.filter(h => orcModo(h) === modo)
    : todoHist;
  const rotuloModoAtivo = ehPedido ? '📦 Vários Itens • 1 Fornecedor' : '🏢 1 Item • Vários Fornecedores';

  const historicoListaCards = histExibidos.map(h => {
    const mHist = orcModo(h);
    const ehPedHist = mHist === 'pedido_fornecedor';
    const combinaModoAtivo = mHist === modo;
    const hItens = h.itens || [];
    const totalRef = orcTotalReferencia(h);
    const tagModo = ehPedHist
      ? `<span class="orc-hist-tag pedido">📦 Pedido único${h.fornecedor ? ' (' + esc(h.fornecedor) + ')' : ''}</span>`
      : `<span class="orc-hist-tag multi">🏢 Multi-fornecedor</span>`;
    const badgeModoAtivo = (!orcHistFiltrarModo && combinaModoAtivo)
      ? `<span class="orc-hist-match-pill" title="Corresponde ao modo selecionado acima">● Modo ativo</span>`
      : '';

    const itensListaHtml = hItens.length
      ? `<ul class="orc-hist-itens">
          ${hItens.map(it => {
            if (ehPedHist) {
              const q = orcItemQtd(it);
              const vu = num(it.valorUnd);
              return `<li><span>${esc(it.nome || 'Item')} <span class="mu">(${q}x ${brl(vu)})</span></span><b>${brl(q * vu)}</b></li>`;
            }
            const tot = itemTotal(it);
            const ehMin = totalRef > 0 && Math.abs(tot - totalRef) < 0.005;
            return `<li><span>${esc(it.forn || it.nome || 'Fornecedor')}${ehMin ? ' <span class="pill o" style="font-size:9.5px; padding:0 5px;">🏆</span>' : ''}</span><b>${brl(tot)}</b></li>`;
          }).join('')}
        </ul>`
      : '';

    return `
      <div class="orc-hist-card ${combinaModoAtivo ? 'modo-ativo' : 'modo-outro'}">
        <div class="orc-hist-head">
          <div class="orc-hist-meta">
            <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
              <b>${esc(h.titulo || (ehPedHist ? (h.fornecedor || 'Pedido Único') : 'Cotação'))} — ${br(h.data)}</b>
              ${tagModo}
              ${badgeModoAtivo}
            </div>
            <span class="mu" style="font-size:12px;">
              ${ehPedHist ? `${hItens.length} item(ns) • Total: ${brl(totalRef)}` : `${hItens.length} fornecedor(es) • Melhor oferta: ${brl(totalRef)}`}
              ${h.obs ? ' • Obs: ' + esc(h.obs) : ''}
            </span>
          </div>
          <div class="orc-hist-actions">
            <button class="b" data-act="orc_carregar_hist" data-id="${h.id}">Carregar na Tela</button>
            <button class="b danger" data-act="del_orchist" data-id="${h.id}">Excluir</button>
          </div>
        </div>
        ${itensListaHtml}
      </div>
    `;
  }).join('') || (
    orcHistFiltrarModo && todoHist.length
      ? `<div class="empty">Nenhuma cotação arquivada no modo <b>${rotuloModoAtivo}</b>. <button class="b" data-act="orc_tog_filtro_hist_modo" style="margin-left:8px; font-size:11.5px; padding:3px 9px;">Mostrar todos (${todoHist.length})</button></div>`
      : '<div class="empty">Nenhuma cotação arquivada no histórico.</div>'
  );

  const slide2 = `
    <div style="flex: 0 0 100%; min-width: 100%;">
      <div class="card" style="margin-bottom:14px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; flex-wrap:wrap; gap:8px;">
          <h2 style="margin:0;">Tipo de Cotação</h2>
          <button class="b" data-act="orc_ir_slide" data-s="0" style="font-size:12px; padding:5px 10px;" title="Abrir o formulário no modo selecionado">📋 Abrir formulário neste modo</button>
        </div>
        ${seletorModoHtml}
      </div>

      <div class="card" style="margin-bottom:14px;">
        <h2>${ehPedido ? '📊 Distribuição de Custos do Pedido' : '📊 Comparativo de Preços dos Fornecedores'}</h2>
        <div class="mu" style="margin-bottom:12px;">${ehPedido ? `Composição do pedido ativo (${esc(S.orc.fornecedor || S.orc.titulo || 'Pedido atual')}):` : `Gráfico de barras da cotação ativa (${esc(S.orc.titulo || 'Item atual')}):`}</div>
        ${grafBarrasHtml}
      </div>

      <div class="card" style="margin-bottom:14px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; flex-wrap:wrap; gap:8px;">
          <h2>📈 Linha do Tempo & Variação Histórica</h2>
          ${produtosDisponiveis.length ? `
            <select id="filtroProdGraf" style="font-size:12.5px; padding:4px 8px;">
              ${produtosDisponiveis.map(p => `<option value="${esc(p)}" ${p === prodFiltroHist ? 'selected' : ''}>${esc(p)}</option>`).join('')}
            </select>
          ` : ''}
        </div>
        <div class="mu" style="margin-bottom:10px;">Acompanhe como o valor de referência variou ao longo do tempo:</div>
        <div style="max-height:220px; overflow-y:auto; border:1px solid var(--bd); border-radius:8px;">
          ${linhaDoTempoHtml}
        </div>
      </div>

      <div class="card">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; flex-wrap:wrap; gap:8px;">
          <h2 style="margin:0;">💾 Cotações Arquivadas (${histExibidos.length}${orcHistFiltrarModo ? ` de ${todoHist.length}` : ''})</h2>
          <div style="display:flex; gap:6px; align-items:center; flex-wrap:wrap;">
            <button type="button" class="b ${!orcHistFiltrarModo ? 'p' : ''}" data-act="orc_set_filtro_hist_modo" data-v="todos" style="font-size:11.5px; padding:4px 10px;">Todos (${todoHist.length})</button>
            <button type="button" class="b ${orcHistFiltrarModo ? 'p' : ''}" data-act="orc_set_filtro_hist_modo" data-v="modo" style="font-size:11.5px; padding:4px 10px;">Somente modo ativo (${qtdNoModoAtivo})</button>
          </div>
        </div>
        <div class="mu" style="margin-bottom:10px;">
          ${orcHistFiltrarModo
            ? `Filtrando arquivos do modo <b>${rotuloModoAtivo}</b>. Clique em "Carregar na Tela" para reabrir e comparar reajustes:`
            : `Exibindo todos os arquivos (com destaque para <b>${rotuloModoAtivo}</b>). Clique em "Carregar na Tela" para reabrir e comparar reajustes:`}
        </div>
        <div style="max-height:360px; overflow-y:auto;">
          ${historicoListaCards}
        </div>
      </div>
    </div>
  `;

  return `
    ${slideControls}
    <div id="orcCarrosselViewport">
      <div id="orcCarrosselTrack" style="transform: translateX(-${orcSlideAtivo * 100}%); transition: transform 0.28s ease;">
        ${slide1}
        ${slide2}
      </div>
    </div>
  `;
}

if (typeof PriusBus !== 'undefined') {
  PriusBus.register('orcamento', ['core']);
}