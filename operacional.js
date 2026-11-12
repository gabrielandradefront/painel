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

function baixarPlanilhaResumo(tipo) {
  const nSem = parseInt(tipo, 10);
  const nDias = nSem * 7;
  const dataFim = addD(hoje, nDias);
  const aulasPeriodo = S.aulas.filter(a => a.dia >= hoje && a.dia <= dataFim);
  aulasPeriodo.sort((a, b) => (a.dia + a.hora).localeCompare(b.dia + b.hora));

  let csv = 'DETALHAMENTO DE AULAS - ' + (nSem === 4 ? '4 SEMANAS (MES)' : '3 SEMANAS') + '\n\n';
  csv += 'Data;Dia da Semana;Horario;Turma;Professor;Disciplina;Confirmacao de Aula;Material (Slides)\n';

  aulasPeriodo.forEach(a => {
    const data = br(a.dia);
    const sem = wd(a.dia);
    const hr = a.hora || '';
    const tm = (a.turma || '').replace(/"/g, '""');
    const pr = (a.prof || '').replace(/"/g, '""');
    const dc = (a.desc || '').replace(/"/g, '""');
    const cf = a.confirmada ? 'Confirmada' : 'Pendente';
    const mat = a.materialPronto ? 'Pronto' : 'Pendente';
    csv += `"${data}";"${sem}";"${hr}";"${tm}";"${pr}";"${dc}";"${cf}";"${mat}"\n`;
  });

  const repPend = S.reparos.filter(r => r.status !== 'Concluído');
  if (repPend.length > 0) {
    csv += '\n\nMANUTENCOES E REPAROS PENDENTES\n\n';
    csv += 'Data Registro;Item;Local;Responsavel;Status;Observacoes\n';
    repPend.forEach(r => {
      const dt = br(r.dataReg || hoje);
      const it = (r.item || '').replace(/"/g, '""');
      const lc = (r.local || '').replace(/"/g, '""');
      const rp = (r.resp || '').replace(/"/g, '""');
      const st = (r.status || '').replace(/"/g, '""');
      const ob = (r.obs || '').replace(/"/g, '""');
      csv += `"${dt}";"${it}";"${lc}";"${rp}";"${st}";"${ob}"\n`;
    });
  }
  
  const orcAguardando = (S.orc.itens || []).filter(i => i.status === 'Aguardando aprovação');
  if (orcAguardando.length > 0) {
    csv += '\n\nORCAMENTOS - AGUARDANDO APROVACAO\n\n';
    csv += 'Fornecedor;Sem Frete;Frete;Total;Und.;Status\n';
    orcAguardando.forEach(i => {
      const forn = (i.forn || i.nome || '').replace(/"/g, '""');
      const sf = brl(itemPrecoSemFrete(i));
      const fr = brl(itemFrete(i));
      const tot = brl(itemTotal(i));
      const und = i.valorUnd !== undefined && i.valorUnd !== '' ? brl(num(i.valorUnd)) : (num(S.orc.qtdTotal) > 0 ? brl(itemPrecoSemFrete(i) / num(S.orc.qtdTotal)) : '');
      const st = (i.status || '').replace(/"/g, '""');
      csv += `"${forn}";"${sf}";"${fr}";"${tot}";"${und}";"${st}"\n`;
    });
  }

  salvarArquivo(`planejamento-${nSem}-semanas-${iso(new Date())}.csv`, new TextEncoder().encode(csv), 'text/csv;charset=utf-8;');
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
    let cardResumos = `
      <div class="card">
        <h2>📊 Central de Resumos e Relatórios</h2>
        <div class="mu" style="margin-bottom:14px;">Gere relatórios compilados prontos para envio no WhatsApp da equipe e coordenação:</div>
        <div class="fx" style="gap:8px; margin-bottom:14px;">
          <button class="b p" data-act="copiar_resumo" data-tipo="dia" title="Copiar briefing de hoje">☀️ Resumo de Hoje</button>
          <button class="b p" data-act="copiar_resumo" data-tipo="1" title="Copiar compilado de 1 semana (7 dias)">1 Semana (7 dias)</button>
          <button class="b p" data-act="copiar_resumo" data-tipo="2" title="Copiar compilado de 2 semanas (14 dias)">2 Semanas (14 dias)</button>
          <button class="b p" data-act="copiar_resumo" data-tipo="3" title="Copiar compilado de 3 semanas (21 dias)">3 Semanas (21 dias)</button>
          <button class="b data-act="copiar_resumo" data-tipo="4" style="border-color:var(--ac); color:var(--ac); font-weight:600;" title="Copiar compilado do mês (28 dias)">🗓️ Mês (4 Semanas)</button>
        </div>
        <div class="mu" style="font-size:12px; margin-bottom:6px;">Prévia do briefing de hoje (clique em qualquer botão acima para copiar o respectivo período):</div>
        <div style="background:var(--bg); border:1px solid var(--bd); border-radius:8px; padding:12px; font-family:monospace; font-size:12.5px; white-space:pre-wrap; line-height:1.5; color:var(--tx); max-height:340px; overflow-y:auto;">${esc(gerarResumoOperacional('dia'))}</div>
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
