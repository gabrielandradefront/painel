/* ========================================================
   CORE.JS - ESTADO GLOBAL, CALENDÁRIO E UTILITÁRIOS
   Painel Operacional Prius
======================================================== */

const KEY = 'prius-painel-v2';
const pad = n => String(n).padStart(2, '0');
const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addD = (s, n) => {
  const d = new Date(s + 'T12:00');
  d.setDate(d.getDate() + n);
  return iso(d);
};
const hoje = iso(new Date());
const amanha = addD(hoje, 1);
const mon = o => {
  const d = new Date();
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + o * 7);
  return iso(d);
};

// Regra de prazo de entrega de materiais (slides)
function prazoEntregaMaterial(diaAula) {
  if (!diaAula) return '';
  const dt = new Date(diaAula + 'T12:00');
  const w = dt.getDay();
  if (w === 2) return addD(diaAula, -3); // Terça -> Sábado anterior
  if (w === 3) return addD(diaAula, -4); // Quarta -> Sábado anterior
  return addD(diaAula, -2);              // Demais dias -> 2 dias antes
}

// Regra de confirmação de aulas (terça-feira é confirmada no sábado anterior)
function dataConfirmacaoAula(diaAula) {
  if (!diaAula) return '';
  const dt = new Date(diaAula + 'T12:00');
  const w = dt.getDay();
  if (w === 2) return addD(diaAula, -3); // Terça -> Sábado anterior
  return addD(diaAula, -1);              // Demais dias -> 1 dia antes
}

// Locais fixos de manutenção
const LOCAIS_MANUTENCAO = [
  'Hall', 'Recepção', 'Copa', 'Copinha', 'Corredor', 
  'Nárnia', 'Banheiro', 'Coordenação', 'Sala 1', 
  'Sala 2', 'Sala 3', 'Almoxarife', 'Estúdio', 'Sala de descanso'
];

// Status de orçamento
const ORC_ST = [
  'Aguardando aprovação', 'Aprovado', 'Orçamento', 
  'Pedido feito', 'A caminho', 'Entregue', 
  'Conferido', 'Com problema'
];

// Abas principais
const TABS = [
  ['hoje', 'Hoje'],
  ['aulas', 'Aulas'],
  ['semana', 'Operações'],
  ['orc', 'Orçamento']
];

// Inicialização e recuperação de dados
let S = null;
try {
  let bruto = localStorage.getItem(KEY);
  if (!bruto) { 
    const v1 = localStorage.getItem('prius-painel-v1'); 
    if (v1) { 
      const o = JSON.parse(v1); 
      (o.compras || []).forEach(c => { 
        (o.orc = o.orc || { inst: 'Prius', titulo: '', solic: '', data: '', obs: '', itens: [] }).itens.push({ id: c.id, nome: c.item, qtd: c.qtd || '', forn: c.fornecedor || '', status: c.status, cat: '', un: '', preco: '' }); 
      }); 
      delete o.compras; bruto = JSON.stringify(o); 
    } 
  }
  S = JSON.parse(bruto);
  if (!S || typeof S !== 'object' || Array.isArray(S)) S = {};
} catch (e) {
  S = {};
}

['aulas', 'reparos', 'hist', 'orcHist', 'fornecedores', 'apelidos', 'filaMateriais', 'lembretes'].forEach(k => {
  if (!Array.isArray(S[k])) S[k] = [];
  S[k] = S[k].filter(item => item && typeof item === 'object');
});

S.docs = S.docs || {};
S.cat = S.cat || {};
S.meta = S.meta || {};
S.orc = S.orc || { inst: 'Prius', titulo: '', solic: '', data: hoje, obs: '', qtdTotal: '', itens: [] };

if (Array.isArray(S.orc.itens)) {
  S.orc.itens.forEach(i => {
    if (!i.status) i.status = 'Aguardando aprovação';
    if (i.status === 'Pedido') i.status = 'Pedido feito';
  });
}

S.reparos.forEach(r => {
  if (!r.status) r.status = r.feito ? 'Concluído' : 'Pendente';
  if (!r.dataReg) r.dataReg = hoje;
  if (r.status === 'Concluído' && !r.dataConc) r.dataConc = hoje;
  if (!r.local) r.local = '';
});

const save = () => {
  try {
    localStorage.setItem(KEY, JSON.stringify(S));
  } catch (e) {
    console.error('Falha ao salvar:', e);
    toast('⚠️ Falha ao salvar no navegador! Armazenamento indisponível.');
  }
};

// Funções utilitárias
const uid = () => Math.random().toString(36).slice(2, 9);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const br = d => (typeof d === 'string' && d.includes('-')) ? d.split('-').reverse().slice(0, 2).join('/') : (d || '');
const wd = d => {
  if (!d || typeof d !== 'string') return '';
  const dt = new Date(d + 'T12:00');
  return isNaN(dt) ? '' : dt.toLocaleDateString('pt-BR', { weekday: 'short' });
};
const norm = s => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
const find = (l, id) => (S[l] || []).find(x => x.id === id);

