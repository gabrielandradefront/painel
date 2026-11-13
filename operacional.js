/* ========================================================
   OPERACIONAL.JS - RECIBOS, REPAROS, RESUMOS E APELIDOS
   Painel Operacional Prius
======================================================== */

// Estado local do conversor de imagens
let arquivosConversor = [];

function adicionarArquivosConversor(files) {
  const validos = Array.from(files).filter(f => /^image\/(png|jpe?g)$/i.test(f.type) || /\.(png|jpe?g)$/i.test(f.name));
  if (!validos.length) return toast('Selecione apenas imagens JPG ou PNG.');
  validos.forEach(file => {
    arquivosConversor.push({
      file,
      name: file.name,
      size: file.size,
      previewUrl: URL.createObjectURL(file)
    });
  });
  render();
  toast(`${validos.length} imagem(ns) adicionada(s)!`);
}

// --- RECIBOS E ENVIOS ---
const docDone = g => { const d = S.docs[g.k] || {}; return d.recibo && d.aprovado && d.enviado; };
const docPend = G => G.reduce((n, g) => { const d = S.docs[g.k] || {}; return n + (!d.recibo) + (!d.aprovado) + (!d.enviado); }, 0);

const docRow = g => {
  const d = S.docs[g.k] || {};
  const profAlert = g.prof === '(sem professor)' ? '<span class="pill w">Defina o professor</span>' : '';
  const aulasStr = g.aulas.map(a => esc(a.turma) + (a.hora ? ' ' + esc(a.hora) : '')).join(' + ');
  
  return `
    <div class="row ${docDone(g) ? 'done' : ''}">
      <div class="t">
        <b>${esc(g.prof)} — ${wd(g.dia)} ${br(g.dia)}</b>
        ${profAlert}
        <span class="mu">${aulasStr}</span>
      </div>
      <label class="pill ${d.recibo ? 'o' : 'w'}">
        <input type="checkbox" data-act="doc" data-k="${esc(g.k)}" data-f="recibo" ${d.recibo ? 'checked' : ''}> Recibo
      </label>
      <label class="pill ${d.aprovado ? 'o' : 'w'}">
        <input type="checkbox" data-act="doc" data-k="${esc(g.k)}" data-f="aprovado" ${d.aprovado ? 'checked' : ''}> Aprovado
      </label>
      <label class="pill ${d.enviado ? 'o' : 'w'}">
        <input type="checkbox" data-act="doc" data-k="${esc(g.k)}" data-f="enviado" ${d.enviado ? 'checked' : ''}> Enviado
      </label>
      <button class="b" data-act="cpdoc" data-k="${esc(g.k)}">Copiar</button>
    </div>
  `;
};

const docTxt = g => `Professor(a): ${g.prof}\nData: ${g.dia.split('-').reverse().join('/')} (${wd(g.dia)})\nAulas:\n` + g.aulas.map(a => `- ${a.turma} | ${a.hora || 'Sem horário'}${a.desc ? ' | ' + a.desc : ''}`).join('\n');

// --- RESUMOS OPERACIONAIS ---
function gerarResumoOperacional(tipo) {
  const am = S.aulas.filter(a => a.dia === amanha);
  const repPend = S.reparos.filter(r => r.status !== 'Concluído');
  const orcAguardando = (S.orc.itens || []).filter(i => i.status === 'Aguardando aprovação');

  if (tipo === 'dia') {
    const pendentesGeral = S.aulas.filter(a => a.dia >= hoje && !a.materialPronto);
    let matsTxt = '  • Nenhum material pendente.';
    if (pendentesGeral.length) {
      const prazosPendentes = [...new Set(pendentesGeral.map(a => prazoEntregaMaterial(a.dia)))].sort();
      const pData = prazosPendentes[0];
      const matsLeva = S.aulas.filter(a => a.dia >= hoje && (pData <= hoje ? prazoEntregaMaterial(a.dia) <= hoje : prazoEntregaMaterial(a.dia) === pData) && !a.materialPronto);
      matsTxt = `  • Prazo: ${wd(pData)} (${br(pData)}) — ${matsLeva.length} turma(s):\n` + matsLeva.map(m => `    - ${m.turma} (${m.prof || 'A definir'})`).join('\n');
    }

    const confHoje = S.aulas.filter(a => a.dia >= hoje && (dataConfirmacaoAula(a.dia) === hoje || (dataConfirmacaoAula(a.dia) < hoje && !a.confirmada)));
    confHoje.sort((a, b) => (a.dia + a.hora).localeCompare(b.dia + b.hora));

    const confTxt = confHoje.length
      ? confHoje.map(a => `  • ${a.prof || 'Sem prof'} — ${a.turma} (${wd(a.dia)} ${br(a.dia)} às ${a.hora || 'S/H'}) [${a.confirmada ? '✅ Confirmada' : '⏳ Pendente'}]`).join('\n')
      : '  • Nenhuma aula para confirmar hoje.';

    const repTxt = repPend.length
      ? repPend.slice(0, 4).map(r => `  • ${r.local ? `[${r.local}] ` : ''}${r.item}`).join('\n') + (repPend.length > 4 ? `\n  • ...e mais ${repPend.length - 4} chamado(s)` : '')
      : '  • Nenhum chamado aberto.';

    const G = groups(mon(0), addD(mon(0), 6));
    const docsPendQtd = docPend(G);

    let msg = `*☀️ BRIEFING OPERACIONAL — ${br(hoje)} (${wd(hoje).toUpperCase()})*\n\n`;
    msg += `📄 *Recibos Pendentes (Semana Atual):* ${docsPendQtd} pendência(s)\n`;
    msg += `📅 *Confirmações de Aula:*\n${confTxt}\n\n`;
    msg += `🛠️ *Manutenções Pendentes (${repPend.length}):*\n${repTxt}\n\n`;
    msg += `📄 *Docs Pendentes (Semana Atual):* ${docsPendQtd} contrato(s)/recibo(s)\n`;
    if (orcAguardando.length) {
      msg += `💰 *Orçamentos Aguardando Aprovação:* ${orcAguardando.length} fornecedor(es)\n`;
    }
    return msg;
  }

  // Resumos Compilados (1, 2, 3 ou 4 semanas / mês)
  const nSem = parseInt(tipo, 10);
  const nDias = nSem * 7;
  const dataFim = addD(hoje, nDias);
  const tituloPeriodo = nSem === 4 ? 'DO MÊS (4 SEMANAS)' : `DE ${nSem} SEMANA${nSem > 1 ? 'S' : ''}`;

  const aulasPeriodo = S.aulas.filter(a => a.dia >= hoje && a.dia <= dataFim);
  aulasPeriodo.sort((a, b) => (a.dia + a.hora).localeCompare(b.dia + b.hora));

  const turmasContagem = {};
  aulasPeriodo.forEach(a => {
    turmasContagem[a.turma] = (turmasContagem[a.turma] || 0) + 1;
  });
  const turmasLista = Object.entries(turmasContagem).map(([t, q]) => `  • ${t}: ${q} aula(s)`).join('\n') || '  • Nenhuma aula agendada no período.';

  const matsPrevistos = aulasPeriodo.filter(a => {
    const p = prazoEntregaMaterial(a.dia);
    return p >= hoje && p <= dataFim;
  });
  const matsPendentesQtd = matsPrevistos.filter(a => !a.materialPronto).length;

  const G_periodo = groups(hoje, dataFim);
  const docsPendQtd = docPend(G_periodo);

  let msg = `*📊 RESUMO OPERACIONAL COMPILADO ${tituloPeriodo}*\n`;
  msg += `🗓️ *Período:* ${br(hoje)} a ${br(dataFim)} (${nDias} dias)\n\n`;
  msg += `📚 *Quadro de Aulas (${aulasPeriodo.length} aulas agendadas):*\n${turmasLista}\n\n`;
  msg += `📦 *Envios de Materiais (Slides):* ${matsPrevistos.length} previsto(s) (${matsPendentesQtd} pendente(s))\n`;
  msg += `📄 *Recibos e Aprovações:* ${G_periodo.length} grupo(s) de docentes (${docsPendQtd} pendência(s))\n`;
  msg += `🛠️ *Manutenções:* ${repPend.length} chamado(s) em aberto\n`;

  if (S.orc.titulo) {
    msg += `💰 *Cotação Atual:* ${S.orc.titulo} (${S.orc.itens.length} fornecedores)\n`;
  }
  return msg;
}

