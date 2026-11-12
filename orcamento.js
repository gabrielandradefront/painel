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

function orcTotals() {
  const itens = S.orc.itens || [];
  const qtdTotal = num(S.orc.qtdTotal);

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
  });

  const menorValor = itens.length ? Math.min(...itens.map(itemTotal)) : 0;
  itens.forEach(i => {
    const badgeMenor = document.getElementById(`ob-${i.id}`);
    if (badgeMenor) {
      badgeMenor.style.display = (itemTotal(i) === menorValor && menorValor > 0) ? 'inline-block' : 'none';
    }
  });
}

function orcXlsx() {
  const itens = S.orc.itens || [];
  if (!itens.length) return toast('Adicione itens antes de exportar.');
  let csv = 'Fornecedor;Valor Sem Frete;Frete;Valor Total;Valor Unitario;Link de Compra;Status\n';
  itens.forEach(i => {
    const vTot = itemTotal(i);
    const vUnd = (i.valorUnd !== undefined && i.valorUnd !== '') ? num(i.valorUnd) : (num(S.orc.qtdTotal) > 0 ? (itemPrecoSemFrete(i) / num(S.orc.qtdTotal)) : 0);
    csv += `"${(i.forn || '').replace(/"/g, '""')}";"${brl(itemPrecoSemFrete(i))}";"${brl(itemFrete(i))}";"${brl(vTot)}";"${brl(vUnd)}";"${(i.link || i.obs || '').replace(/"/g, '""')}";"${i.status}"\n`;
  });
  salvarArquivo(`orcamento-${iso(new Date())}.csv`, new TextEncoder().encode(csv), 'text/csv;charset=utf-8;');
  toast('Planilha exportada com sucesso!');
}

function orcCopy() {
  const itens = S.orc.itens || [];
  if (!itens.length) return toast('Nada para copiar.');
  let txt = `*COTAÇÃO - ${S.orc.titulo || 'Prius'} (${br(S.orc.data || hoje)})*\n\n`;
  itens.forEach((i, idx) => {
    txt += `${idx + 1}. *${i.forn || 'Fornecedor'}*\n`;
    txt += `   • Sem frete: ${brl(itemPrecoSemFrete(i))} | Frete: ${brl(itemFrete(i))}\n`;
    txt += `   • Total: *${brl(itemTotal(i))}* | Status: ${i.status}\n`;
    if (i.link || i.obs) txt += `   • Link: ${i.link || i.obs}\n`;
    txt += '\n';
  });
  copy(txt);
}

