/* ========================================================
   OPERACIONAL.JS - RECIBOS, REPAROS, RESUMOS E APELIDOS
   ARGOS OPS
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
  const profAlert = g.prof === '(sem professor)' ? '<span class="pill w" style="font-size:10.5px; padding:2px 8px;">Defina o professor</span>' : '';
  const aulasStr = g.aulas.map(a => esc(a.turma) + (a.hora ? ' ' + esc(a.hora) : '')).join(' + ');
  
  return `
    <div class="row ${docDone(g) ? 'done' : ''}">
      <div class="t">
        <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
          <b>${esc(g.prof)} — ${wd(g.dia)} ${br(g.dia)}</b>
          ${profAlert}
        </div>
        <span class="mu">${aulasStr}</span>
      </div>
      <div class="doc-actions">
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
    </div>
  `;
};

const docTxt = g => `Professor(a): ${g.prof}\nData: ${g.dia.split('-').reverse().join('/')} (${wd(g.dia)})\nAulas:\n` + g.aulas.map(a => `- ${a.turma} | ${a.hora || 'Sem horário'}${a.desc ? ' | ' + a.desc : ''}`).join('\n');

// --- RESUMOS OPERACIONAIS (REALIZADO VS PLANEJADO POR PERÍODO) ---
function coletarDadosResumoPeriodo(tipo = 'dia', iniOpt = '', fimOpt = '') {
  const intervalo = typeof resolverIntervaloResumo === 'function'
    ? resolverIntervaloResumo(tipo, iniOpt, fimOpt)
    : {
        tipo: String(tipo || 'dia'),
        dataIni: iniOpt || hoje,
        dataFim: fimOpt || iniOpt || hoje,
        iniBR: (iniOpt || hoje).split('-').reverse().join('/'),
        fimBR: (fimOpt || iniOpt || hoje).split('-').reverse().join('/'),
        dias: 1
      };
  const { dataIni, dataFim } = intervalo;
  const fmtData = d => (typeof brFull === 'function' ? brFull(d) : (d ? d.split('-').reverse().join('/') : ''));

  const concluidos = [];
  const planejados = [];

  // 1. Aulas / Cronogramas no intervalo selecionado
  const aulasPeriodo = (S.aulas || []).filter(a => typeof a.dia === 'string' && a.dia >= dataIni && a.dia <= dataFim);
  aulasPeriodo.forEach(a => {
    const profNome = (typeof profCanon === 'function' ? profCanon(a.prof || '') : (a.prof || '')).trim() || 'Sem professor';
    const turma = (a.turma || '').trim();
    const disc = (a.desc || '').trim();
    const hora = (a.hora || '').trim();
    const turno = (a.turno || '').trim();
    const titulo = turma || disc || 'Aula agendada';
    const detalhes = [profNome, disc && turma ? disc : '', hora ? `às ${hora}` : '', turno].filter(Boolean).join(' • ');

    if (a.confirmada) {
      concluidos.push({
        categoria: 'Aula',
        dia: a.dia,
        hora,
        prof: profNome,
        turma,
        disciplina: disc,
        titulo,
        detalhes,
        status: 'Aula confirmada / realizada',
        etapa: 'CONCLUÍDO'
      });
    } else {
      planejados.push({
        categoria: 'Aula',
        dia: a.dia,
        hora,
        prof: profNome,
        turma,
        disciplina: disc,
        titulo,
        detalhes,
        status: 'Aguardando confirmação da aula',
        pendencia: 'aguardando confirmação',
        etapa: 'PENDENTE'
      });
    }
  });

  // 2. Entregas de Material / PPT dentro do período (data da aula ou prazo de entrega no intervalo)
  const matsPeriodo = (S.aulas || []).filter(a => {
    if (typeof a.dia !== 'string') return false;
    const prazo = typeof prazoEntregaMaterial === 'function' ? prazoEntregaMaterial(a.dia) : a.dia;
    const aulaNoPeriodo = a.dia >= dataIni && a.dia <= dataFim;
    const prazoNoPeriodo = typeof prazo === 'string' && prazo >= dataIni && prazo <= dataFim;
    return aulaNoPeriodo || prazoNoPeriodo;
  });

  matsPeriodo.forEach(a => {
    const profNome = (typeof profCanon === 'function' ? profCanon(a.prof || '') : (a.prof || '')).trim() || 'A definir';
    const turma = (a.turma || '').trim() || 'Turma';
    const disc = (a.desc || '').trim();
    const hora = (a.hora || '').trim();
    const envio = (a.formaEnvio || '').trim();
    const prazo = typeof prazoEntregaMaterial === 'function' ? prazoEntregaMaterial(a.dia) : a.dia;
    const prazoInfo = (prazo && prazo !== a.dia) ? `Prazo PPT: ${fmtData(prazo)}` : '';
    const titulo = `${turma}${disc ? ' — ' + disc : ''}`;
    const detalhes = [profNome, envio ? `Via ${envio}` : '', prazoInfo].filter(Boolean).join(' • ');

    if (a.materialPronto) {
      concluidos.push({
        categoria: 'Material / PPT',
        dia: a.dia,
        hora,
        prof: profNome,
        turma,
        disciplina: disc,
        titulo,
        detalhes: [profNome, envio ? `Via ${envio}` : ''].filter(Boolean).join(' • '),
        status: envio ? `Material/PPT enviado (${envio})` : 'Material/PPT enviado',
        etapa: 'ENVIADO'
      });
    } else {
      planejados.push({
        categoria: 'Material / PPT',
        dia: a.dia,
        hora,
        prof: profNome,
        turma,
        disciplina: disc,
        titulo,
        detalhes,
        status: prazoInfo ? `Aguardando envio do material/PPT (${prazoInfo})` : 'Aguardando envio do material/PPT',
        pendencia: 'aguardando envio do material/PPT',
        etapa: 'PENDENTE'
      });
    }
  });

  // 3. Contratos / Recibos Docentes no período
  const gruposPeriodo = typeof groups === 'function' ? groups(dataIni, dataFim) : [];
  gruposPeriodo.forEach(g => {
    const d = (S.docs && S.docs[g.k]) ? S.docs[g.k] : {};
    const hasRecibo = !!d.recibo;
    const hasAprovado = !!d.aprovado;
    const hasEnviado = !!d.enviado;
    const hora0 = (g.aulas && g.aulas[0] && g.aulas[0].hora) ? g.aulas[0].hora : '';
    const turmasDesc = (g.aulas || [])
      .map(au => `${au.turma || ''}${au.desc ? ' (' + au.desc + ')' : ''}`)
      .filter(Boolean)
      .join(' + ');

    if (hasEnviado) {
      const etapasFeitas = [hasRecibo ? 'RECIBO' : '', hasAprovado ? 'APROVADO' : '', 'ENVIADO'].filter(Boolean);
      const statusStr = etapasFeitas.length === 3 ? 'ENVIADO (Concluído)' : `ENVIADO (${etapasFeitas.join(' + ')})`;
      concluidos.push({
        categoria: 'Contrato / Recibo',
        dia: g.dia,
        hora: hora0,
        prof: g.prof,
        turma: turmasDesc,
        disciplina: '',
        titulo: g.prof,
        detalhes: turmasDesc,
        status: statusStr,
        etapa: 'ENVIADO'
      });
    } else {
      const feitas = [hasRecibo ? 'RECIBO' : '', hasAprovado ? 'APROVADO' : ''].filter(Boolean);
      const faltam = [!hasRecibo ? 'RECIBO' : '', !hasAprovado ? 'APROVADO' : '', 'ENVIADO'].filter(Boolean);
      const etapaAtual = feitas.length
        ? (feitas.length === 1 ? `Apenas ${feitas[0]}` : feitas.join(' + '))
        : 'Pendente';
      const faltandoTxt = faltam.length > 1
        ? `aguardando ${faltam.slice(0, -1).join(', ')} e ${faltam[faltam.length - 1]}`
        : `aguardando ${faltam[0]}`;

      planejados.push({
        categoria: 'Contrato / Recibo',
        dia: g.dia,
        hora: hora0,
        prof: g.prof,
        turma: turmasDesc,
        disciplina: '',
        titulo: g.prof,
        detalhes: turmasDesc,
        status: `${etapaAtual} — ${faltandoTxt}`,
        pendencia: faltandoTxt,
        etapa: feitas.join('+') || 'PENDENTE'
      });
    }
  });

  // 4. Manutenções e Reparos com data no intervalo
  (S.reparos || []).forEach(r => {
    const concluido = r.status === 'Concluído' || !!r.feito;
    if (concluido && typeof r.dataConc === 'string' && r.dataConc >= dataIni && r.dataConc <= dataFim) {
      concluidos.push({
        categoria: 'Manutenção',
        dia: r.dataConc,
        hora: '',
        prof: r.resp || '',
        turma: r.local || '',
        disciplina: '',
        titulo: `${r.local ? `[${r.local}] ` : ''}${r.item || 'Reparo'}`,
        detalhes: r.resp ? `Resp.: ${r.resp}` : '',
        status: 'Manutenção concluída',
        etapa: 'CONCLUÍDO'
      });
    } else if (!concluido && typeof r.dataReg === 'string' && r.dataReg >= dataIni && r.dataReg <= dataFim) {
      const pendTxt = r.status === 'Em andamento' ? 'aguardando conclusão' : 'aguardando execução';
      planejados.push({
        categoria: 'Manutenção',
        dia: r.dataReg,
        hora: '',
        prof: r.resp || '',
        turma: r.local || '',
        disciplina: '',
        titulo: `${r.local ? `[${r.local}] ` : ''}${r.item || 'Reparo'}`,
        detalhes: r.resp ? `Resp.: ${r.resp}` : '',
        status: `${r.status || 'Pendente'} — ${pendTxt}`,
        pendencia: pendTxt,
        etapa: r.status === 'Em andamento' ? 'EM ANDAMENTO' : 'PENDENTE'
      });
    }
  });

  const ordenarItens = (a, b) =>
    String(a.dia || '').localeCompare(String(b.dia || '')) ||
    String(a.hora || '').localeCompare(String(b.hora || '')) ||
    String(a.categoria || '').localeCompare(String(b.categoria || ''), 'pt-BR') ||
    String(a.titulo || '').localeCompare(String(b.titulo || ''), 'pt-BR');

  concluidos.sort(ordenarItens);
  planejados.sort(ordenarItens);

  const totalConcluidos = concluidos.length;
  const totalPlanejados = planejados.length;
  const totalGeral = totalConcluidos + totalPlanejados;
  const headerResumo = `Período: ${intervalo.iniBR} a ${intervalo.fimBR} | ✓ Concluídos: ${totalConcluidos} | ◷ Planejados/Pendentes: ${totalPlanejados} | Total: ${totalGeral}`;

  return {
    intervalo,
    concluidos,
    planejados,
    totalConcluidos,
    totalPlanejados,
    totalGeral,
    headerResumo
  };
}

function formatarLinhaItemResumoTxt(item) {
  const dataFmt = typeof brFull === 'function' ? brFull(item.dia) : (item.dia ? item.dia.split('-').reverse().join('/') : '');
  const alvo = item.detalhes ? `${item.titulo} (${item.detalhes})` : item.titulo;
  return `• ${dataFmt} • [${item.categoria}] ${alvo} — ${item.status}`;
}

function gerarResumoOperacional(tipo = 'dia', iniOpt = '', fimOpt = '') {
  const dados = coletarDadosResumoPeriodo(tipo, iniOpt, fimOpt);
  const { concluidos, planejados, totalConcluidos, totalPlanejados, headerResumo } = dados;

  const blocoRealizado = concluidos.length
    ? concluidos.map(formatarLinhaItemResumoTxt).join('\n')
    : '• Nenhum item concluído neste período.';

  const blocoPlanejado = planejados.length
    ? planejados.map(formatarLinhaItemResumoTxt).join('\n')
    : '• Nenhum item planejado ou pendente neste período.';

  let msg = `*ARGOS OPS • RESUMO POR PERÍODO*\n`;
  msg += `${headerResumo}\n\n`;
  msg += `*✓ REALIZADO NO PERÍODO (${totalConcluidos})*\n`;
  msg += `${blocoRealizado}\n\n`;
  msg += `*◷ PLANEJADO / PENDENTE NO PERÍODO (${totalPlanejados})*\n`;
  msg += `${blocoPlanejado}`;
  return msg;
}

// --- GESTÃO DE PROFESSORES (NOME COMPLETO, APELIDOS E DISCIPLINAS) ---
function profCanon(p) {
  const n = norm(p);
  if (!n) return p;
  if (typeof buscarProfessorCadastro === 'function') {
    const cad = buscarProfessorCadastro(p);
    if (cad && cad.name) return cad.name;
  }
  for (const e of (S.apelidos || [])) {
    if (norm(e.nome) === n || (e.alts || []).some(x => norm(x) === n)) return e.nome;
  }
  return p;
}

function unirDocs(canon, alts) {
  const ns = new Set((alts || []).map(norm)), nc = norm(canon);
  Object.keys(S.docs).forEach(k => {
    const i = k.lastIndexOf('|'), nm = k.slice(0, i), dia = k.slice(i + 1);
    if (!ns.has(nm) || nm === nc) return;
    const novo = nc + '|' + dia, a = S.docs[k] || {}, b = S.docs[novo] || {};
    S.docs[novo] = { recibo: !!(a.recibo || b.recibo), aprovado: !!(a.aprovado || b.aprovado), enviado: !!(a.enviado || b.enviado) };
    delete S.docs[k];
  });
}

function garantirListaProfessores() {
  if (!Array.isArray(S.professores)) {
    S.professores = typeof normalizarProfessores === 'function'
      ? normalizarProfessores([], S.apelidos, S.profPerfis, true)
      : [];
  }
  return S.professores;
}

function criarOuObterProfessor(nomeRaw, opts = {}) {
  const nomeLimpo = String(nomeRaw ?? '').trim();
  if (!nomeLimpo) return { ok: false, msg: 'Informe o nome completo do professor.' };

  const lista = garantirListaProfessores();
  const nk = norm(nomeLimpo);
  const existentePorNome = lista.find(p => norm(p.name) === nk);
  if (existentePorNome) {
    let alterou = false;
    const disc = String(opts.disciplina || opts.subject || '').trim();
    if (disc && !existentePorNome.subjects.some(s => norm(s) === norm(disc))) {
      existentePorNome.subjects.push(disc);
      existentePorNome.subjects.sort((a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }));
      alterou = true;
    }
    if (opts.turno && !existentePorNome.turno) { existentePorNome.turno = String(opts.turno).trim(); alterou = true; }
    if (opts.sala && !existentePorNome.sala) { existentePorNome.sala = String(opts.sala).trim(); alterou = true; }
    if (alterou && typeof sincronizarLegadoProfessores === 'function') sincronizarLegadoProfessores(S);
    return {
      ok: true,
      existente: true,
      prof: existentePorNome,
      msg: alterou ? `Cadastro de "${existentePorNome.name}" atualizado.` : `"${existentePorNome.name}" já está cadastrado.`
    };
  }

  const existentePorApelido = lista.find(p => (p.aliases || []).some(a => norm(a) === nk));
  if (existentePorApelido) {
    return {
      ok: false,
      existente: true,
      prof: existentePorApelido,
      msg: `⚠\uFE0E "${nomeLimpo}" já é apelido de "${existentePorApelido.name}".`
    };
  }

  const subjects = [];
  const discInicial = String(opts.disciplina || opts.subject || '').trim();
  if (discInicial) subjects.push(discInicial);

  const novo = {
    id: 'prof_' + uid(),
    name: nomeLimpo,
    aliases: [],
    subjects,
    turno: String(opts.turno || '').trim(),
    sala: String(opts.sala || '').trim()
  };
  lista.push(novo);
  if (typeof sincronizarLegadoProfessores === 'function') sincronizarLegadoProfessores(S);
  return { ok: true, existente: false, prof: novo, msg: `Professor "${novo.name}" cadastrado!` };
}

function adicionarApelidoProfessor(profId, aliasRaw) {
  const lista = garantirListaProfessores();
  const prof = lista.find(p => p.id === profId);
  if (!prof) return { ok: false, msg: 'Professor não encontrado.' };

  const entradas = (Array.isArray(aliasRaw) ? aliasRaw : String(aliasRaw ?? '').split(','))
    .map(v => String(v || '').trim())
    .filter(Boolean);
  if (!entradas.length) return { ok: false, msg: 'Informe um apelido.' };

  const adicionados = [];
  for (const cand of entradas) {
    const nc = norm(cand);
    if (!nc) continue;
    if (nc === norm(prof.name)) {
      if (entradas.length === 1) return { ok: false, msg: 'O apelido não pode ser igual ao nome completo.' };
      continue;
    }
    if ((prof.aliases || []).some(a => norm(a) === nc)) {
      if (entradas.length === 1) return { ok: false, msg: `Apelido "${cand}" já existe neste cadastro.` };
      continue;
    }
    const outroOficial = lista.find(p => p.id !== prof.id && norm(p.name) === nc);
    if (outroOficial) {
      return { ok: false, msg: `⚠\uFE0E "${cand}" já está cadastrado como professor ("${outroOficial.name}").` };
    }
    const outroVinculo = lista.find(p => p.id !== prof.id && (p.aliases || []).some(a => norm(a) === nc));
    if (outroVinculo) {
      return { ok: false, msg: `⚠\uFE0E "${cand}" já está vinculado como apelido de "${outroVinculo.name}".` };
    }
    prof.aliases = Array.isArray(prof.aliases) ? prof.aliases : [];
    prof.aliases.push(cand);
    adicionados.push(cand);
  }

  if (!adicionados.length) {
    return { ok: false, msg: 'Nenhum apelido novo para adicionar.' };
  }

  prof.aliases.sort((a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }));
  unirDocs(prof.name, prof.aliases);
  if (typeof sincronizarLegadoProfessores === 'function') sincronizarLegadoProfessores(S);
  return {
    ok: true,
    adicionados,
    prof,
    msg: adicionados.length === 1 ? `Apelido "${adicionados[0]}" adicionado.` : `${adicionados.length} apelidos adicionados.`
  };
}

function removerApelidoProfessor(profId, aliasVal) {
  const lista = garantirListaProfessores();
  const prof = lista.find(p => p.id === profId);
  if (!prof) return { ok: false, msg: 'Professor não encontrado.' };
  const alvo = norm(aliasVal);
  const antes = (prof.aliases || []).length;
  prof.aliases = (prof.aliases || []).filter(a => norm(a) !== alvo);
  if (prof.aliases.length === antes) return { ok: false, msg: 'Apelido não encontrado.' };
  if (typeof sincronizarLegadoProfessores === 'function') sincronizarLegadoProfessores(S);
  return { ok: true, prof, msg: `Apelido "${aliasVal}" removido.` };
}

function adicionarDisciplinaProfessor(profId, subjRaw) {
  const lista = garantirListaProfessores();
  const prof = lista.find(p => p.id === profId);
  if (!prof) return { ok: false, msg: 'Professor não encontrado.' };
  const val = String(subjRaw ?? '').trim();
  if (!val) return { ok: false, msg: 'Informe uma disciplina.' };
  prof.subjects = Array.isArray(prof.subjects) ? prof.subjects : [];
  if (prof.subjects.some(s => norm(s) === norm(val))) {
    return { ok: false, msg: `Disciplina "${val}" já vinculada a este professor.` };
  }
  prof.subjects.push(val);
  prof.subjects.sort((a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }));
  if (typeof sincronizarLegadoProfessores === 'function') sincronizarLegadoProfessores(S);
  return { ok: true, prof, msg: `Disciplina "${val}" vinculada.` };
}

function removerDisciplinaProfessor(profId, subjVal) {
  const lista = garantirListaProfessores();
  const prof = lista.find(p => p.id === profId);
  if (!prof) return { ok: false, msg: 'Professor não encontrado.' };
  const alvo = norm(subjVal);
  const antes = (prof.subjects || []).length;
  prof.subjects = (prof.subjects || []).filter(s => norm(s) !== alvo);
  if (prof.subjects.length === antes) return { ok: false, msg: 'Disciplina não encontrada.' };
  if (typeof sincronizarLegadoProfessores === 'function') sincronizarLegadoProfessores(S);
  return { ok: true, prof, msg: `Disciplina "${subjVal}" removida.` };
}

function atualizarExtrasProfessor(profId, campo, valor) {
  if (campo !== 'turno' && campo !== 'sala') return false;
  const lista = garantirListaProfessores();
  const prof = lista.find(p => p.id === profId);
  if (!prof) return false;
  prof[campo] = String(valor ?? '').trim();
  if (typeof sincronizarLegadoProfessores === 'function') sincronizarLegadoProfessores(S);
  return true;
}

function removerProfessorCadastro(profId) {
  const lista = garantirListaProfessores();
  const alvo = lista.find(p => p.id === profId);
  if (!alvo) return false;
  S.professores = lista.filter(p => p.id !== profId);
  if (typeof profsExpandidos !== 'undefined' && profsExpandidos && typeof profsExpandidos.delete === 'function') {
    profsExpandidos.delete(profId);
  }
  if (typeof sincronizarLegadoProfessores === 'function') sincronizarLegadoProfessores(S);
  return true;
}

function analisarApelido(nome, alts) {
  const nomeLimpo = (nome || '').trim();
  const listaBruta = Array.isArray(alts) ? alts : String(alts || '').split(',');
  const vistos = new Set();
  const altsLimpos = [];

  for (const bruto of listaBruta) {
    const a = String(bruto || '').trim();
    const na = norm(a);
    if (!a || na === norm(nomeLimpo) || vistos.has(na)) continue;
    vistos.add(na);
    altsLimpos.push(a);
  }

  const lista = garantirListaProfessores();
  const nNome = norm(nomeLimpo);
  const oficialExistente = nNome ? lista.find(x => norm(x.name) === nNome) : null;
  const nomeComoApelido = nNome ? lista.find(x => (x.aliases || []).some(a => norm(a) === nNome)) : null;

  if (nomeComoApelido) {
    return {
      ok: false,
      motivo: 'conflito_nome',
      msg: `⚠\uFE0E "${nomeLimpo}" já está vinculado como apelido de "${nomeComoApelido.name}".`
    };
  }

  for (const alt of altsLimpos) {
    const nAlt = norm(alt);
    const outroOficial = lista.find(x => x !== oficialExistente && norm(x.name) === nAlt);
    if (outroOficial) {
      return {
        ok: false,
        motivo: 'conflito_alt',
        msg: `⚠\uFE0E O apelido "${alt}" já está cadastrado como professor ("${outroOficial.name}").`
      };
    }
    const outroVinculo = lista.find(x => x !== oficialExistente && (x.aliases || []).some(a => norm(a) === nAlt));
    if (outroVinculo) {
      return {
        ok: false,
        motivo: 'conflito_alt',
        msg: `⚠\uFE0E O apelido "${alt}" já está vinculado a "${outroVinculo.name}".`
      };
    }
  }

  if (!nomeLimpo || !altsLimpos.length) {
    if (oficialExistente && nomeLimpo && !altsLimpos.length) {
      return {
        ok: false,
        motivo: 'info_oficial',
        existente: oficialExistente,
        msg: `ℹ\uFE0E "${oficialExistente.name}" já está cadastrado (${(oficialExistente.aliases || []).length} apelido(s)).`
      };
    }
    return {
      ok: false,
      motivo: 'vazio',
      msg: '⚠\uFE0E Informe o nome completo e pelo menos um apelido diferente.'
    };
  }

  if (oficialExistente) {
    const novosAlts = altsLimpos.filter(a => !(oficialExistente.aliases || []).some(y => norm(y) === norm(a)));
    if (!novosAlts.length) {
      return {
        ok: false,
        motivo: 'duplicado',
        msg: '⚠\uFE0E Este nome e apelido(s) já estão cadastrados!'
      };
    }
    return {
      ok: true,
      motivo: 'mesclado',
      existente: oficialExistente,
      nome: oficialExistente.name,
      novosAlts
    };
  }

  return {
    ok: true,
    motivo: 'criado',
    nome: nomeLimpo,
    novosAlts: altsLimpos
  };
}

function addApelido(nome, alts) {
  const analise = analisarApelido(nome, alts);
  if (!analise.ok) return analise;

  let prof = analise.existente;
  if (!prof) {
    const criado = criarOuObterProfessor(analise.nome);
    if (!criado.ok) return criado;
    prof = criado.prof;
  }

  const resAdd = adicionarApelidoProfessor(prof.id, analise.novosAlts);
  if (!resAdd.ok) return resAdd;

  return {
    ok: true,
    motivo: analise.motivo,
    nome: prof.name,
    prof,
    msg: analise.motivo === 'mesclado'
      ? `ℹ\uFE0E Apelidos mesclados ao cadastro de "${prof.name}"!`
      : `✓ Nomes unidos para "${prof.name}"!`
  };
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
  return out.sort((a, b) =>
    a.alt.localeCompare(b.alt, 'pt-BR', { sensitivity: 'base' }) ||
    a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' })
  );
}

function salvarProfPerfil(nome, disciplina = '', turno = '', sala = '') {
  const res = criarOuObterProfessor(nome, { disciplina, turno, sala });
  if (!res || !res.ok || !res.prof) return false;
  if (disciplina) adicionarDisciplinaProfessor(res.prof.id, disciplina);
  if (turno !== undefined && turno !== '') atualizarExtrasProfessor(res.prof.id, 'turno', turno);
  if (sala !== undefined && sala !== '') atualizarExtrasProfessor(res.prof.id, 'sala', sala);
  return true;
}

function formatarMetaProfessor(prof) {
  const nAl = Array.isArray(prof.aliases) ? prof.aliases.length : 0;
  const nSub = Array.isArray(prof.subjects) ? prof.subjects.length : 0;
  const partes = [];
  if (nAl > 0) partes.push(`${nAl} ${nAl === 1 ? 'apelido' : 'apelidos'}`);
  if (nSub > 0) partes.push(`${nSub} ${nSub === 1 ? 'disciplina' : 'disciplinas'}`);
  return partes.join(' • ');
}

function cardApelidos() {
  const sug = sugApelidos();
  const profs = garantirListaProfessores();
  const profsOrd = [...profs].sort((a, b) =>
    (a.name || '').localeCompare(b.name || '', 'pt-BR', { sensitivity: 'base' })
  );

  const filtroRaw = typeof filtroGestaoProfs === 'string' ? filtroGestaoProfs.trim() : '';
  const termosFiltro = filtroRaw ? norm(filtroRaw).split(/\s+/).filter(Boolean) : [];
  const profsFiltrados = termosFiltro.length
    ? profsOrd.filter(p => matchBusca(`${p.name} ${(p.aliases || []).join(' ')} ${(p.subjects || []).join(' ')} ${p.turno || ''} ${p.sala || ''}`, termosFiltro))
    : profsOrd;

  const nomesSugestaoCadastro = [...new Set([
    ...nomesProf().filter(n => !buscarProfessorCadastro || !buscarProfessorCadastro(n))
  ].filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }));

  const disciplinasList = typeof getPresetList === 'function' ? getPresetList('professores', 'disciplinas') : [];

  const profSchema = typeof PROF_PRESET_SCHEMA !== 'undefined' ? PROF_PRESET_SCHEMA : [
    { key: 'disciplinas', label: 'Disciplinas / Áreas', placeholder: 'Nova disciplina / área de atuação...' },
    { key: 'turnos', label: 'Turnos', placeholder: 'Novo turno (ex: Manhã, Sábado)...' },
    { key: 'salas', label: 'Salas de Aula / Turmas', placeholder: 'Nova sala ou turma padrão...' }
  ];
  const profSubAtiva = (typeof profPresetSubAtual === 'string' && profSchema.some(s => s.key === profPresetSubAtual))
    ? profPresetSubAtual
    : profSchema[0].key;
  const profSubObj = profSchema.find(s => s.key === profSubAtiva) || profSchema[0];
  const profItensAtivos = typeof getPresetList === 'function' ? getPresetList('professores', profSubAtiva) : [];

  const blocoProfPresets = `
    <div class="prof-presets-panel">
      <div class="prof-presets-head">
        <div>
          <h3 style="margin:0;"><span class="ui-glyph" aria-hidden="true">\u2699\uFE0E</span> Disciplinas, Turnos & Salas / Turmas</h3>
          <div class="mu" style="font-size:12px;">Opções predefinidas disponíveis para vincular aos professores e ao quadro de aulas.</div>
        </div>
      </div>
      <div class="prof-presets-tabs" role="tablist" aria-label="Listas de professores">
        ${profSchema.map(sub => {
          const qtd = typeof getPresetList === 'function' ? getPresetList('professores', sub.key).length : 0;
          const ativo = sub.key === profSubAtiva;
          return `<button type="button" class="prof-presets-tab ${ativo ? 'active' : ''}" data-act="prof_preset_tab" data-sub="${esc(sub.key)}" role="tab" aria-selected="${ativo}">${esc(sub.label)} (${qtd})</button>`;
        }).join('')}
      </div>
      <form data-form="prof_preset_add" class="prof-presets-form">
        <input type="hidden" name="sub" value="${esc(profSubAtiva)}">
        <input id="profPresetInputNome" name="nome" placeholder="${esc(profSubObj.placeholder || 'Nova opção...')}" required autocomplete="off">
        <button type="submit" class="b p" style="white-space:nowrap;">+ Adicionar</button>
      </form>
      <div class="prof-presets-chips">
        ${profItensAtivos.map(item => {
          const val = typeof item === 'string' ? item : (item && item.nome ? item.nome : '');
          return `
            <div class="preset-chip">
              <span>${esc(val)}</span>
              <button type="button" class="preset-chip-del" data-act="preset_del" data-cat="professores" data-sub="${esc(profSubAtiva)}" data-val="${esc(val)}" title="Remover">✕</button>
            </div>
          `;
        }).join('') || '<span class="mu" style="font-size:12px; font-style:italic;">Nenhuma opção cadastrada nesta lista.</span>'}
      </div>
    </div>
  `;

  const blocoNovoProfessor = `
    <div class="prof-register-box">
      <h3 style="margin:0 0 6px;">Cadastrar Professor</h3>
      <div class="mu" style="margin-bottom:10px; font-size:12px;">Informe o <b>Nome Completo</b> do docente. Depois clique sobre o nome na lista abaixo para gerenciar apelidos e disciplinas.</div>
      <datalist id="profsAulasSugList">${nomesSugestaoCadastro.map(n => `<option value="${esc(n)}">`).join('')}</datalist>
      <datalist id="listaDisciplinasProf">${disciplinasList.map(d => `<option value="${esc(d)}">`).join('')}</datalist>
      <form data-form="prof_novo" class="prof-ficha-form form-grid-compact">
        <div class="field-group span-2-desktop">
          <label class="field-label" for="inpNovoProfNome">Nome Completo *</label>
          <input id="inpNovoProfNome" name="nome" list="profsAulasSugList" placeholder="Ex.: Carlos Eduardo Silva" required autocomplete="off">
        </div>
        <div class="field-group">
          <label class="field-label" for="inpNovoProfDisc">Disciplina inicial (opcional)</label>
          <input id="inpNovoProfDisc" name="disciplina" list="listaDisciplinasProf" placeholder="Selecionar ou digitar..." autocomplete="off">
        </div>
        <div class="form-actions-cell">
          <button type="submit" class="b p" style="white-space:nowrap;">+ Cadastrar</button>
        </div>
      </form>
    </div>
  `;

  let blocoSugestoes = '';
  if (sug.length) {
    blocoSugestoes = `
      <div class="prof-sug-box">
        <div style="display:flex; align-items:center; justify-content:space-between; gap:8px; flex-wrap:wrap; margin-bottom:6px;">
          <h3 style="margin:0;">Sugestões automáticas de apelido (${sug.length})</h3>
          ${sug.length > 1 ? `<button type="button" class="b" data-act="ap_todas" style="font-size:11.5px; padding:4px 10px;">Unir todas</button>` : ''}
        </div>
        ${sug.map(s => `
          <div class="row" style="padding:7px 6px;">
            <div class="t"><b class="sug-pair">${esc(s.alt)} <span class="sug-arrow">${icoSeta('arrow-right', 14)}</span> ${esc(s.nome)}</b></div>
            <button type="button" class="b p" data-act="ap_unir" data-alt="${esc(s.alt)}" data-nome="${esc(s.nome)}" style="font-size:12px; padding:4px 10px;">Vincular</button>
          </div>
        `).join('')}
      </div>
    `;
  }

  const listaCardsHtml = profsFiltrados.length
    ? profsFiltrados.map(p => {
        const isOpen = typeof profsExpandidos !== 'undefined' && profsExpandidos && profsExpandidos.has(p.id);
        const metaTxt = formatarMetaProfessor(p);
        const aliases = Array.isArray(p.aliases) ? p.aliases : [];
        const subjects = Array.isArray(p.subjects) ? p.subjects : [];

        return `
          <div class="prof-card ${isOpen ? 'is-expanded' : ''}" data-prof-id="${esc(p.id)}">
            <div class="prof-card-head">
              <button type="button" class="prof-card-trigger" data-act="toggle_prof_card" data-id="${esc(p.id)}" aria-expanded="${isOpen ? 'true' : 'false'}">
                <span class="ui-glyph prof-card-chevron" aria-hidden="true">▸</span>
                <span class="prof-card-title-wrap">
                  <span class="prof-card-name">${esc(p.name)}</span>
                  ${metaTxt ? `<span class="prof-card-meta">${esc(metaTxt)}</span>` : ''}
                </span>
              </button>
              <button type="button" class="prof-card-del" data-act="del_professor" data-id="${esc(p.id)}" title="Remover cadastro do professor" aria-label="Remover ${esc(p.name)}">✕</button>
            </div>
            <div class="prof-card-accordion">
              <div class="prof-card-accordion-inner">
                <div class="prof-card-body">
                  <div class="prof-detail-grid">
                    <div class="prof-detail-block">
                      <div class="prof-detail-label">Apelidos (Nomes Secundários)</div>
                      <div class="prof-pills-list">
                        ${aliases.length
                          ? aliases.map(al => `
                              <span class="prof-pill">
                                <span>${esc(al)}</span>
                                <button type="button" class="prof-pill-del" data-act="prof_del_alias" data-id="${esc(p.id)}" data-val="${esc(al)}" title="Remover apelido" aria-label="Remover apelido ${esc(al)}">✕</button>
                              </span>
                            `).join('')
                          : '<span class="prof-pills-empty">Nenhum apelido cadastrado</span>'
                        }
                      </div>
                      <form class="prof-inline-form" data-form="prof_add_alias" data-id="${esc(p.id)}">
                        <input type="text" name="alias" id="inpProfAlias_${esc(p.id)}" class="prof-inline-input" placeholder="Adicionar apelido..." autocomplete="off">
                        <button type="submit" class="b p prof-inline-add-btn" title="Adicionar apelido" aria-label="Adicionar apelido">+</button>
                      </form>
                    </div>

                    <div class="prof-detail-block">
                      <div class="prof-detail-label">Disciplinas do Professor</div>
                      <div class="prof-pills-list">
                        ${subjects.length
                          ? subjects.map(sub => `
                              <span class="prof-pill is-subject">
                                <span>${esc(sub)}</span>
                                <button type="button" class="prof-pill-del" data-act="prof_del_subject" data-id="${esc(p.id)}" data-val="${esc(sub)}" title="Remover disciplina" aria-label="Remover disciplina ${esc(sub)}">✕</button>
                              </span>
                            `).join('')
                          : '<span class="prof-pills-empty">Nenhuma disciplina vinculada</span>'
                        }
                      </div>
                      <form class="prof-inline-form" data-form="prof_add_subject" data-id="${esc(p.id)}">
                        <input type="text" name="subject" id="inpProfSubject_${esc(p.id)}" class="prof-inline-input" list="listaDisciplinasProf" placeholder="Selecionar ou digitar disciplina..." autocomplete="off">
                        <button type="submit" class="b p prof-inline-add-btn" title="Adicionar disciplina" aria-label="Adicionar disciplina">+</button>
                      </form>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        `;
      }).join('')
    : `<div class="empty" style="padding:14px 0;">${termosFiltro.length ? 'Nenhum professor encontrado para este filtro (nome, apelido ou disciplina).' : 'Nenhum professor cadastrado ainda. Adicione o primeiro acima.'}</div>`;

  const badgeSug = sug.length
    ? `<span class="pill w" title="${sug.length} sugestão(ões) de apelido encontrada(s)">${sug.length} sugest${sug.length > 1 ? 'ões' : 'ão'}</span>`
    : '';

  return `
    <div class="settings-professores-section">
      <div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:8px; margin-bottom:14px;">
        <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
          <h2 style="margin:0;">Gestão de Professores</h2>
          <span class="pill ${profsOrd.length > 0 ? 'o' : ''}">${profsOrd.length} ${profsOrd.length === 1 ? 'professor' : 'professores'}</span>
          ${badgeSug}
        </div>
      </div>

      ${blocoProfPresets}
      ${blocoNovoProfessor}
      ${blocoSugestoes}

      <div class="prof-list-section">
        <div class="prof-list-toolbar">
          <div>
            <h3 style="margin:0;">Professores Cadastrados (${profsFiltrados.length}${termosFiltro.length ? ` de ${profsOrd.length}` : ''})</h3>
            <div class="mu" style="font-size:12px;">Clique no nome do professor para expandir e editar apelidos e disciplinas.</div>
          </div>
          <div class="prof-list-search-wrap">
            <span class="ui-glyph prof-list-search-ico" aria-hidden="true">⌕</span>
            <input id="filtroGestaoProfs" type="text" class="prof-list-search-input" value="${esc(filtroRaw)}" placeholder="Filtrar por nome, apelido ou disciplina..." autocomplete="off">
          </div>
        </div>
        <div class="prof-cards-list">
          ${listaCardsHtml}
        </div>
      </div>
    </div>
  `;
}

// --- RENDERIZADOR DA ABA OPERAÇÕES ---

async function baixarPlanilhaResumo(tipo, iniOpt = '', fimOpt = '') {
  const agora = new Date();
  const resumo = coletarDadosResumoPeriodo(tipo, iniOpt, fimOpt);
  const { dataIni, dataFim, iniBR, fimBR, dias } = resumo.intervalo;
  const ehDia = dataIni === dataFim;
  const rotuloPeriodo = ehDia
    ? `DIA ${iniBR}`
    : `${iniBR} A ${fimBR}`;
  const rotuloDias = dias === 1 ? '1 dia' : `${dias} dias`;
  const slugPeriodo = `${dataIni}-a-${dataFim}`;
  const geradoEm = `${agora.toLocaleDateString('pt-BR')} às ${pad(agora.getHours())}:${pad(agora.getMinutes())}`;

  const aulasPeriodo = S.aulas.filter(a => a.dia >= dataIni && a.dia <= dataFim);
  aulasPeriodo.sort((a, b) => (a.dia + (a.hora || '')).localeCompare(b.dia + (b.hora || '')));

  const repPend = S.reparos.filter(r => r.status !== 'Concluído');
  const orcAguardando = (S.orc.itens || []).filter(i => i.status === 'Aguardando aprovação');
  const G_periodo = groups(dataIni, dataFim);

  if (typeof window.ExcelJS === 'undefined') {
    let csv = `\uFEFFARGOS OPS — RESUMO POR PERÍODO (${rotuloPeriodo})\n`;
    csv += `${resumo.headerResumo}\n\n`;
    csv += `✓ REALIZADO NO PERÍODO (${resumo.totalConcluidos})\nData;Categoria;Item / Professor;Detalhes;Status\n`;
    if (resumo.concluidos.length) {
      resumo.concluidos.forEach(it => {
        csv += `"${brFull(it.dia)}";"${it.categoria}";"${(it.titulo || '').replace(/"/g, '""')}";"${(it.detalhes || '').replace(/"/g, '""')}";"${(it.status || '').replace(/"/g, '""')}"\n`;
      });
    } else {
      csv += '"";"";"Nenhum item concluído neste período.";"";""\n';
    }
    csv += `\n◷ PLANEJADO / PENDENTE NO PERÍODO (${resumo.totalPlanejados})\nData;Categoria;Item / Professor;Detalhes;Status\n`;
    if (resumo.planejados.length) {
      resumo.planejados.forEach(it => {
        csv += `"${brFull(it.dia)}";"${it.categoria}";"${(it.titulo || '').replace(/"/g, '""')}";"${(it.detalhes || '').replace(/"/g, '""')}";"${(it.status || '').replace(/"/g, '""')}"\n`;
      });
    } else {
      csv += '"";"";"Nenhum item planejado ou pendente neste período.";"";""\n';
    }
    csv += `\nDETALHAMENTO DE AULAS\nData;Dia da Semana;Horário;Turma;Professor;Disciplina;Confirmação de Aula;Material (Slides)\n`;
    aulasPeriodo.forEach(a => {
      csv += `"${brFull(a.dia)}";"${wd(a.dia)}";"${a.hora || ''}";"${(a.turma || '').replace(/"/g, '""')}";"${(a.prof || '').replace(/"/g, '""')}";"${(a.desc || '').replace(/"/g, '""')}";"${a.confirmada ? 'Confirmada' : 'Pendente'}";"${a.materialPronto ? 'Pronto' : 'Pendente'}"\n`;
    });
    if (repPend.length > 0) {
      csv += '\n\nMANUTENÇÕES E REPAROS PENDENTES\n\nData Registro;Item;Local;Status;Observações\n';
      repPend.forEach(r => {
        csv += `"${brFull(r.dataReg || hoje)}";"${(r.item || '').replace(/"/g, '""')}";"${(r.local || '').replace(/"/g, '""')}";"${(r.status || '').replace(/"/g, '""')}";"${(r.obs || '').replace(/"/g, '""')}"\n`;
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
    wb.creator = 'ARGOS OPS';
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
    // ABA 0: RESUMO POR PERÍODO (REALIZADO VS PLANEJADO)
    // ========================================================
    const wsResumo = wb.addWorksheet('Resumo do Período', {
      views: [{ state: 'frozen', ySplit: 4, showGridLines: false }],
      pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 }
    });

    aplicarBanner(
      wsResumo,
      5,
      `ARGOS OPS  •  RESUMO POR PERÍODO (${rotuloPeriodo})`,
      `${resumo.headerResumo}   |   Exportado em: ${geradoEm}`
    );

    estilizarHeader(
      wsResumo,
      4,
      ['Classificação', 'Data', 'Categoria', 'Item / Professor / Turma', 'Status / Etapa'],
      [1, 2, 3],
      []
    );

    const linhasResumo = [
      ...resumo.concluidos.map(it => ({ grupo: '✓ REALIZADO', ok: true, it })),
      ...resumo.planejados.map(it => ({ grupo: '◷ PLANEJADO / PENDENTE', ok: false, it }))
    ];
    const wResumo = [24, 14, 18, 42, 36];
    if (linhasResumo.length > 0) {
      wsResumo.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4 + linhasResumo.length, column: 5 } };
      linhasResumo.forEach((entry, idx) => {
        const rIdx = 5 + idx;
        const row = wsResumo.getRow(rIdx);
        row.height = 23;
        const bg = idx % 2 === 1 ? C_ZEBRA : C_WHITE;
        const descCompleta = entry.it.detalhes ? `${entry.it.titulo} (${entry.it.detalhes})` : entry.it.titulo;
        row.getCell(1).value = entry.grupo;
        row.getCell(2).value = brFull(entry.it.dia);
        row.getCell(3).value = entry.it.categoria;
        row.getCell(4).value = descCompleta;
        row.getCell(5).value = entry.it.status;
        wResumo[3] = Math.max(wResumo[3], Math.min(58, descCompleta.length + 4));
        wResumo[4] = Math.max(wResumo[4], Math.min(48, (entry.it.status || '').length + 4));

        for (let c = 1; c <= 5; c++) {
          const cell = row.getCell(c);
          cell.border = borderThin;
          cell.alignment = { vertical: 'middle', horizontal: [1, 2, 3].includes(c) ? 'center' : 'left', wrapText: c >= 4 };
          if (c === 1) {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: entry.ok ? C_EMERALD_PILL : C_AMBER_PILL } };
            cell.font = { name: FONT_NAME, size: 9.5, bold: true, color: { argb: entry.ok ? C_EMERALD_TX : C_AMBER_TX } };
          } else {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
            cell.font = { name: FONT_NAME, size: 10, bold: c === 4, color: { argb: c === 5 ? C_MUTED : C_TEXT } };
          }
        }
      });
    } else {
      wsResumo.mergeCells('A5:E5');
      const emptyRes = wsResumo.getCell('A5');
      emptyRes.value = 'Nenhum registro encontrado neste período.';
      emptyRes.font = { name: FONT_NAME, size: 11, italic: true, color: { argb: C_MUTED } };
      emptyRes.alignment = { vertical: 'middle', horizontal: 'center' };
      wsResumo.getRow(5).height = 28;
    }
    wResumo.forEach((w, i) => { wsResumo.getColumn(i + 1).width = w; });

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
      `ARGOS OPS  •  PLANEJAMENTO DE AULAS (${rotuloPeriodo})`,
      `Período: ${iniBR} a ${fimBR} (${rotuloDias})   |   Manutenções Abertas: ${repPend.length}   |   Exportado em: ${geradoEm}`
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
        label: '✓ AULAS CONFIRMADAS',
        formula: aulasPeriodo.length ? `COUNTIF(G${firstAulaRow}:G${lastAulaRow},"Confirmada")` : '0',
        result: qtdConf,
        bg: C_EMERALD_BG, labelColor: C_EMERALD_TX, valColor: C_EMERALD_TX
      },
      {
        rangeLabel: 'E4:F4', rangeVal: 'E5:F5',
        label: '▪ MATERIAIS PRONTOS',
        formula: aulasPeriodo.length ? `COUNTIF(H${firstAulaRow}:H${lastAulaRow},"Pronto")` : '0',
        result: qtdMatOk,
        bg: C_BLUE_BG, labelColor: C_BLUE_TX, valColor: C_BLUE_TX
      },
      {
        rangeLabel: 'G4:I4', rangeVal: 'G5:I5',
        label: '◷ PENDÊNCIAS (AULAS + SLIDES)',
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
        'ARGOS OPS  •  CONTROLE DE RECIBOS E CONTRATOS',
        `Período: ${iniBR} a ${fimBR}   |   Grupos Professor/Dia: ${G_periodo.length}   |   Pendentes: ${pendCount}`
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
        'ARGOS OPS  •  MANUTENÇÕES E REPAROS EM ABERTO',
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
        'ARGOS OPS  •  ORÇAMENTOS AGUARDANDO APROVAÇÃO',
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

        const fullUrl = typeof safeHttpUrl === 'function' ? safeHttpUrl(urlCompra) : '';
        if (urlCompra && fullUrl) {
          row.getCell(7).value = { text: dom ? `↗ ${dom}` : urlCompra, hyperlink: fullUrl };
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
          } else if (c === 7 && urlCompra && fullUrl) {
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
      <button class="b ${subTabSemana === 'docs' ? 'p' : ''}" data-act="sub_semana" data-v="docs">Recibos e Envios</button>        
      <button class="b ${subTabSemana === 'reparos' ? 'p' : ''}" data-act="sub_semana" data-v="reparos">Manutenções e Reparos</button>
      <button class="b ${subTabSemana === 'resumos' ? 'p' : ''}" data-act="sub_semana" data-v="resumos">Resumos Operacionais</button>
      <button class="b ${subTabSemana === 'conversor' ? 'p' : ''}" data-act="sub_semana" data-v="conversor">Converter Imagens</button>
    </div>
  `;

  if (subTabSemana === 'reparos') {
    const termosBusca = typeof getBuscaTermos === 'function' ? getBuscaTermos() : [];
    const reparosFiltrados = S.reparos.filter(r => {
      const okFiltro = repFiltro === 'abertos' ? r.status !== 'Concluído' : (repFiltro === 'concluidos' ? r.status === 'Concluído' : true);
      if (!okFiltro) return false;
      if (!termosBusca.length) return true;
      const diaReg = typeof br === 'function' ? br(r.dataReg) : r.dataReg;
      return matchBusca(`${r.item} ${r.local} ${r.resp} ${r.obs} ${r.status} ${diaReg}`, termosBusca);
    });
    
    const reparoRowFull = r => `
      <div class="row ${r.status === 'Concluído' ? 'done' : ''}">
        <div class="t">
          <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
            ${r.local ? `<span class="pill b"><b>${esc(r.local)}</b></span>` : ''}
            <b>${esc(r.item)}</b>
            <span class="${r.status === 'Concluído' ? 'pill o' : 'pill w'}">${esc(r.status)}</span>
          </div>
          <input class="obs" data-act="rep_obs" data-id="${esc(r.id)}" placeholder="Observações" value="${esc(r.obs || '')}">
        </div>
        <select data-act="rep_st" data-id="${esc(r.id)}">
          <option value="Pendente" ${r.status === 'Pendente' ? 'selected' : ''}>Pendente</option>
          <option value="Em andamento" ${r.status === 'Em andamento' ? 'selected' : ''}>Em andamento</option>
          <option value="Concluído" ${r.status === 'Concluído' ? 'selected' : ''}>Concluído</option>
        </select>
        <button class="b" data-act="del_reparo" data-id="${esc(r.id)}">Excluir</button>
      </div>
    `;

    let locaisOpts = typeof getPresetList === 'function' ? getPresetList('reparos', 'locais') : LOCAIS_MANUTENCAO;
    let repFormCardHtml = `
      <form data-form="reparo" class="form-grid-compact" style="margin-bottom:0;">
        <div class="field-group">
          <label class="field-label" for="repLocalSelect">Local / Ambiente</label>
          <div class="preset-field-wrap">
            <select id="repLocalSelect" name="local" required>
              <option value="">Selecione o local...</option>
              ${locaisOpts.map(loc => `<option value="${esc(loc)}">${esc(loc)}</option>`).join('')}
            </select>
            ${typeof presetGearBtn === 'function' ? presetGearBtn('reparos', 'locais') : ''}
          </div>
        </div>
        <div class="field-group span-2-desktop">
          <label class="field-label" for="repItemInput">Problema / Descrição do Chamado</label>
          <input id="repItemInput" name="item" placeholder="Ex: Lâmpada queimada, tomada sem energia" required>
        </div>
        <div class="form-actions-cell">
          <button class="b p" style="white-space:nowrap;">+ Adicionar Chamado</button>
          <button type="button" class="b" data-act="rel" style="white-space:nowrap;"><span class="ui-glyph" aria-hidden="true">≡</span> Copiar Relatório</button>
        </div>
      </form>
    `;

    let repListaHtml = `
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; margin-bottom:12px;">
        <h2 style="margin:0;">Chamados e Manutenções (${reparosFiltrados.length})</h2>
        <div class="fx" style="margin-bottom:0;">
          <button class="b ${repFiltro === 'abertos' ? 'p' : ''}" data-act="repf" data-v="abertos">Abertos</button>
          <button class="b ${repFiltro === 'concluidos' ? 'p' : ''}" data-act="repf" data-v="concluidos">Concluídos</button>
          <button class="b ${repFiltro === 'todos' ? 'p' : ''}" data-act="repf" data-v="todos">Todos</button>
        </div>
      </div>
      <div id="listaReparos">${reparosFiltrados.map(reparoRowFull).join('') || '<div class="empty">Nenhum registro de manutenção.</div>'}</div>
    `;
    return subNav + card('Novo Chamado de Manutenção e Reparo', repFormCardHtml) + `<div class="card">${repListaHtml}</div>`;
  }

  if (subTabSemana === 'resumos') {
    const tipoAtual = typeof resumoTipoAtual === 'string' ? resumoTipoAtual : 'dia';
    const iniSalva = typeof resumoDataIni === 'string' ? resumoDataIni : hoje;
    const fimSalva = typeof resumoDataFim === 'string' ? resumoDataFim : iniSalva;
    const resumo = coletarDadosResumoPeriodo(tipoAtual, iniSalva, fimSalva);
    const { dataIni, dataFim, iniBR, fimBR } = resumo.intervalo;
    const textoPadrao = gerarResumoOperacional(tipoAtual, dataIni, dataFim);
    const textoAtual = (typeof resumoTextoCustomizado === 'string') ? resumoTextoCustomizado : textoPadrao;

    const renderResumoItemRow = (item, isDone) => {
      const dataItem = typeof brFull === 'function' ? brFull(item.dia) : br(item.dia);
      return `
        <div class="resumo-item-row ${isDone ? 'is-done' : 'is-pending'}">
          <div class="resumo-item-top">
            <span class="resumo-item-date">${esc(dataItem)}</span>
            <span class="resumo-item-sep" aria-hidden="true">·</span>
            <span class="resumo-item-cat">${esc(item.categoria)}</span>
            <span class="resumo-item-sep" aria-hidden="true">·</span>
            <span class="resumo-item-title">${esc(item.titulo)}</span>
          </div>
          ${item.detalhes ? `<div class="resumo-item-sub">${esc(item.detalhes)}</div>` : ''}
          <div class="resumo-item-status ${isDone ? 'is-done' : 'is-pending'}">
            <span class="ui-glyph" aria-hidden="true">${isDone ? '✓' : '◷'}</span>
            <span>${esc(item.status)}</span>
          </div>
        </div>
      `;
    };

    const hojeAtual = typeof iso === 'function' ? iso(new Date()) : hoje;
    const ehHoje = (dataIni === hojeAtual && dataFim === hojeAtual);

    let cardResumos = `
      <div class="card">
        <h2>Central de Resumos por Período</h2>
        <div class="mu" style="margin-bottom:12px;">Informe a data inicial e a data final ou use o atalho Hoje para separar o que já foi concluído do que segue planejado ou pendente:</div>

        <div class="resumo-controls-bar">
          <div class="resumo-date-range">
            <label class="resumo-date-field" for="resumoDataIni">
              <span>Data Inicial</span>
              <input type="date" id="resumoDataIni" value="${esc(dataIni)}">
            </label>
            <label class="resumo-date-field" for="resumoDataFim">
              <span>Data Final</span>
              <input type="date" id="resumoDataFim" value="${esc(dataFim)}">
            </label>
            <button type="button" class="b ${ehHoje ? 'p' : ''} resumo-btn-hoje" data-act="copiar_resumo" data-tipo="dia" title="Preencher Data Inicial e Data Final com a data de hoje"><span class="ui-glyph" aria-hidden="true">☀\uFE0E</span> Hoje</button>
          </div>
        </div>

        <div class="resumo-kpi-strip" role="status" aria-live="polite">
          <span><b>Período:</b> ${esc(iniBR)} a ${esc(fimBR)}</span>
          <span class="resumo-kpi-sep" aria-hidden="true">|</span>
          <span class="resumo-kpi-done"><span class="ui-glyph" aria-hidden="true">✓</span> Concluídos: <b>${resumo.totalConcluidos}</b></span>
          <span class="resumo-kpi-sep" aria-hidden="true">|</span>
          <span class="resumo-kpi-pending"><span class="ui-glyph" aria-hidden="true">◷</span> Planejados/Pendentes: <b>${resumo.totalPlanejados}</b></span>
          <span class="resumo-kpi-sep" aria-hidden="true">|</span>
          <span>Total: <b>${resumo.totalGeral}</b></span>
        </div>

        <div class="resumo-split-grid">
          <section class="resumo-section-block is-done" aria-label="Realizado no período">
            <div class="resumo-section-head">
              <span class="ui-glyph resumo-section-ico is-done" aria-hidden="true">✓</span>
              <h3>REALIZADO NO PERÍODO (${resumo.totalConcluidos})</h3>
            </div>
            <div class="resumo-section-list">
              ${resumo.concluidos.length
                ? resumo.concluidos.map(it => renderResumoItemRow(it, true)).join('')
                : '<div class="empty resumo-empty">Nenhum item concluído neste período.</div>'}
            </div>
          </section>

          <section class="resumo-section-block is-pending" aria-label="Planejado ou pendente no período">
            <div class="resumo-section-head">
              <span class="ui-glyph resumo-section-ico is-pending" aria-hidden="true">◷</span>
              <h3>PLANEJADO / PENDENTE NO PERÍODO (${resumo.totalPlanejados})</h3>
            </div>
            <div class="resumo-section-list">
              ${resumo.planejados.length
                ? resumo.planejados.map(it => renderResumoItemRow(it, false)).join('')
                : '<div class="empty resumo-empty">Nenhum item planejado ou pendente neste período.</div>'}
            </div>
          </section>
        </div>

        <div class="resumo-editor-toolbar">
          <span class="mu" style="font-size:12px;"><span class="ui-glyph" aria-hidden="true">✎</span> <b>Texto para WhatsApp</b> (editável antes de copiar):</span>
          <div style="display:flex; gap:6px; flex-wrap:wrap;">
            <button type="button" class="b p" data-act="copiar_resumo_editado" style="font-size:12px; padding:5px 12px;" title="Copiar resumo formatado para envio no WhatsApp"><span class="ui-glyph" aria-hidden="true">≡</span> Copiar Resumo (WhatsApp)</button>
            <button type="button" class="b" data-act="baixar_planilha_resumo" style="font-size:12px; padding:5px 11px;" title="Gerar planilha Excel (.xlsx) formatada do período selecionado"><span class="ui-glyph" aria-hidden="true">⇩</span> Exportar Planilha (.xlsx)</button>
            <button type="button" class="b" data-act="restaurar_resumo_original" style="font-size:12px; padding:5px 10px;" title="Recarregar o modelo padrão"><span class="ui-glyph" aria-hidden="true">↻</span> Restaurar original</button>
          </div>
        </div>
        <div id="campoResumoEditavel" 
             contenteditable="true" 
             spellcheck="false" 
             role="textbox" 
             aria-multiline="true" 
             data-placeholder="Digite ou edite o resumo operacional aqui..." 
             style="background:var(--bg); border:1.5px solid var(--bd); border-radius:8px; padding:12px; font-family:monospace; font-size:12.5px; white-space:pre-wrap; line-height:1.5; color:var(--tx); min-height:200px; max-height:380px; overflow-y:auto; cursor:text; outline:none; transition:border-color 0.15s ease, box-shadow 0.15s ease;">${esc(textoAtual)}</div>
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
              <button class="b" data-act="limpar_imagens_conv" style="font-size:12px; padding:5px 12px;"><span class="ui-glyph" aria-hidden="true">✕</span> Limpar lista</button>
              <button class="b p" data-act="exec_converter_img"><span class="ui-glyph" aria-hidden="true">⇩</span> Descarregar PDF (${qtd} pág${qtd > 1 ? 's' : ''})</button>
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
        <h2>Conversor de Imagens para PDF</h2>
        <div class="mu" style="margin-bottom:14px;">Arraste ou escolha uma ou várias imagens para compilar um único documento PDF com pré-visualização instantânea:</div>

        <div id="dropzoneImagens" class="dropzone-box" data-act="trigger_input_img">
          <input type="file" id="inputImagensPdf" accept="image/png, image/jpeg, image/jpg" multiple style="display:none;">
          <div class="dropzone-icon ui-glyph" aria-hidden="true">⇧</div>
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

  const a = mon(wk), b = addD(a, 6);
  const termosBuscaDocs = typeof getBuscaTermos === 'function' ? getBuscaTermos() : [];
  const G = groups(a, b).filter(g => {
    if (!termosBuscaDocs.length) return true;
    const aulasCorpus = g.aulas.map(au => `${au.turma} ${au.hora} ${au.desc}`).join(' ');
    const profCorpus = typeof expandirCorpusProfessor === 'function' ? expandirCorpusProfessor(g.prof) : (g.prof || '');
    return matchBusca(`${profCorpus} ${br(g.dia)} ${wd(g.dia)} ${aulasCorpus}`, termosBuscaDocs);
  });
  let body = '', last = '';
  G.forEach(g => { 
    if (g.dia !== last) { body += `<div class="hd">${wd(g.dia)} ${br(g.dia)}</div>`; last = g.dia; } 
    body += docRow(g); 
  });

  let wkHtml = `
    <div class="week-nav-bar">
      <button class="b nav-arrow-btn nav-prev" data-act="wk" data-d="-1" title="Semana anterior">
        ${typeof icoSeta === 'function' ? icoSeta('left', 15) : '&larr;'}
        <span>Semana anterior</span>
      </button>
      <div class="week-nav-label">
        <b>${br(a)} a ${br(b)}</b>
        ${wk === 0 ? '<span class="pill b" style="font-size:10.5px; padding:2px 8px;">Semana atual</span>' : ''}
      </div>
      <button class="b nav-arrow-btn nav-next" data-act="wk" data-d="1" title="Próxima semana">
        <span>Próxima semana</span>
        ${typeof icoSeta === 'function' ? icoSeta('right', 15) : '&rarr;'}
      </button>
    </div>
  `;

  return subNav + 
         card('', wkHtml) + 
         card('Recibos Docentes (1 por professor/dia)', body || '<div class="empty">Sem aulas agendadas para esta semana.</div>', G.filter(g => !docDone(g)).length);
}

if (typeof PriusBus !== 'undefined') {
  PriusBus.register('operacional', ['core', 'orcamento']);
}