// --- GESTÃO DE PROFESSORES (APELIDOS) ---
function profCanon(p) {
  const n = norm(p); if (!n) return p;
  for (const e of (S.apelidos || [])) if (norm(e.nome) === n || (e.alts || []).some(x => norm(x) === n)) return e.nome;
  return p;
}

function unirDocs(canon, alts) {
  const ns = new Set(alts.map(norm)), nc = norm(canon);
  Object.keys(S.docs).forEach(k => {
    const i = k.lastIndexOf('|'), nm = k.slice(0, i), dia = k.slice(i + 1);
    if (!ns.has(nm) || nm === nc) return;
    const novo = nc + '|' + dia, a = S.docs[k] || {}, b = S.docs[novo] || {};
    S.docs[novo] = { recibo: !!(a.recibo || b.recibo), aprovado: !!(a.aprovado || b.aprovado), enviado: !!(a.enviado || b.enviado) };
    delete S.docs[k];
  });
}

function addApelido(nome, alts) {
  nome = (nome || '').trim(); alts = alts.map(x => x.trim()).filter(x => x && norm(x) !== norm(nome));
  if (!nome || !alts.length) return false;
  S.apelidos = S.apelidos || [];
  let e = S.apelidos.find(x => norm(x.nome) === norm(nome));
  if (!e) { const o = S.apelidos.find(x => (x.alts || []).some(a => norm(a) === norm(nome))); if (o) e = o; }
  if (!e) { e = { id: uid(), nome, alts: [] }; S.apelidos.push(e); }
  const entra = a => { if (norm(a) !== norm(e.nome) && !e.alts.some(y => norm(y) === norm(a))) e.alts.push(a); };
  alts.forEach(entra);
  S.apelidos = S.apelidos.filter(x => {
    if (x === e) return true;
    if (alts.some(a => norm(a) === norm(x.nome))) { entra(x.nome); (x.alts || []).forEach(entra); return false; }
    return true;
  });
  unirDocs(e.nome, e.alts);
  return true;
}

const nomesProf = () => [...new Set(S.aulas.map(a => (a.prof || '').trim()).filter(Boolean))];

function sugApelidos() {
  const nomes = nomesProf(), out = [];
  nomes.forEach(c => {
    const t1 = norm(c).split(/\s+/);
    if (t1.length !== 1 || profCanon(c) !== c) return;
    const cands = [...new Set(nomes.filter(o => { const t = norm(o).split(/\s+/); return t.length > 1 && t[0] === t1[0]; }).map(profCanon))];
    if (cands.length === 1) out.push({ alt: c, nome: cands[0] });
  });
  return out;
}

function cardApelidos() {
  const sug = sugApelidos(), ap = S.apelidos || [], nomes = nomesProf().sort((a, b) => a.localeCompare(b, 'pt-BR'));
  let h = `<div class="mu" style="margin-bottom:8px">Una os nomes diferentes de um mesmo professor (ex.: “Hugo” e “Hugo Lemos”) para que entrem num só contrato e num só recibo por dia.</div>`;
  if (sug.length) h += `<h3>Sugestões</h3>` + sug.map(s => `<div class="row"><div class="t"><b>${esc(s.alt)} → ${esc(s.nome)}</b></div><button class="b p" data-act="ap_unir" data-alt="${esc(s.alt)}" data-nome="${esc(s.nome)}">Unir</button></div>`).join('') + (sug.length > 1 ? `<div class="fx" style="margin-top:8px"><button class="b" data-act="ap_todas">Unir todas as sugestões</button></div>` : '');
  h += `<h3>Unir manualmente</h3><datalist id="profsL">${nomes.map(n => `<option value="${esc(n)}">`).join('')}</datalist><form data-form="apelido"><input name="nome" list="profsL" placeholder="Nome que vale (oficial)" required style="flex:2 1 200px"><input name="alts" placeholder="Outros nomes, separados por vírgula" required style="flex:2 1 200px"><button class="b p">Unir</button></form>`;
  if (ap.length) h += `<h3>Nomes unidos</h3>` + ap.map(e => `<div class="row"><div class="t"><b>${esc(e.nome)}</b><span class="mu">também aparece como: ${e.alts.map(esc).join(', ')}</span></div><button class="b" data-act="del_apelido" data-id="${e.id}">Desfazer</button></div>`).join('');
  return card('👥 Gestão de Professores (Apelidos)', h);
}