function viewOrc() {
  const itens = S.orc.itens || [];
  const menorValor = itens.length ? Math.min(...itens.map(itemTotal)) : 0;
  const maiorValor = itens.length ? Math.max(...itens.map(itemTotal)) : 0;
  const qtdTotal = num(S.orc.qtdTotal);

  const slideControls = `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px; flex-wrap:wrap; gap:8px;">
      <div style="display:flex; gap:6px;">
        <button class="b ${orcSlideAtivo === 0 ? 'p' : ''}" data-act="orc_ir_slide" data-s="0">📋 Tabela de Cotação</button>
        <button class="b ${orcSlideAtivo === 1 ? 'p' : ''}" data-act="orc_ir_slide" data-s="1">📈 Comparativo & Histórico</button>
      </div>
      <div style="display:flex; align-items:center; gap:6px;">
        <button class="b" data-act="orc_passar_slide" data-dir="-1" ${orcSlideAtivo === 0 ? 'disabled style="opacity:0.35;cursor:not-allowed;"' : ''} title="Ecrã anterior (Slide 1)">◀</button>
        <span class="mu" style="font-size:12px; font-weight:600; padding:0 4px;">${orcSlideAtivo + 1} / 2</span>
        <button class="b" data-act="orc_passar_slide" data-dir="1" ${orcSlideAtivo === 1 ? 'disabled style="opacity:0.35;cursor:not-allowed;"' : ''} title="Próximo ecrã (Slide 2)">▶</button>
      </div>
    </div>
  `;

  // --- SLIDE 1: Formulários e Tabela ---
  const tabelaLinhas = itens.map(i => {
    const vTot = itemTotal(i);
    const vUnd = (i.valorUnd !== undefined && i.valorUnd !== '') ? num(i.valorUnd) : (qtdTotal > 0 ? (itemPrecoSemFrete(i) / qtdTotal) : 0);
    const ehMenor = (vTot === menorValor && menorValor > 0);
    const urlCompra = i.link || i.obs || '';
    const dom = extrairDominio(urlCompra);

    return `
      <tr style="border-bottom:1px solid var(--bd);">
        <td style="padding:10px 8px; font-weight:600;">
          ${esc(i.forn || '—')}
          <span id="ob-${i.id}" class="pill o" style="font-size:10px; margin-left:4px; display:${ehMenor ? 'inline-block' : 'none'};">🏆 Menor Preço</span>
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
        <td style="padding:10px 8px; text-align:right;">
          <button class="b danger" data-act="del_orcitem" data-id="${i.id}" style="font-size:11px; padding:3px 7px;">✕</button>
        </td>
      </tr>
    `;
  }).join('');

  const slide1 = `
    <div style="flex: 0 0 100%; min-width: 100%;">
      <div class="card" style="margin-bottom:14px;">
        <h2>Dados da Cotação</h2>
        <div class="fx" style="gap:10px;">
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
          <div style="display:flex; gap:6px;">
            <button class="b" data-act="orccopy">📋 Copiar Cotação</button>
            <button class="b" data-act="orcxlsx">📥 Exportar Planilha</button>
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
      </div>
    </div>
  `;

  // --- SLIDE 2: Comparativo Gráfico de Barras & Linha do Tempo Histórica ---
  
  // 1. Gráfico de Barras Comparativo da Cotação Atual
  let grafBarrasHtml = '';
  if (itens.length > 0) {
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
  } else {
    grafBarrasHtml = '<div class="empty">Adicione fornecedores na tabela para visualizar o gráfico comparativo de preços.</div>';
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
    let ultimoMenor = null;
    linhaDoTempoHtml = historicoFiltrado.map((h, idx) => {
      const valores = (h.itens || []).map(itemTotal);
      const menor = valores.length ? Math.min(...valores) : 0;
      let varStr = '—';
      let pillClass = 'mu';

      if (ultimoMenor !== null && ultimoMenor > 0 && menor > 0) {
        const diff = Math.round(((menor - ultimoMenor) / ultimoMenor) * 100);
        if (diff > 0) {
          varStr = `▲ +${diff}%`;
          pillClass = 'e';
        } else if (diff < 0) {
          varStr = `▼ ${diff}%`;
          pillClass = 'o';
        } else {
          varStr = '= 0%';
          pillClass = 'b';
        }
      }
      ultimoMenor = menor;

      return `
        <div style="display:flex; align-items:center; justify-content:space-between; padding:8px 10px; border-bottom:1px solid var(--bd);">
          <div>
            <b>${br(h.data)}</b> — <span class="mu">${esc(h.titulo)}</span>
            <div class="mu" style="font-size:11.5px;">${h.qtdItens || (h.itens || []).length} fornecedores comparados</div>
          </div>
          <div style="display:flex; align-items:center; gap:8px;">
            <span class="pill ${pillClass}" style="font-size:11px;">${varStr}</span>
            <b style="font-size:14px; font-variant-numeric: tabular-nums;">${brl(menor)}</b>
          </div>
        </div>
      `;
    }).join('');
  } else if (historicoFiltrado.length === 1) {
    linhaDoTempoHtml = `<div class="empty">Apenas 1 cotação arquivada para "${esc(prodFiltroHist)}". Arquive novas cotações nos próximos meses para ver a linha do tempo de variação percentual.</div>`;
  } else {
    linhaDoTempoHtml = '<div class="empty">Nenhuma cotação arquivada para comparar variações históricas.</div>';
  }

  // 3. Lista Completa de Arquivos
  const historicoListaCards = (S.orcHist || []).map(h => `
    <div class="row">
      <div class="t">
        <b>${esc(h.titulo)} — ${br(h.data)}</b>
        <span class="mu">${h.qtdItens || (h.itens || []).length} fornecedores arquivados ${h.obs ? '• Obs: ' + esc(h.obs) : ''}</span>
      </div>
      <button class="b" data-act="orc_carregar_hist" data-id="${h.id}">Carregar na Tela</button>
      <button class="b danger" data-act="del_orchist" data-id="${h.id}">Excluir</button>
    </div>
  `).join('') || '<div class="empty">Nenhuma cotação arquivada no histórico.</div>';

  const slide2 = `
    <div style="flex: 0 0 100%; min-width: 100%;">
      <div class="card" style="margin-bottom:14px;">
        <h2>📊 Comparativo de Preços dos Fornecedores</h2>
        <div class="mu" style="margin-bottom:12px;">Gráfico de barras da cotação ativa (${esc(S.orc.titulo || 'Item atual')}):</div>
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
        <div class="mu" style="margin-bottom:10px;">Acompanhe como o menor preço deste produto variou ao longo do tempo:</div>
        <div style="max-height:220px; overflow-y:auto; border:1px solid var(--bd); border-radius:8px;">
          ${linhaDoTempoHtml}
        </div>
      </div>

      <div class="card">
        <h2>💾 Cotações Arquivadas</h2>
        <div class="mu" style="margin-bottom:10px;">Clique em "Carregar" para puxar qualquer cotação antiga de volta para a tabela:</div>
        <div style="max-height:260px; overflow-y:auto;">
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