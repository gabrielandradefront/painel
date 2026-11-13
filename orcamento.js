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

async function orcXlsx() {
  const itens = S.orc.itens || [];
  if (!itens.length) return toast('Adicione itens antes de exportar.');

  const tituloRaw = (S.orc.titulo || 'Cotação').trim();
  const slugTitulo = norm(tituloRaw).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'orcamento';
  const dataCotacao = S.orc.data ? br(S.orc.data) : br(hoje);
  const qtdTotal = num(S.orc.qtdTotal);
  const agora = new Date();
  const geradoEm = `${agora.toLocaleDateString('pt-BR')} às ${pad(agora.getHours())}:${pad(agora.getMinutes())}`;

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
    wb.creator = 'Painel Operacional Prius';
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
    cBanner.value = 'PAINEL OPERACIONAL PRIUS  •  MAPA COMPARATIVO DE COTAÇÃO';
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
      hTitle.value = 'PAINEL PRIUS  •  HISTÓRICO DE COTAÇÕES ARQUIVADAS';
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