// --- RENDERIZADOR DA ABA OPERAÇÕES ---

async function baixarPlanilhaResumo(tipo) {
  const agora = new Date();
  const ehDia = tipo === 'dia';
  const nSem = ehDia ? 0 : (parseInt(tipo, 10) || 1);
  const nDias = ehDia ? 0 : nSem * 7;
  const dataFim = ehDia ? hoje : addD(hoje, nDias);
  const rotuloPeriodo = ehDia
    ? 'RESUMO DO DIA'
    : (nSem === 4 ? 'DO MÊS (4 SEMANAS)' : `DE ${nSem} SEMANA${nSem > 1 ? 'S' : ''}`);
  const rotuloDias = ehDia ? 'Hoje' : `${nDias} dias`;
  const slugPeriodo = ehDia ? 'dia' : `${nSem}-semanas`;
  const geradoEm = `${agora.toLocaleDateString('pt-BR')} às ${pad(agora.getHours())}:${pad(agora.getMinutes())}`;

  const aulasPeriodo = S.aulas.filter(a => a.dia >= hoje && a.dia <= dataFim);
  aulasPeriodo.sort((a, b) => (a.dia + (a.hora || '')).localeCompare(b.dia + (b.hora || '')));

  const repPend = S.reparos.filter(r => r.status !== 'Concluído');
  const orcAguardando = (S.orc.itens || []).filter(i => i.status === 'Aguardando aprovação');
  const G_periodo = groups(hoje, dataFim);

  if (typeof window.ExcelJS === 'undefined') {
    let csv = `\uFEFFDETALHAMENTO DE AULAS - ${rotuloPeriodo}\n\n`;
    csv += 'Data;Dia da Semana;Horário;Turma;Professor;Disciplina;Confirmação de Aula;Material (Slides)\n';
    aulasPeriodo.forEach(a => {
      csv += `"${br(a.dia)}";"${wd(a.dia)}";"${a.hora || ''}";"${(a.turma || '').replace(/"/g, '""')}";"${(a.prof || '').replace(/"/g, '""')}";"${(a.desc || '').replace(/"/g, '""')}";"${a.confirmada ? 'Confirmada' : 'Pendente'}";"${a.materialPronto ? 'Pronto' : 'Pendente'}"\n`;
    });
    if (repPend.length > 0) {
      csv += '\n\nMANUTENÇÕES E REPAROS PENDENTES\n\nData Registro;Item;Local;Status;Observações\n';
      repPend.forEach(r => {
        csv += `"${br(r.dataReg || hoje)}";"${(r.item || '').replace(/"/g, '""')}";"${(r.local || '').replace(/"/g, '""')}";"${(r.status || '').replace(/"/g, '""')}";"${(r.obs || '').replace(/"/g, '""')}"\n`;
      });
    }
    if (orcAguardando.length > 0) {
      csv += '\n\nORÇAMENTOS - AGUARDANDO APROVAÇÃO\n\nFornecedor;Sem Frete;Frete;Total;Und.;Status\n';
      orcAguardando.forEach(i => {
        const und = i.valorUnd !== undefined && i.valorUnd !== '' ? brl(num(i.valorUnd)) : (num(S.orc.qtdTotal) > 0 ? brl(itemPrecoSemFrete(i) / num(S.orc.qtdTotal)) : '');
        csv += `"${(i.forn || i.nome || '').replace(/"/g, '""')}";"${brl(itemPrecoSemFrete(i))}";"${brl(itemFrete(i))}";"${brl(itemTotal(i))}";"${und}";"${(i.status || '').replace(/"/g, '""')}"\n`;
      });
    }
    await salvarArquivo(`planejamento-${slugPeriodo}-${iso(agora)}.csv`, new TextEncoder().encode(csv), 'text/csv;charset=utf-8;');
    toast('Planilha CSV exportada com sucesso!');
    return;
  }

  try {
    toast('Gerando planilha operacional...');
    const wb = new window.ExcelJS.Workbook();
    wb.creator = 'Painel Operacional Prius';
    wb.created = agora;
    wb.modified = agora;

    const FONT_NAME = 'Calibri';
    const C_MIDNIGHT = 'FF121316';
    const C_SLATE_SUB = 'FF1B1E26';
    const C_SLATE_DARK = 'FF1E293B';
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

    const borderThin = {
      top: { style: 'thin', color: { argb: C_BORDER } },
      left: { style: 'thin', color: { argb: C_BORDER } },
      bottom: { style: 'thin', color: { argb: C_BORDER } },
      right: { style: 'thin', color: { argb: C_BORDER } }
    };

    const aplicarBanner = (ws, maxCol, titulo, subtitulo) => {
      const endColLetter = ws.getColumn(maxCol).letter;
      ws.mergeCells(`A1:${endColLetter}1`);
      const c1 = ws.getCell('A1');
      c1.value = titulo;
      c1.font = { name: FONT_NAME, size: 13.5, bold: true, color: { argb: C_WHITE } };
      c1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C_MIDNIGHT } };
      c1.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
      ws.getRow(1).height = 32;

      ws.mergeCells(`A2:${endColLetter}2`);
      const c2 = ws.getCell('A2');
      c2.value = subtitulo;
      c2.font = { name: FONT_NAME, size: 10, bold: true, color: { argb: C_AMBER_LIGHT } };
      c2.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C_SLATE_SUB } };
      c2.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
      ws.getRow(2).height = 22;
      for (let col = 1; col <= maxCol; col++) {
        ws.getCell(2, col).border = { bottom: { style: 'medium', color: { argb: C_AMBER } } };
      }
      ws.getRow(3).height = 10;
    };

    const estilizarHeader = (ws, rowIdx, headers, centerCols = [], rightCols = []) => {
      const row = ws.getRow(rowIdx);
      row.height = 27;
      headers.forEach((h, i) => {
        const colIdx = i + 1;
        const cell = row.getCell(colIdx);
        cell.value = h;
        cell.font = { name: FONT_NAME, size: 10.5, bold: true, color: { argb: C_WHITE } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C_SLATE_DARK } };
        cell.alignment = {
          vertical: 'middle',
          horizontal: centerCols.includes(colIdx) ? 'center' : (rightCols.includes(colIdx) ? 'right' : 'left'),
          wrapText: true
        };
        cell.border = {
          top: { style: 'thin', color: { argb: C_SLATE_DARK } },
          bottom: { style: 'medium', color: { argb: C_AMBER } },
          left: { style: 'thin', color: { argb: 'FF334155' } },
          right: { style: 'thin', color: { argb: 'FF334155' } }
        };
      });
    };

    // ========================================================
    // ABA 1: PLANEJAMENTO DE AULAS
    // ========================================================
    const wsAulas = wb.addWorksheet('Planejamento de Aulas', {
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

    aplicarBanner(
      wsAulas,
      9,
      `PAINEL OPERACIONAL PRIUS  •  PLANEJAMENTO DE AULAS (${rotuloPeriodo})`,
      `Período: ${br(hoje)} a ${br(dataFim)} (${rotuloDias})   |   Manutenções Abertas: ${repPend.length}   |   Exportado em: ${geradoEm}`
    );

    const firstAulaRow = 8;
    const lastAulaRow = aulasPeriodo.length > 0 ? firstAulaRow + aulasPeriodo.length - 1 : firstAulaRow;
    const qtdConf = aulasPeriodo.filter(a => a.confirmada).length;
    const qtdMatOk = aulasPeriodo.filter(a => a.materialPronto).length;
    const qtdPendGeral = aulasPeriodo.filter(a => !a.confirmada).length + aulasPeriodo.filter(a => !a.materialPronto).length;

    const kpiAulas = [
      {
        rangeLabel: 'A4:B4', rangeVal: 'A5:B5',
        label: 'AULAS NO PERÍODO',
        formula: aulasPeriodo.length ? `COUNTA(D${firstAulaRow}:D${lastAulaRow})` : '0',
        result: aulasPeriodo.length,
        bg: C_ZEBRA, labelColor: C_MUTED, valColor: C_TEXT
      },
      {
        rangeLabel: 'C4:D4', rangeVal: 'C5:D5',
        label: '✅ AULAS CONFIRMADAS',
        formula: aulasPeriodo.length ? `COUNTIF(G${firstAulaRow}:G${lastAulaRow},"Confirmada")` : '0',
        result: qtdConf,
        bg: C_EMERALD_BG, labelColor: C_EMERALD_TX, valColor: C_EMERALD_TX
      },
      {
        rangeLabel: 'E4:F4', rangeVal: 'E5:F5',
        label: '📦 MATERIAIS PRONTOS',
        formula: aulasPeriodo.length ? `COUNTIF(H${firstAulaRow}:H${lastAulaRow},"Pronto")` : '0',
        result: qtdMatOk,
        bg: C_BLUE_BG, labelColor: C_BLUE_TX, valColor: C_BLUE_TX
      },
      {
        rangeLabel: 'G4:I4', rangeVal: 'G5:I5',
        label: '⏳ PENDÊNCIAS (AULAS + SLIDES)',
        formula: aulasPeriodo.length ? `COUNTIF(G${firstAulaRow}:G${lastAulaRow},"Pendente")+COUNTIF(H${firstAulaRow}:H${lastAulaRow},"Pendente")` : '0',
        result: qtdPendGeral,
        bg: C_AMBER_BG, labelColor: C_AMBER_TX, valColor: C_AMBER_TX
      }
    ];

    wsAulas.getRow(4).height = 18;
    wsAulas.getRow(5).height = 26;
    kpiAulas.forEach(k => {
      wsAulas.mergeCells(k.rangeLabel);
      wsAulas.mergeCells(k.rangeVal);
      const lblCell = wsAulas.getCell(k.rangeLabel.split(':')[0]);
      lblCell.value = k.label;
      lblCell.font = { name: FONT_NAME, size: 8.5, bold: true, color: { argb: k.labelColor } };
      lblCell.alignment = { vertical: 'bottom', horizontal: 'center' };

      const valCell = wsAulas.getCell(k.rangeVal.split(':')[0]);
      valCell.value = { formula: k.formula, result: k.result };
      valCell.numFmt = '#,##0';
      valCell.font = { name: FONT_NAME, size: 13, bold: true, color: { argb: k.valColor } };
      valCell.alignment = { vertical: 'middle', horizontal: 'center' };

      const [startCol, endCol] = k.rangeLabel.split(':').map(ref => wsAulas.getCell(ref).col);
      for (let c = startCol; c <= endCol; c++) {
        const topC = wsAulas.getCell(4, c);
        const botC = wsAulas.getCell(5, c);
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

    wsAulas.getRow(6).height = 10;

    estilizarHeader(
      wsAulas,
      7,
      ['Data', 'Dia', 'Horário', 'Turma', 'Professor', 'Disciplina / Descrição', 'Confirmação', 'Material (Slides)', 'Prazo Slides'],
      [1, 2, 3, 7, 8, 9],
      []
    );

    const widthsAulas = [13, 10, 11, 24, 24, 30, 16, 18, 14];

    if (aulasPeriodo.length > 0) {
      wsAulas.autoFilter = { from: { row: 7, column: 1 }, to: { row: lastAulaRow, column: 9 } };
      aulasPeriodo.forEach((a, idx) => {
        const r = firstAulaRow + idx;
        const row = wsAulas.getRow(r);
        row.height = 23;
        const bg = idx % 2 === 1 ? C_ZEBRA : C_WHITE;

        const confTxt = a.confirmada ? 'Confirmada' : 'Pendente';
        const matTxt = a.materialPronto ? 'Pronto' : 'Pendente';
        const prazoTxt = br(prazoEntregaMaterial(a.dia)) || '—';
        const profNome = typeof profCanon === 'function' ? profCanon(a.prof || '') : (a.prof || '');

        row.getCell(1).value = br(a.dia);
        row.getCell(2).value = wd(a.dia).toUpperCase();
        row.getCell(3).value = a.hora || '—';
        row.getCell(4).value = a.turma || '—';
        row.getCell(5).value = profNome || 'A definir';
        row.getCell(6).value = a.desc || '—';
        row.getCell(7).value = confTxt;
        row.getCell(8).value = matTxt;
        row.getCell(9).value = prazoTxt;

        widthsAulas[3] = Math.max(widthsAulas[3], Math.min(40, (a.turma || '').length + 4));
        widthsAulas[4] = Math.max(widthsAulas[4], Math.min(36, (profNome || '').length + 4));
        widthsAulas[5] = Math.max(widthsAulas[5], Math.min(44, (a.desc || '').length + 4));

        for (let c = 1; c <= 9; c++) {
          const cell = row.getCell(c);
          cell.border = borderThin;
          cell.alignment = {
            vertical: 'middle',
            horizontal: [1, 2, 3, 7, 8, 9].includes(c) ? 'center' : 'left',
            wrapText: c === 6
          };

          if (c === 7) {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: a.confirmada ? C_EMERALD_PILL : C_AMBER_PILL } };
            cell.font = { name: FONT_NAME, size: 9.5, bold: true, color: { argb: a.confirmada ? C_EMERALD_TX : C_AMBER_TX } };
          } else if (c === 8) {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: a.materialPronto ? C_EMERALD_PILL : C_AMBER_PILL } };
            cell.font = { name: FONT_NAME, size: 9.5, bold: true, color: { argb: a.materialPronto ? C_EMERALD_TX : C_AMBER_TX } };
          } else {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
            cell.font = {
              name: FONT_NAME,
              size: 10.5,
              bold: c === 4 || c === 5,
              color: { argb: (c === 2 || c === 6 || c === 9) ? C_MUTED : C_TEXT }
            };
          }
        }
      });
    } else {
      wsAulas.mergeCells(`A${firstAulaRow}:I${firstAulaRow}`);
      const emptyCell = wsAulas.getCell(`A${firstAulaRow}`);
      emptyCell.value = 'Nenhuma aula agendada para este período.';
      emptyCell.font = { name: FONT_NAME, size: 11, italic: true, color: { argb: C_MUTED } };
      emptyCell.alignment = { vertical: 'middle', horizontal: 'center' };
      wsAulas.getRow(firstAulaRow).height = 28;
      for (let c = 1; c <= 9; c++) {
        wsAulas.getCell(firstAulaRow, c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C_ZEBRA } };
        wsAulas.getCell(firstAulaRow, c).border = borderThin;
      }
    }

    widthsAulas.forEach((w, i) => { wsAulas.getColumn(i + 1).width = w; });

    // ========================================================
    // ABA 2: RECIBOS E APROVAÇÕES DOCENTES (SE HOUVER GRUPOS)
    // ========================================================
    if (G_periodo.length > 0) {
      const wsDocs = wb.addWorksheet('Recibos Docentes', {
        views: [{ state: 'frozen', ySplit: 4, showGridLines: false }],
        pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 }
      });

      const pendCount = typeof docPend === 'function' ? docPend(G_periodo) : 0;
      aplicarBanner(
        wsDocs,
        7,
        'PAINEL OPERACIONAL PRIUS  •  CONTROLE DE RECIBOS E CONTRATOS',
        `Período: ${br(hoje)} a ${br(dataFim)}   |   Grupos Professor/Dia: ${G_periodo.length}   |   Pendentes: ${pendCount}`
      );

      estilizarHeader(
        wsDocs,
        4,
        ['Data', 'Dia', 'Professor', 'Aulas / Turmas', 'Recibo', 'Aprovado', 'Enviado'],
        [1, 2, 5, 6, 7],
        []
      );

      const firstDocRow = 5;
      const lastDocRow = firstDocRow + G_periodo.length - 1;
      wsDocs.autoFilter = { from: { row: 4, column: 1 }, to: { row: lastDocRow, column: 7 } };

      const wDocs = [13, 10, 26, 38, 15, 15, 15];
      G_periodo.forEach((g, idx) => {
        const r = firstDocRow + idx;
        const row = wsDocs.getRow(r);
        row.height = 23;
        const bg = idx % 2 === 1 ? C_ZEBRA : C_WHITE;
        const d = S.docs[g.k] || {};
        const turmasStr = g.aulas.map(a => `${a.turma}${a.hora ? ' (' + a.hora + ')' : ''}`).join(' + ');

        row.getCell(1).value = br(g.dia);
        row.getCell(2).value = wd(g.dia).toUpperCase();
        row.getCell(3).value = g.prof;
        row.getCell(4).value = turmasStr;
        row.getCell(5).value = d.recibo ? 'Sim' : 'Pendente';
        row.getCell(6).value = d.aprovado ? 'Sim' : 'Pendente';
        row.getCell(7).value = d.enviado ? 'Sim' : 'Pendente';

        wDocs[2] = Math.max(wDocs[2], Math.min(38, (g.prof || '').length + 4));
        wDocs[3] = Math.max(wDocs[3], Math.min(54, turmasStr.length + 4));

        const flags = { 5: !!d.recibo, 6: !!d.aprovado, 7: !!d.enviado };
        for (let c = 1; c <= 7; c++) {
          const cell = row.getCell(c);
          cell.border = borderThin;
          cell.alignment = {
            vertical: 'middle',
            horizontal: [1, 2, 5, 6, 7].includes(c) ? 'center' : 'left',
            wrapText: c === 4
          };
          if (c >= 5) {
            const ok = flags[c];
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ok ? C_EMERALD_PILL : C_AMBER_PILL } };
            cell.font = { name: FONT_NAME, size: 9.5, bold: true, color: { argb: ok ? C_EMERALD_TX : C_AMBER_TX } };
          } else {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
            cell.font = { name: FONT_NAME, size: 10.5, bold: c === 3, color: { argb: c === 2 ? C_MUTED : C_TEXT } };
          }
        }
      });

      const totDocRow = wsDocs.getRow(lastDocRow + 1);
      totDocRow.height = 24;
      wsDocs.mergeCells(`A${lastDocRow + 1}:D${lastDocRow + 1}`);
      totDocRow.getCell(1).value = 'CONCLUÍDOS NESTA ETAPA';
      totDocRow.getCell(1).alignment = { vertical: 'middle', horizontal: 'right' };
      totDocRow.getCell(5).value = { formula: `COUNTIF(E${firstDocRow}:E${lastDocRow},"Sim")`, result: G_periodo.filter(g => (S.docs[g.k] || {}).recibo).length };
      totDocRow.getCell(6).value = { formula: `COUNTIF(F${firstDocRow}:F${lastDocRow},"Sim")`, result: G_periodo.filter(g => (S.docs[g.k] || {}).aprovado).length };
      totDocRow.getCell(7).value = { formula: `COUNTIF(G${firstDocRow}:G${lastDocRow},"Sim")`, result: G_periodo.filter(g => (S.docs[g.k] || {}).enviado).length };
      for (let c = 1; c <= 7; c++) {
        const cell = totDocRow.getCell(c);
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
        cell.font = { name: FONT_NAME, size: 10, bold: true, color: { argb: c >= 5 ? C_EMERALD_TX : C_MUTED } };
        cell.border = { top: { style: 'medium', color: { argb: C_BORDER } }, bottom: { style: 'thin', color: { argb: C_BORDER } }, left: { style: 'thin', color: { argb: C_BORDER } }, right: { style: 'thin', color: { argb: C_BORDER } } };
        if (c >= 5) {
          cell.alignment = { vertical: 'middle', horizontal: 'center' };
          cell.numFmt = '#,##0';
        }
      }

      wDocs.forEach((w, i) => { wsDocs.getColumn(i + 1).width = w; });
    }

    // ========================================================
    // ABA 3: MANUTENÇÕES E REPAROS PENDENTES (SE HOUVER)
    // ========================================================
    if (repPend.length > 0) {
      const wsRep = wb.addWorksheet('Manutenções Pendentes', {
        views: [{ state: 'frozen', ySplit: 4, showGridLines: false }],
        pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 }
      });

      aplicarBanner(
        wsRep,
        5,
        'PAINEL OPERACIONAL PRIUS  •  MANUTENÇÕES E REPAROS EM ABERTO',
        `Chamados em aberto: ${repPend.length}   |   Exportado em: ${geradoEm}`
      );

      estilizarHeader(
        wsRep,
        4,
        ['Data Registro', 'Local', 'Item / Problema', 'Status', 'Observações'],
        [1, 2, 4],
        []
      );

      const firstRepRow = 5;
      const lastRepRow = firstRepRow + repPend.length - 1;
      wsRep.autoFilter = { from: { row: 4, column: 1 }, to: { row: lastRepRow, column: 5 } };

      const wRep = [15, 18, 34, 18, 38];
      repPend.forEach((r, idx) => {
        const rowNum = firstRepRow + idx;
        const row = wsRep.getRow(rowNum);
        row.height = 24;
        const bg = idx % 2 === 1 ? C_ZEBRA : C_WHITE;
        const emAndamento = r.status === 'Em andamento';

        row.getCell(1).value = br(r.dataReg || hoje);
        row.getCell(2).value = r.local || 'Geral';
        row.getCell(3).value = r.item || '—';
        row.getCell(4).value = r.status || 'Pendente';
        row.getCell(5).value = r.obs || '—';

        wRep[2] = Math.max(wRep[2], Math.min(48, (r.item || '').length + 4));
        wRep[4] = Math.max(wRep[4], Math.min(52, (r.obs || '').length + 4));

        for (let c = 1; c <= 5; c++) {
          const cell = row.getCell(c);
          cell.border = borderThin;
          cell.alignment = {
            vertical: 'middle',
            horizontal: [1, 2, 4].includes(c) ? 'center' : 'left',
            wrapText: c === 5
          };
          if (c === 4) {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: emAndamento ? C_BLUE_PILL : C_AMBER_PILL } };
            cell.font = { name: FONT_NAME, size: 9.5, bold: true, color: { argb: emAndamento ? C_BLUE_TX : C_AMBER_TX } };
          } else if (c === 2) {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
            cell.font = { name: FONT_NAME, size: 10, bold: true, color: { argb: C_AMBER_TX } };
          } else {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
            cell.font = { name: FONT_NAME, size: 10.5, bold: c === 3, color: { argb: c === 5 ? C_MUTED : C_TEXT } };
          }
        }
      });

      wRep.forEach((w, i) => { wsRep.getColumn(i + 1).width = w; });
    }

    // ========================================================
    // ABA 4: ORÇAMENTOS AGUARDANDO APROVAÇÃO (SE HOUVER)
    // ========================================================
    if (orcAguardando.length > 0) {
      const wsOrc = wb.addWorksheet('Orçamentos Aguardando', {
        views: [{ state: 'frozen', ySplit: 4, showGridLines: false }],
        pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 }
      });

      aplicarBanner(
        wsOrc,
        7,
        'PAINEL OPERACIONAL PRIUS  •  ORÇAMENTOS AGUARDANDO APROVAÇÃO',
        `Cotação: ${S.orc.titulo || 'Cotação Atual'}   |   Fornecedores aguardando: ${orcAguardando.length}   |   Exportado em: ${geradoEm}`
      );

      estilizarHeader(
        wsOrc,
        4,
        ['Fornecedor', 'Valor s/ Frete', 'Frete', 'Valor Total', 'Valor Unitário', 'Status', 'Link / Referência'],
        [6],
        [2, 3, 4, 5]
      );

      const qtdOrc = num(S.orc.qtdTotal);
      const orcOrdenados = [...orcAguardando].sort((a, b) => itemTotal(a) - itemTotal(b));
      const firstOrcRow = 5;
      const lastOrcRow = firstOrcRow + orcOrdenados.length - 1;
      wsOrc.autoFilter = { from: { row: 4, column: 1 }, to: { row: lastOrcRow, column: 7 } };

      const wOrc = [28, 16, 14, 17, 16, 22, 32];
      orcOrdenados.forEach((i, idx) => {
        const r = firstOrcRow + idx;
        const row = wsOrc.getRow(r);
        row.height = 24;
        const bg = idx === 0 ? C_EMERALD_BG : (idx % 2 === 1 ? C_ZEBRA : C_WHITE);
        const vSem = itemPrecoSemFrete(i);
        const vFr = itemFrete(i);
        const vTot = vSem + vFr;
        const hasUnd = i.valorUnd !== undefined && i.valorUnd !== '';
        const vUnd = hasUnd ? num(i.valorUnd) : (qtdOrc > 0 ? vSem / qtdOrc : null);
        const urlCompra = (i.link || i.obs || '').trim();
        const dom = typeof extrairDominio === 'function' ? extrairDominio(urlCompra) : '';

        row.getCell(1).value = i.forn || i.nome || 'Fornecedor';
        row.getCell(2).value = vSem;
        row.getCell(3).value = vFr;
        row.getCell(4).value = { formula: `B${r}+C${r}`, result: vTot };
        if (hasUnd) {
          row.getCell(5).value = vUnd;
        } else if (qtdOrc > 0) {
          row.getCell(5).value = { formula: `B${r}/${qtdOrc}`, result: vUnd };
        } else {
          row.getCell(5).value = '—';
        }
        row.getCell(6).value = i.status || 'Aguardando aprovação';

        const isUrl = /^(https?:\/\/|www\.)/i.test(urlCompra) || (dom && dom !== 'link' && urlCompra.includes('.'));
        if (urlCompra && isUrl) {
          const fullUrl = /^https?:\/\//i.test(urlCompra) ? urlCompra : 'https://' + urlCompra;
          row.getCell(7).value = { text: dom ? `🔗 ${dom}` : urlCompra, hyperlink: fullUrl };
        } else {
          row.getCell(7).value = urlCompra || '—';
        }

        wOrc[0] = Math.max(wOrc[0], Math.min(42, (i.forn || i.nome || '').length + 4));

        for (let c = 1; c <= 7; c++) {
          const cell = row.getCell(c);
          cell.border = borderThin;
          cell.alignment = {
            vertical: 'middle',
            horizontal: c === 6 ? 'center' : (c >= 2 && c <= 5 ? 'right' : 'left')
          };
          if (c === 6) {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C_AMBER_PILL } };
            cell.font = { name: FONT_NAME, size: 9.5, bold: true, color: { argb: C_AMBER_TX } };
          } else if (c === 7 && urlCompra && isUrl) {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
            cell.font = { name: FONT_NAME, size: 10, underline: true, color: { argb: 'FF2563EB' } };
          } else {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
            cell.font = {
              name: FONT_NAME,
              size: 10.5,
              bold: c === 1 || c === 4,
              color: { argb: (idx === 0 && c === 4) ? C_EMERALD_TX : C_TEXT }
            };
            if (c >= 2 && c <= 5 && typeof cell.value !== 'string') {
              cell.numFmt = '"R$ "#,##0.00';
            }
          }
        }
      });

      wOrc.forEach((w, i) => { wsOrc.getColumn(i + 1).width = w; });
    }

    const buffer = await wb.xlsx.writeBuffer();
    const ok = await salvarArquivo(
      `planejamento-${slugPeriodo}-${iso(agora)}.xlsx`,
      new Uint8Array(buffer),
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    if (ok) toast('Planilha Excel (.xlsx) exportada com sucesso!');
  } catch (err) {
    console.error('Erro ao gerar planilha operacional:', err);
    toast('Erro ao gerar a planilha Excel.');
  }
}

