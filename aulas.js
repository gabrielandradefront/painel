/* ========================================================
   AULAS.JS - GESTÃO DE TURMAS, CRONOGRAMAS E MATERIAIS
   Painel Operacional Prius
======================================================== */

const KEYS = { 
  prof: /prof|docente|instrutor/, 
  turma: /turma|curso|grupo/, 
  dia: /^(data|dia)(?!.*semana)/, 
  hora: /hora|horario/, 
  desc: /descri|disciplina|tema|assunto|conteudo|materia/ 
};

function pDia(v) {
  if (v == null || v === '') return null;
  const s = String(v).trim();
  let m = s.match(/(\d{4})-(\d{2})-(\d{2})/); if (m) return m[0];
  m = s.match(/(\d{1,2})[\/.-](\d{1,2})(?:[\/.-](\d{2,4}))?/); if (!m) return null;
  const d = +m[1], mo = +m[2]; if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const y = m[3] ? (m[3].length === 2 ? 2000 + +m[3] : +m[3]) : new Date().getFullYear();
  return `${y}-${pad(mo)}-${pad(d)}`;
}

const MESES = { janeiro: 1, fevereiro: 2, marco: 3, abril: 4, maio: 5, junho: 6, julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12 };
const DIAS = { domingo: 0, segunda: 1, terca: 2, quarta: 3, quinta: 4, sexta: 5, sabado: 6 };
const DNOME = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
const WKRE = /^(domingo|segunda|terca|quarta|quinta|sexta|sabado)s?[\s-]*(feira)?s?-?$/;
const TMRE = /^(\d{1,2})(?::(\d{2}))?\s*h?\s*(?:-|–|as|a)\s*(\d{1,2})(?::(\d{2}))?\s*h?$/;
const TTRE = /(domingo|segunda|terca|quarta|quinta|sexta|sabado)[^0-9]{0,20}(\d{1,2})(?::(\d{2}))?\s*h?\s*(?:-|–|as|a)\s*(\d{1,2})(?::(\d{2}))?\s*h?/g;
const hh = (h, m) => pad(+h) + ':' + (m || '00');
const nHora = (a, am, b, bm) => hh(a, am) + '-' + hh(b, bm);
const turmaDoNome = f => f.replace(/\.pdf$/i, '').replace(/^\d{1,2}-\d{1,2}-\d{4}_/, '').replace(/(cronograma|docx|oficial|alunos|prius|20\d\d)/gi, ' ').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim() || f;

async function pdfItems(buf) {
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise, P = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const tc = await (await pdf.getPage(p)).getTextContent();
    P.push(tc.items.filter(i => i.str.trim()).map(i => ({ s: i.str, x: i.transform[4], y: i.transform[5], w: i.width })));
  }
  return P;
}

function matFromItems(P) {
  const M = [];
  for (const its of P) {
    const lines = [];
    for (const it of its) {
      const L = lines.find(l => Math.abs(l.y - it.y) < 3);
      L ? L.it.push(it) : lines.push({ y: it.y, it: [it] });
    }
    lines.sort((b, a) => a.y - b.y);
    for (const l of lines) {
      l.it.sort((a, b) => a.x - b.x);
      const row = [], xs = [];
      let c = '', end = null, x0 = 0;
      for (const it of l.it) {
        if (end === null) x0 = it.x;
        else if (it.x - end > 8) { row.push(c.trim()); xs.push(x0); c = ''; x0 = it.x; }
        else if (it.x - end > 1) c += ' ';
        c += it.s; end = it.x + it.w;
      }
      row.push(c.trim()); xs.push(x0); row.xs = xs; M.push(row);
    }
  }
  return M;
}

function tokensOf(its) {
  const T = [];
  for (const i of its) {
    const s = i.s.trim(); if (!s) continue;
    const p = T[T.length - 1], x0 = i.x, end = i.x + i.w;
    if (p && Math.abs(p.y - i.y) < 1.5 && x0 - p.end > -2 && x0 - p.end < 8) {
      p.s += (x0 - p.end > 1.2 ? ' ' : '') + s; p.end = end;
    } else {
      T.push({ s, y: i.y, x0, end });
    }
  }
  T.forEach(t => { t.n = norm(t.s); t.c = (t.x0 + t.end) / 2; });
  return T;
}