// Cálculo do consumo do localStorage
function getStorageUsage() {
  let bytes = 0;
  for (let k in localStorage) {
    if (Object.prototype.hasOwnProperty.call(localStorage, k)) {
      bytes += ((localStorage[k] || '').length + k.length) * 2;
    }
  }
  const kb = (bytes / 1024).toFixed(1);
  const maxKb = 5120;
  const pct = Math.min(100, (bytes / (5 * 1024 * 1024)) * 100).toFixed(1);
  return { bytes, kb, maxKb, pct: parseFloat(pct) };
}

// Helpers numéricos e financeiros
const brl = v => (+v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const num = v => {
  let s = String(v ?? '').replace(/[R$\s]/gi, '').trim();
  if (!s) return 0;
  if (s.includes(',')) s = s.split('.').join('').replace(',', '.');
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
};
const itemPrecoSemFrete = i => (i.precoSemFrete !== undefined && i.precoSemFrete !== '') ? num(i.precoSemFrete) : (i.preco ? num(i.preco) : 0);
const itemFrete = i => (i.frete !== undefined && i.frete !== '') ? num(i.frete) : 0;
const itemTotal = i => itemPrecoSemFrete(i) + itemFrete(i);

// Variáveis de controle de navegação e filtros
let tab = 'hoje';
let subTabAulas = 'quadro';
let subTabSemana = 'docs';
let orcSlideAtivo = 0; // 0 = Slide 1 (Dados e Tabela), 1 = Slide 2 (Gráficos)
let prodFiltroHist = '';

let modoEntradaCronograma = 'pdf'; // 'pdf', 'texto', 'novo'
let novaTurmaManualNome = '';
let drawerAberto = false;

let prev = null, pend = null, wk = 0, turmaPad = '', msg = '';
let repFiltro = 'abertos', buscaAulas = '', showPast = false, buscaGlobalTermo = '';
let dest = 'novo', nomeNovo = '', destPre = '', orcAsk = false;

// Notificações e utilitários de interface
let toastTimer = null;
function toast(m) {
  clearTimeout(toastTimer);
  const t = document.getElementById('toast');
  if (t) {
    t.textContent = m;
    t.classList.add('s');
    toastTimer = setTimeout(() => t.classList.remove('s'), 2200);
  }
}

function copy(txt) {
  const ok = () => toast('Copiado para a área de transferência!');
  const fb = () => {
    const a = document.createElement('textarea');
    a.value = txt;
    document.body.appendChild(a);
    a.select();
    try { document.execCommand('copy'); ok(); } catch (e) { toast('Não foi possível copiar.'); }
    a.remove();
  };
  try { navigator.clipboard.writeText(txt).then(ok, fb); } catch (e) { fb(); }
}

let delTarget = null, delTimer = null;
function confirmarExclusao(el, acao) {
  if (delTarget === el) {
    clearTimeout(delTimer);
    delTarget = null;
    acao();
  } else {
    if (delTarget && delTarget.isConnected) {
      delTarget.innerHTML = delTarget.dataset.orig || 'Excluir';
      delTarget.classList.remove('danger');
    }
    clearTimeout(delTimer);
    delTarget = el;
    el.dataset.orig = el.innerHTML;
    el.innerHTML = '⚠️ Confirmar?';
    el.classList.add('danger');
    delTimer = setTimeout(() => {
      if (delTarget === el && el.isConnected) {
        el.innerHTML = delTarget.dataset.orig || 'Excluir';
        el.classList.remove('danger');
        delTarget = null;
      }
    }, 3500);
  }
}

const card = (t, body, n) => {
  let header = '';
  if (t) {
    let badge = '';
    if (n != null) {
      badge = n > 0 
        ? ` <span class="pill w" style="min-width:20px; justify-content:center; font-weight:700;" title="${n} item(ns)">${n}</span>` 
        : ` <span class="pill o" style="width:8px; height:8px; min-width:8px; padding:0; border-radius:999px; display:inline-block; vertical-align:middle;"></span>`;
    }
    header = `<h2>${t}${badge}</h2>`;
  }
  const destaque = (n != null && n > 0) ? 'style="border-color: rgba(245, 158, 11, 0.4); box-shadow: 0 0 10px rgba(245, 158, 11, 0.08);"' : '';
  return `<div class="card" ${destaque}>${header}${body}</div>`;
};

// Agrupamento de aulas para contratos/recibos
function groups(a, b) {
  const m = {};
  S.aulas.filter(x => typeof x.dia === 'string' && x.dia >= a && x.dia <= b).forEach(x => {
    const p = (typeof profCanon === 'function' ? profCanon(x.prof || '') : (x.prof || '')) || '(sem professor)';
    const k = norm(p) + '|' + x.dia;
    (m[k] = m[k] || { k, prof: p, dia: x.dia, aulas: [] }).aulas.push(x);
  });
  return Object.values(m).sort((p, q) => (p.dia + norm(p.prof)).localeCompare(q.dia + norm(q.prof)));
}