function viewOperacional() {
  const subNav = `
    <div class="fx" style="gap:6px; margin-bottom:12px;">
      <button class="b ${subTabSemana === 'docs' ? 'p' : ''}" data-act="sub_semana" data-v="docs">📄 Recibos e Envios</button>        
      <button class="b ${subTabSemana === 'reparos' ? 'p' : ''}" data-act="sub_semana" data-v="reparos">🛠️ Manutenções e Reparos</button>
      <button class="b ${subTabSemana === 'resumos' ? 'p' : ''}" data-act="sub_semana" data-v="resumos">📊 Resumos Operacionais</button>
      <button class="b ${subTabSemana === 'conversor' ? 'p' : ''}" data-act="sub_semana" data-v="conversor">🖼️ Converter Imagens</button>
    </div>
  `;

  if (subTabSemana === 'reparos') {
    const reparosFiltrados = S.reparos.filter(r => (repFiltro === 'abertos' ? r.status !== 'Concluído' : (repFiltro === 'concluidos' ? r.status === 'Concluído' : true)));
    
    const reparoRowFull = r => `
      <div class="row ${r.status === 'Concluído' ? 'done' : ''}">
        <div class="t">
          <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
            ${r.local ? `<span class="pill b"><b>${esc(r.local)}</b></span>` : ''}
            <b>${esc(r.item)}</b>
            <span class="${r.status === 'Concluído' ? 'pill o' : 'pill w'}">${esc(r.status)}</span>
          </div>
          <input class="obs" data-act="rep_obs" data-id="${r.id}" placeholder="Observações" value="${esc(r.obs || '')}">
        </div>
        <select data-act="rep_st" data-id="${r.id}">
          <option value="Pendente" ${r.status === 'Pendente' ? 'selected' : ''}>Pendente</option>
          <option value="Em andamento" ${r.status === 'Em andamento' ? 'selected' : ''}>Em andamento</option>
          <option value="Concluído" ${r.status === 'Concluído' ? 'selected' : ''}>Concluído</option>
        </select>
        <button class="b" data-act="del_reparo" data-id="${r.id}">Excluir</button>
      </div>
    `;

    let repFormHtml = `
      <form data-form="reparo">
        <select name="local" required style="flex:1 1 150px">
          <option value="">Selecione o local...</option>
          ${LOCAIS_MANUTENCAO.map(loc => `<option value="${esc(loc)}">${esc(loc)}</option>`).join('')}
        </select>
        <input name="item" placeholder="Problema (ex: Lâmpada queimada, tomada sem energia)" required style="flex:2 1 220px">
        <button class="b p">Adicionar Chamado</button>
        <button type="button" class="b" data-act="rel">📋 Copiar Relatório</button>
      </form>
      <div class="fx" style="margin-top:8px;">
        <button class="b ${repFiltro === 'abertos' ? 'p' : ''}" data-act="repf" data-v="abertos">Abertos</button>
        <button class="b ${repFiltro === 'concluidos' ? 'p' : ''}" data-act="repf" data-v="concluidos">Concluídos</button>
        <button class="b ${repFiltro === 'todos' ? 'p' : ''}" data-act="repf" data-v="todos">Todos</button>
      </div>
      <div id="listaReparos">${reparosFiltrados.map(reparoRowFull).join('') || '<div class="empty">Nenhum registro de manutenção.</div>'}</div>
    `;
    return subNav + card('Relatório de Manutenções e Reparos', repFormHtml);
  }

  if (subTabSemana === 'resumos') {
    const textoPadrao = typeof gerarResumoOperacional === 'function' ? gerarResumoOperacional(resumoTipoAtual || 'dia') : '';
    const textoAtual = (typeof resumoTextoCustomizado === 'string') ? resumoTextoCustomizado : textoPadrao;

    let cardResumos = `
      <div class="card">
        <h2>📊 Central de Resumos e Relatórios</h2>
        <div class="mu" style="margin-bottom:14px;">Gere relatórios compilados prontos para envio no WhatsApp da equipe e coordenação:</div>
        <div class="fx" style="gap:8px; margin-bottom:14px;">
          <button class="b ${resumoTipoAtual === 'dia' ? 'p' : ''}" data-act="copiar_resumo" data-tipo="dia" title="Carregar e copiar briefing de hoje">☀️ Resumo de Hoje</button>
          <button class="b ${resumoTipoAtual === '1' ? 'p' : ''}" data-act="copiar_resumo" data-tipo="1" title="Carregar e copiar compilado de 1 semana (7 dias)">1 Semana (7 dias)</button>
          <button class="b ${resumoTipoAtual === '2' ? 'p' : ''}" data-act="copiar_resumo" data-tipo="2" title="Carregar e copiar compilado de 2 semanas (14 dias)">2 Semanas (14 dias)</button>
          <button class="b ${resumoTipoAtual === '3' ? 'p' : ''}" data-act="copiar_resumo" data-tipo="3" title="Carregar e copiar compilado de 3 semanas (21 dias)">3 Semanas (21 dias)</button>
          <button class="b ${resumoTipoAtual === '4' ? 'p' : ''}" data-act="copiar_resumo" data-tipo="4" style="${resumoTipoAtual !== '4' ? 'border-color:var(--ac); color:var(--ac); font-weight:600;' : ''}" title="Carregar e copiar compilado do mês (28 dias)">🗓️ Mês (4 Semanas)</button>
        </div>
        <div class="mu" style="font-size:12px; margin-bottom:8px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:6px;">
          <span>✏️ <b>Área editável</b> (clique no texto abaixo para alterar livremente ou nos botões acima para alternar períodos):</span>
          <div style="display:flex; gap:6px; flex-wrap:wrap;">
            <button class="b" data-act="baixar_planilha_resumo" style="font-size:11.5px; padding:3px 9px;" title="Gerar planilha Excel (.xlsx) formatada do período selecionado">📥 Exportar Planilha (.xlsx)</button>
            <button class="b" data-act="copiar_resumo_editado" style="font-size:11.5px; padding:3px 9px;" title="Copiar exatamente o que foi editado abaixo">📋 Copiar texto editado</button>
            <button class="b" data-act="restaurar_resumo_original" style="font-size:11.5px; padding:3px 9px;" title="Recarregar o modelo padrão">🔄 Restaurar original</button>
          </div>
        </div>
        <div id="campoResumoEditavel" 
             contenteditable="true" 
             spellcheck="false" 
             role="textbox" 
             aria-multiline="true" 
             data-placeholder="Digite ou edite o resumo operacional aqui..." 
             style="background:var(--bg); border:1.5px solid var(--bd); border-radius:8px; padding:12px; font-family:monospace; font-size:12.5px; white-space:pre-wrap; line-height:1.5; color:var(--tx); min-height:220px; max-height:420px; overflow-y:auto; cursor:text; outline:none; transition:border-color 0.15s ease, box-shadow 0.15s ease;">${esc(textoAtual)}</div>
      </div>
    `;
    return subNav + cardResumos;
  }

  if (subTabSemana === 'conversor') {
    const qtd = arquivosConversor.length;
    let galeriaHtml = '';

    if (qtd > 0) {
      galeriaHtml = `
        <div style="margin-top:16px;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; flex-wrap:wrap; gap:8px;">
            <b>Ficheiros preparados para o PDF (${qtd}):</b>
            <div style="display:flex; gap:8px;">
              <button class="b" data-act="limpar_imagens_conv" style="font-size:12px; padding:5px 12px;">🧹 Limpar lista</button>
              <button class="b p" data-act="exec_converter_img">📥 Descarregar PDF (${qtd} pág${qtd > 1 ? 's' : ''})</button>
            </div>
          </div>
          <div class="conversor-grid-galeria">
            ${arquivosConversor.map((item, idx) => `
              <div class="conversor-thumb-item">
                <div class="thumb-preview" style="background-image: url('${item.previewUrl}');"></div>
                <div class="thumb-info">
                  <span class="thumb-name" title="${esc(item.name)}">${esc(item.name)}</span>
                  <span class="mu" style="font-size:10.5px;">${(item.size / 1024).toFixed(1)} KB • Pág. ${idx + 1}</span>
                </div>
                <button class="thumb-del" data-act="remover_img_conv" data-i="${idx}" title="Remover imagem">✕</button>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    }

    let cardConversor = `
      <div class="card">
        <h2>🖼️ Conversor de Imagens para PDF</h2>
        <div class="mu" style="margin-bottom:14px;">Arraste ou escolha uma ou várias imagens para compilar um único documento PDF com pré-visualização instantânea:</div>

        <div id="dropzoneImagens" class="dropzone-box" data-act="trigger_input_img">
          <input type="file" id="inputImagensPdf" accept="image/png, image/jpeg, image/jpg" multiple style="display:none;">
          <div class="dropzone-icon">📁</div>
          <div style="font-size:14px; font-weight:600; color:var(--tx); margin-bottom:4px;">
            Arraste e solte as suas imagens aqui, ou <span style="color:var(--ac); text-decoration:underline;">clique para procurar</span>
          </div>
          <div class="mu" style="font-size:12px;">Suporta PNG, JPG e JPEG • Múltiplos ficheiros</div>
        </div>

        ${galeriaHtml}
      </div>
    `;
    return subNav + cardConversor;
  }

  const a = mon(wk), b = addD(a, 6), G = groups(a, b); 
  let body = '', last = '';
  G.forEach(g => { 
    if (g.dia !== last) { body += `<div class="hd">${wd(g.dia)} ${br(g.dia)}</div>`; last = g.dia; } 
    body += docRow(g); 
  });

  let wkHtml = `
    <div class="row" style="border:0;justify-content:space-between;">
      <button class="b" data-act="wk" data-d="-1">&larr; Semana anterior</button>
      <b>${br(a)} a ${br(b)}${wk === 0 ? ' (semana atual)' : ''}</b>
      <button class="b" data-act="wk" data-d="1">Próxima semana &rarr;</button>
    </div>
  `;

  return subNav + 
         card('', wkHtml) + 
         card('Recibos Docentes (1 por professor/dia)', body || '<div class="empty">Sem aulas agendadas para esta semana.</div>', G.filter(g => !docDone(g)).length);
}