function kind(t) {
  const s = t.s, n = t.n;
  if (/^[- _*.\s]+$/.test(s) || /^-?feira$/.test(n) || !s) return 'junk';
  if (MESES[n]) return 'mes';
  let m = s.match(/^(\d{1,2})[\/.-](\d{1,2})(?:[\/.-](\d{2,4}))?$/);
  if (m) { t.d = +m[1]; t.m = +m[2]; t.y4 = m[3] ? (m[3].length === 2 ? 2000 + +m[3] : +m[3]) : 0; return 'data'; }
  if (/^\d{1,2}$/.test(s) && +s >= 1 && +s <= 31) { t.d = +s; t.m = 0; t.y4 = 0; return 'data'; }
  if (WKRE.test(n)) return 'wk';
  m = n.match(TMRE); if (m) { t.h = nHora(m[1], m[2], m[3], m[4]); return 'hora'; }
  if (/^(obs|carga hor|auloes)/.test(n) || /^\*\s*(a aula|\d)/.test(n)) return 'fim';
  if (/^(data|mes|dia da|semana|horario|horar|io|conteudo|professor)$/.test(n)) return 'hdr';
  return 'txt';
}

function limiar(T) {
  const cc = T.find(t => t.n === 'conteudo'), pp = T.find(t => t.n === 'professor');
  if (cc && pp) return (cc.c + pp.c) / 2;
  const ds = T.filter(t => t.k === 'data');
  if (!ds.length) return Infinity;
  const dx0 = Math.min(...ds.map(t => t.x0)) - 5;
  const cs = T.filter(t => t.k === 'txt' && t.x0 >= dx0 && ds.some(d => Math.abs(d.y - t.y) <= 14)).map(t => t.c);
  if (cs.length < 2) return Infinity;
  let a = Math.min(...cs), b = Math.max(...cs); if (b - a < 40) return Infinity;
  for (let i = 0; i < 12; i++) {
    const A = cs.filter(c => Math.abs(c - a) <= Math.abs(c - b));
    const B = cs.filter(c => Math.abs(c - a) > Math.abs(c - b));
    if (!A.length || !B.length) break;
    a = A.reduce((x, y) => x + y) / A.length; b = B.reduce((x, y) => x + y) / B.length;
  }
  return (a + b) / 2;
}

function parsePdf(P, def, fname) {
  const pages = P.map(tokensOf); pages.forEach(T => T.forEach(t => t.k = kind(t)));
  let Y = (fname.match(/20\d\d/) || [])[0];
  if (!Y) {
    const m = pages.flat().map(t => t.s).join(' ').match(/\b(20\d\d)\b/);
    Y = m ? m[1] : new Date().getFullYear();
  }
  Y = +Y;
  const first = pages[0] || [];
  const ti = first.findIndex(t => t.k === 'data' || t.k === 'mes');
  const tmap = {};
  (ti < 0 ? first : first.slice(0, ti)).forEach(t => {
    for (const m of t.n.matchAll(TTRE)) tmap[DIAS[m[1]]] = nHora(m[2], m[3], m[4], m[5]);
  });
  
  const rows = []; let skip = 0, sem = 0, avs = 0, month = 0, cur = null, rec = null, aberto = false;
  const nova = c => ({ d: c.d, m: c.m, y4: c.y4, w: null, h: '', cont: [], prof: [] });
  
  const flush = () => {
    if (!rec) return; const r = rec; rec = null;
    const conteudo = r.cont.join(' ').replace(/\s+/g, ' ').trim();
    const pt = r.prof.map(p => p.replace(/^(profa?|dra?)\.?\s+/i, '').trim()).filter(Boolean);
    const prof = pt.length > 1 && pt.every(p => p.split(/\s+/).length >= 2) ? pt.join(' / ') : pt.join(' ');
    
    if (/nao havera aula|semana santa|sem aula|feriado|recesso/.test(norm(conteudo + ' ' + prof)) || norm(prof) === 'nha') { sem++; return; }
    if (!conteudo && !prof && !r.h) return;
    
    const m = r.m || month;
    const dt = new Date(r.y4 || Y, m - 1, r.d);
    if (!m || dt.getMonth() !== m - 1 || dt.getDate() !== r.d) { skip++; return; }
    
    const dia = iso(dt), w = dt.getDay();
    let hora = r.h || '';
    if (!hora) { const x = conteudo.match(/\((\d{1,2})\s*-\s*(\d{1,2})\s*h/i); if (x) hora = nHora(x[1], '', x[2], ''); }
    if (!hora && tmap[w]) hora = tmap[w];
    
    let aviso = ''; const esp = Object.keys(tmap);
    if (r.w != null && r.w !== w) aviso = `cronograma diz ${DNOME[r.w]}, mas ${br(dia)} é ${DNOME[w]}`;
    else if (r.w == null && esp.length && !(w in tmap)) aviso = `${br(dia)} é ${DNOME[w]} (esperado: ${esp.map(k => DNOME[k]).join(', ')})`;
    
    if (aviso) avs++;
    rows.push({ prof, turma: def || 'Sem turma', dia, hora, desc: conteudo, aviso });
  };
  
  for (const T of pages) {
    const lim = limiar(T);
    const dxs = T.filter(t => t.k === 'data'), dx0 = dxs.length ? Math.min(...dxs.map(t => t.x0)) - 5 : -Infinity;
    for (const t of T) {
      if (t.k === 'mes') { flush(); month = MESES[t.n]; aberto = true; }
      else if (t.k === 'data') { flush(); cur = { d: t.d, m: t.m || month, y4: t.y4 }; rec = nova(cur); aberto = true; }
      else if (t.k === 'fim') { flush(); aberto = false; }
      else if (!aberto || !rec) continue;
      else if (t.k === 'wk') {
        if (rec.w != null || rec.h || rec.cont.length || rec.prof.length) { flush(); rec = nova(cur); }
        rec.w = DIAS[(t.n.match(/^[a-z]+/) || [''])[0]];
      }
      else if (t.k === 'hora') {
        if (rec.h) { flush(); rec = nova(cur); }
        rec.h = t.h;
      }
      else if (t.k === 'txt') {
        if (t.x0 < dx0) continue;
        (t.c >= lim ? rec.prof : rec.cont).push(t.s);
      }
    }
  }
  flush();
  const faltam = ['prof', 'hora', 'desc'].filter(k => rows.length && rows.every(r => !r[k]));
  const info = [sem ? `${sem} feriado(s) ignorado(s)` : '', avs ? `${avs} avisos de data` : ''].filter(Boolean).join(' • ');
  return rows.length ? { rows, skip, modo: 'pdf', faltam, info } : null;
}

function startPdf(P, def, fname) {
  const res = parsePdf(P, def, fname);
  if (res) {
    msg = ''; pend = { nome: fname, rows: res.rows, skip: res.skip, modo: res.modo, faltam: res.faltam, extra: res.info };
    iniciarDest(); montar(); return render();
  }
  start(matFromItems(P), fname, def);
}

function splitText(t) {
  const L = t.split(/\r?\n/).filter(l => l.trim());
  const h = L.slice(0, 5).join('\n');
  const d = h.split('\t').length > 1 ? '\t' : (h.split(';').length > h.split(',').length ? ';' : ',');
  return L.map(l => l.split(d).map(s => s.trim()));
}

function parseTab(M, def) {
  let hi = -1, map = {};
  for (let i = 0; i < Math.min(M.length, 30); i++) {
    const m = {};
    (M[i] || []).forEach((c, j) => {
      const n = norm(c);
      if (!n) return;
      for (const k in KEYS) {
        if (m[k] == null && KEYS[k].test(n)) { m[k] = j; break; }
      }
    });
    if (m.dia != null && Object.keys(m).length >= 2) { hi = i; map = m; break; }
  }
  if (hi < 0) return null;
  const H = M[hi], rows = []; let skip = 0;
  for (let r of M.slice(hi + 1)) {
    if (!r || r.every(c => c === '' || c == null)) continue;
    if (r.xs && H.xs && r.length !== H.length) {
      const n = H.map(() => '');
      r.forEach((c, j) => {
        let b = 0;
        H.xs.forEach((x, k) => { if (Math.abs(x - r.xs[j]) < Math.abs(H.xs[b] - r.xs[j])) b = k; });
        n[b] = (n[b] ? n[b] + ' ' : '') + c;
      });
      r = n;
    }
    const dia = pDia(r[map.dia]); if (!dia) { skip++; continue; }
    const g = k => map[k] == null ? '' : String(r[map[k]] ?? '').trim();
    rows.push({ prof: g('prof'), turma: g('turma') || def || 'Sem turma', dia, hora: g('hora'), desc: g('desc') });
  }
  return { rows, skip, modo: 'tabela', faltam: ['prof', 'hora', 'desc'].filter(k => map[k] == null) };
}

function parseDatas(M, def) {
  const re = /(?<![\d:])(\d{1,2})[\/.](\d{1,2})(?:[\/.](\d{4}|\d{2}))?(?![\d:])/g;
  const tre = /\d{1,2}[:h]\d{2}(?:\s*(?:-| às|a)\s*\d{1,2}[:h]\d{2})?/;
  const seen = new Set(), rows = [];
  for (const r of M) {
    const txt = r.join(' '), hm = txt.match(tre), hora = hm ? hm[0].replace(/\s+/g, ' ').trim() : '';
    for (const m of txt.matchAll(re)) {
      const dia = pDia(m[0]); if (!dia) continue;
      const k = dia + '|' + hora; if (seen.has(k)) continue; seen.add(k);
      rows.push({ prof: '', turma: def || 'Sem turma', dia, hora, desc: '' });
    }
  }
  return rows.length ? { rows, skip: 0, modo: 'datas', faltam: ['prof', 'desc'].concat(rows.some(r => r.hora) ? [] : ['hora']) } : null;
}

function parse(M, def) {
  const t = parseTab(M, def);
  return t && t.rows.length ? t : parseDatas(M, def);
}

const evTxt = a => `${a.prof || '—'} | ${wd(a.dia)} ${br(a.dia)}${a.hora ? ' às ' + a.hora : ''} | ${a.turma}${a.desc ? ' | ' + a.desc : ''}`;

function diff(rows, todas) {
  const used = new Set(), out = [];
  for (const r of rows) {
    const e = S.aulas.find(a => !used.has(a.id) && norm(a.turma) === norm(r.turma) && a.dia === r.dia && (!r.hora || !a.hora || a.hora === r.hora || (r.prof && norm(a.prof) === norm(r.prof))));
    if (e) {
      used.add(e.id);
      const ch = (r.prof && e.prof !== r.prof) || (r.hora && e.hora !== r.hora) || (r.desc && (e.desc || '') !== r.desc);
      out.push({ ...r, tipo: ch ? 'alterada' : 'igual', id: e.id, antes: ch ? evTxt(e) : '' });
    } else {
      out.push({ ...r, tipo: 'nova' });
    }
  }
  const turmas = new Set(rows.map(r => norm(r.turma)));
  const ds = rows.map(r => r.dia).sort();
  const lo = ds[0] > hoje ? ds[0] : hoje;
  const hi = ds[ds.length - 1];
  
  S.aulas.forEach(a => {
    if (!used.has(a.id) && turmas.has(norm(a.turma)) && (todas || (a.dia >= lo && a.dia <= hi))) {
      out.push({ ...a, tipo: 'removida' });
    }
  });
  return out;
}

function start(M, nome, def) {
  const res = parse(M, def);
  if (!res || !res.rows.length) {
    msg = 'Não li datas neste ficheiro.';
    prev = null;
    return render();
  }
  msg = '';
  pend = { nome, rows: res.rows, skip: res.skip, modo: res.modo, faltam: res.faltam || [], extra: '' };
  iniciarDest();
  montar();
  render();
}

function aplicar() {
  if (!prev) return;
  const n = { n: 0, a: 0, r: 0 };
  const agora = new Date().toISOString();
  for (const r of prev.rows) {
    if (r.x) continue;
    if (r.tipo === 'nova') {
      S.aulas.push({ id: uid(), prof: r.prof, turma: r.turma, dia: r.dia, hora: r.hora, desc: r.desc, confirmada: false, destaque: 'nova', modificadoEm: agora });
      n.n++;
    } else if (r.tipo === 'alterada') {
      const e = find('aulas', r.id);
      if (e) {
        if (['prof', 'hora'].some(k => r[k] && e[k] && e[k] !== r[k])) e.confirmada = false;
        ['prof', 'hora', 'desc'].forEach(k => { if (r[k]) e[k] = r[k]; });
        e.destaque = 'alterada';
        e.modificadoEm = agora;
        n.a++;
      }
    } else if (r.tipo === 'removida' && prev.rem) {
      S.aulas = S.aulas.filter(x => x.id !== r.id);
      n.r++;
    }
  }
  S.hist.unshift({ nome: prev.nome, data: hoje, ...n });
  S.hist = S.hist.slice(0, 5);
  save();
  prev = null; pend = null; destPre = ''; msg = '';
  render();
  toast(`${n.n} novas, ${n.a} alt., ${n.r} removidas!`);
}

const PT = { nova: ['o', 'nova'], alterada: ['w', 'alterada'], removida: ['w', 'removida'] };

function uploadCard() {
  if (prev) {
    const c = t => prev.rows.filter(r => r.tipo === t && !r.x).length;
    let listHTML = prev.rows.map((r, ix) => ({ r, ix })).filter(o => o.r.tipo !== 'igual').map(({ r, ix }) => {
      return `
        <div class="row ${r.x ? 'done' : ''}">
          <span class="pill ${PT[r.tipo][0]}">${PT[r.tipo][1]}</span>
          <div class="t">
            <b>${esc(r.turma)}</b>
            <span class="mu">${wd(r.dia)} ${br(r.dia)} ${esc(r.hora)}</span>
          </div>
          <button class="b" data-act="pvx" data-i="${ix}">${r.x ? 'Incluir' : 'Ignorar'}</button>
        </div>
      `;
    }).join('');
    
    if (!listHTML) listHTML = '<div class="empty">Sem alterações.</div>';

    let html = `<div class="mu">${c('nova')} novas • ${c('alterada')} alteradas • ${c('removida')} removidas</div>`;
    html += destSel();
    if (prev.rows.some(r => r.tipo === 'removida')) {
      html += `<label class="mu" style="display:block;margin-top:6px"><input type="checkbox" id="rem" ${prev.rem ? 'checked' : ''}> Remover antigas</label>`;
    }
    html += `<div style="max-height:360px;overflow:auto;margin:8px 0">${listHTML}</div>`;
    html += `<button class="b p" data-act="imp">Importar</button> <button class="b" data-act="canc">Cancelar</button>`;
    return card('Conferir antes de importar', html);
  }
  
  const modoNav = `
    <div class="fx" style="gap:6px; margin-bottom:12px;">
      <button class="b ${modoEntradaCronograma === 'pdf' ? 'p' : ''}" data-act="set_modo_crono" data-m="pdf">📄 Arquivo PDF</button>
      <button class="b ${modoEntradaCronograma === 'texto' ? 'p' : ''}" data-act="set_modo_crono" data-m="texto">📋 Colar Texto</button>
      <button class="b ${modoEntradaCronograma === 'novo' ? 'p' : ''}" data-act="set_modo_crono" data-m="novo">➕ Novo Cronograma</button>
    </div>
  `;

  if (modoEntradaCronograma === 'pdf') {
    let body = `
      <div class="mu" style="margin-bottom:8px">Envie o PDF do cronograma oficial para importar ou atualizar aulas automaticamente:</div>
      <div class="fx">
        <input id="turmaPad" placeholder="Nome da turma padrão (opcional)" value="${esc(turmaPad)}" style="flex:2 1 200px">
        <input id="file" type="file" accept=".pdf,application/pdf" style="flex:3 1 240px">
      </div>
    `;
    return card('Entrada de Cronogramas', modoNav + body);
  }

  if (modoEntradaCronograma === 'texto') {
    let body = `
      <div class="mu" style="margin-bottom:8px">Cole linhas de cronograma copiadas de tabelas ou mensagens:</div>
      <div class="fx" style="margin-bottom:8px;">
        <input id="turmaPad" placeholder="Nome da turma para estas aulas" value="${esc(turmaPad)}" style="flex:1 1 220px">
      </div>
      <textarea id="paste" style="width:100%; min-height:100px; margin-bottom:8px;" placeholder="Cole aqui o texto do cronograma..."></textarea>
      <button class="b p" data-act="lerpaste">Processar e Ler Texto</button>
    `;
    return card('Entrada de Cronogramas', modoNav + body);
  }

  const turmaAtiva = novaTurmaManualNome.trim();
  const aulasDaTurmaManual = turmaAtiva ? S.aulas.filter(a => norm(a.turma) === norm(turmaAtiva)) : [];
  aulasDaTurmaManual.sort((a, b) => (a.dia + a.hora).localeCompare(b.dia + b.hora));

  const nomesProfList = [...new Set(S.aulas.map(a => (a.prof || '').trim()).filter(Boolean))].sort();

  let bodyNovo = `
    <div class="mu" style="margin-bottom:10px">Defina a nova turma e adicione aula por aula com todos os campos necessários:</div>
    
    <div class="fx" style="align-items:center; margin-bottom:12px; background:var(--bg); padding:8px 10px; border-radius:8px; border:1px solid var(--bd);">
      <span style="font-weight:600; white-space:nowrap;">Turma Atual:</span>
      <input id="campoNovaTurmaManual" placeholder="Digite o nome da nova turma (ex: RED ENF 2026)" value="${esc(novaTurmaManualNome)}" style="flex:2 1 220px; font-weight:600;">
      ${turmaAtiva ? `<button class="b" data-act="limpar_turma_manual" style="font-size:12px;">Trocar Turma</button>` : ''}
    </div>

    ${turmaAtiva ? `
      <datalist id="listaProfsManual">${nomesProfList.map(n => `<option value="${esc(n)}">`).join('')}</datalist>
      <form data-form="aula_manual_nova">
        <input name="prof" list="listaProfsManual" placeholder="Professor (Obrigatório)" required style="flex:2 1 180px">
        <input name="dia" type="date" value="${amanha}" required style="flex:1 1 130px" title="Data da Aula (Obrigatório)">
        <input name="hora" type="time" required style="flex:1 1 110px" title="Horário (Obrigatório)">
        <input name="desc" placeholder="Disciplina / Conteúdo (Opcional)" style="flex:3 1 220px">
        <button class="b p" style="white-space:nowrap;">➕ Inserir Aula</button>
      </form>

      <div style="margin-top:14px;">
        <b>Aulas cadastradas nesta turma (${aulasDaTurmaManual.length}):</b>
        <div style="max-height:200px; overflow-y:auto; border:1px solid var(--bd); border-radius:8px; padding:6px; margin-top:6px;">
          ${aulasDaTurmaManual.map(a => `
            <div class="row" style="padding:6px 8px; font-size:13px;">
              <div class="t">
                <b>${esc(a.prof)} — ${wd(a.dia)} ${br(a.dia)} às ${esc(a.hora)}</b>
                ${a.desc ? `<span class="mu">${esc(a.desc)}</span>` : ''}
              </div>
              <button class="b danger" data-act="del_aula" data-id="${a.id}" style="font-size:11px; padding:2px 8px;">Excluir</button>
            </div>
          `).join('') || '<div class="empty">Nenhuma aula inserida para esta turma ainda. Preencha os campos acima para começar!</div>'}
        </div>
      </div>
    ` : `<div class="empty" style="padding:14px 0;">Digite o nome da turma acima para liberar a inserção das aulas.</div>`}
  `;

  return card('Entrada de Cronogramas', modoNav + bodyNovo);
}

const turmasExist = () => [...new Set(S.aulas.map(a => a.turma).filter(Boolean))];
const uniq = n => { const ex = turmasExist().map(norm); let t = n, i = 2; while (ex.includes(norm(t))) t = `${n} (${i++})`; return t; };
function iniciarDest() { const ts = [...new Set(pend.rows.map(r => r.turma))], ex = turmasExist(), m = ts.length === 1 && ex.find(t => norm(t) === norm(ts[0])); dest = destPre && ex.includes(destPre) ? destPre : (m || 'novo'); nomeNovo = ts[0] || ''; prev = null; }
function montar() {
  const ts = [...new Set(pend.rows.map(r => r.turma))], unico = ts.length === 1, rows = pend.rows.map(r => ({ ...r })); let sub;
  if (unico) { sub = dest !== 'novo'; if (!sub) nomeNovo = uniq((nomeNovo || '').trim() || ts[0]); const nome = sub ? dest : nomeNovo; rows.forEach(r => r.turma = nome); }
  const out = unico && !sub ? rows.map(r => ({ ...r, tipo: 'nova' })) : diff(rows, sub);
  prev = { nome: pend.nome, rows: out, skip: pend.skip, modo: pend.modo, faltam: pend.faltam, extra: pend.extra, sub };
}
function destSel() {
  if (typeof prev.sub !== 'boolean') return ''; const ex = turmasExist();
  return `<div class="fx" style="margin:8px 0 0"><select id="dest" style="flex:2 1 240px"><option value="novo" ${dest === 'novo' ? 'selected' : ''}>Adicionar como novo cronograma</option>${ex.map(t => `<option value="${esc(t)}" ${dest === t ? 'selected' : ''}>Substituir: ${esc(t)}</option>`).join('')}</select>${dest === 'novo' ? `<input id="nomeNovo" style="flex:2 1 200px" placeholder="Nome do cronograma" value="${esc(nomeNovo)}">` : ''}</div>`;
}
function cronoCard() {
  const ex = turmasExist(); if (!ex.length) return '';
  return card('Cronogramas Cadastrados', ex.map(t => { const L = S.aulas.filter(a => a.turma === t).map(a => a.dia).sort(); return `<div class="row"><div class="t"><b>${esc(t)}</b><span class="mu">${L.length} aulas cadastradas</span></div><button class="b ${destPre === t ? 'p' : ''}" data-act="crsub" data-t="${esc(t)}">${destPre === t ? 'Substituindo...' : 'Substituir'}</button><button class="b" data-act="crdel" data-t="${esc(t)}">Apagar</button></div>`; }).join(''));
}

const aulaRow = a => {
  const bdg = (!a.confirmada && a.destaque) ? `<span class="pill ${a.destaque === 'nova' ? 'o' : 'w'}" style="margin-left:6px">${a.destaque.toUpperCase()}</span>` : '';
  return `
    <div class="row ${a.confirmada ? 'done' : ''}">
      <input type="checkbox" data-act="tog" data-l="aulas" data-id="${a.id}" data-f="confirmada" ${a.confirmada ? 'checked' : ''} title="Confirmar aula">
      <div class="t">
        <b>${esc(a.prof || 'Sem professor')} — ${esc(a.turma)} ${bdg}</b>
        <span class="mu">${wd(a.dia)} ${br(a.dia)}${a.hora ? ' às ' + esc(a.hora) : ''}${a.desc ? ' — ' + esc(a.desc) : ''}</span>
      </div>
    </div>
  `;
};

// Card de Fila de Envio de Materiais (Slides)
function cardFilaMateriais() {
  const turmasDisponiveis = [...new Set(S.aulas.map(a => a.turma).filter(Boolean))].sort();
  const fila = S.filaMateriais || [];

  let itensHtml = fila.map((item, idx) => `
    <div class="row">
      <div class="t">
        <b>${esc(item.turma)}</b>
        <span class="mu" style="word-break: break-all;">${esc(item.caminho)}</span>
      </div>
      <button class="b danger" data-act="del_fila" data-i="${idx}">Remover</button>
    </div>
  `).join('') || '<div class="empty">Nenhum material adicionado à fila hoje.</div>';

  let textoConsolidado = fila.map(item => `${item.turma}\n${item.caminho}`).join('\n\n');
  let linkWhatsApp = `https://wa.me/?text=${encodeURIComponent(textoConsolidado)}`;

  let body = `
    <div class="mu" style="margin-bottom:8px">Adicione os materiais conforme for salvando no servidor. No fim, copie ou envie tudo de uma vez.</div>
    <form data-form="fila_material">
      <select name="turma" required style="flex:2 1 200px">
        <option value="">Selecione a turma...</option>
        ${turmasDisponiveis.map(t => `<option value="${esc(t)}">${esc(t)}</option>`).join('')}
      </select>
      <input name="caminho" placeholder="Cole o caminho do servidor (ex: Z:\\...)" required style="flex:3 1 250px">
      <button class="b p">Adicionar à Fila</button>
    </form>
    <div style="margin: 12px 0;">
      <b>Materiais na fila (${fila.length}):</b>
      <div style="max-height:220px; overflow:auto; border:1px solid var(--bd); border-radius:8px; padding: 6px; margin-top:4px;">
        ${itensHtml}
      </div>
    </div>
  `;

  if (fila.length > 0) {
    body += `
      <div class="fx" style="margin-top:10px;">
        <button class="b p" data-act="copiar_fila">📋 Copiar Mensagem Pronta</button>
        <a href="${linkWhatsApp}" target="_blank" class="b p" style="text-decoration:none; display:inline-flex; align-items:center; background:#25d366; border-color:#25d366; color:#fff;">🚀 Enviar no WhatsApp</a>
        <button class="b danger" data-act="limpar_fila">Limpar Fila</button>
      </div>
    `;
  }

  return card('📦 Fila de Envio de Materiais (Slides)', body);
}

// Renderizador da Aba Aulas
function viewAulas() {
  const subNav = `
    <div class="fx" style="gap:6px; margin-bottom:12px;">
      <button class="b ${subTabAulas === 'quadro' ? 'p' : ''}" data-act="sub_aulas" data-v="quadro">📋 Quadro e Gestão</button>
      <button class="b ${subTabAulas === 'import' ? 'p' : ''}" data-act="sub_aulas" data-v="import">📥 Cronogramas e Materiais</button>
    </div>
  `;

  if (subTabAulas === 'import') {
    return subNav + uploadCard() + cronoCard() + cardFilaMateriais();
  }

  // Se houver termo de busca, pesquisa em TODAS as aulas (passadas e futuras) com suporte a múltiplas palavras e datas brasileiras
  const termosBusca = norm(buscaAulas).split(/\s+/).filter(Boolean);
  
  let l = S.aulas.filter(a => {
    if (!termosBusca.length) return showPast || a.dia >= hoje;
    
    const diaBr = br(a.dia); // ex: 31/10
    const diaBrAno = a.dia ? a.dia.split('-').reverse().join('/') : ''; // ex: 31/10/2026
    const diaSemana = wd(a.dia); // ex: seg, ter, sáb
    const textoCorpus = `${norm(a.prof)} ${norm(a.turma)} ${norm(a.desc)} ${a.dia} ${diaBr} ${diaBrAno} ${diaSemana} ${norm(a.hora)}`;
    
    return termosBusca.every(t => textoCorpus.includes(t));
  });

  l.sort((a, b) => (a.dia + a.hora).localeCompare(b.dia + b.hora));
  
  const temDestaques = S.aulas.some(a => a.destaque);

  const aulaEdit = a => {
    const semProf = !a.prof || a.prof.trim() === '' || norm(a.prof) === norm('(sem professor)');
    const f = (k, ph) => `<input class="obs ${a[k] ? '' : 'miss'}" style="margin:0; width:100%;" data-act="ae" data-id="${a.id}" data-f="${k}" placeholder="${ph}" value="${esc(a[k])}" title="${ph}">`;
    const bdg = (!a.confirmada && a.destaque) ? `<span class="pill ${a.destaque === 'nova' ? 'o' : 'w'}" style="margin-left:6px">${a.destaque.toUpperCase()}</span>` : '';
    const alertSemProf = semProf ? `<span class="pill w" style="margin-left:6px; font-size:11px;">⚠️ Definir Professor</span>` : '';

    return `
      <div class="row ${a.confirmada ? 'done' : ''} ${semProf ? 'sem-docente' : ''}" style="align-items:flex-start;">
        <input type="checkbox" data-act="tog" data-l="aulas" data-id="${a.id}" data-f="confirmada" ${a.confirmada ? 'checked' : ''} style="margin-top:4px" title="Confirmar aula">
        <div class="t" style="flex:1 1 260px">
          <b>${wd(a.dia)} ${br(a.dia)} ${bdg} ${alertSemProf}</b>
          <div class="aula-grid-inputs">
            ${f('prof', 'Docente / Professor')}
            ${f('turma', 'Turma')}
            ${f('hora', 'Horário')}
            ${f('desc', 'Descrição / Conteúdo')}
          </div>
        </div>
        <button class="b" data-act="del_aula" data-id="${a.id}">Excluir</button>
      </div>
    `;
  };

 let searchHtml = `
    <div class="fx" style="align-items:center;">
      <input id="buscaAulas" type="search" placeholder="Pesquisar por prof, turma, data (ex: 31/10), horário..." value="${esc(buscaAulas)}" style="flex:2 1 240px;" autocomplete="off">
      <button class="b" data-act="past">${showPast ? 'Ocultar passadas' : 'Mostrar passadas'}</button>
      ${buscaAulas.trim() ? `<button class="b" data-act="limpar_busca_aulas">Limpar filtro</button>` : ''}
      ${temDestaques ? '<button class="b" data-act="limparDestaques">Limpar avisos</button>' : ''}
    </div>
    <div id="listaAulas">${l.map(aulaEdit).join('') || '<div class="empty">Nenhuma aula encontrada para esta pesquisa.</div>'}</div>
  `;

  return subNav + 
         card('Nova aula avulsa', `<form data-form="aula"><input name="prof" placeholder="Professor" required><input name="turma" placeholder="Turma" required><input name="dia" type="date" value="${amanha}" required><input name="hora" type="time" required><input name="desc" placeholder="Descrição"><button class="b p">Adicionar</button></form>`) + 
         card('Quadro Geral de Aulas', searchHtml);
}