/* ========================================================
   CORE.JS - ESTADO GLOBAL, SUPABASE SYNC E UTILITÁRIOS
   Painel Operacional Prius
======================================================== */

const KEY = 'prius-painel-v2';

// ========================================================
// CONFIGURAÇÃO DO SUPABASE (COLE SUAS CREDENCIAIS ABAIXO)
// Encontre em: Supabase Dashboard > Project Settings > API
// ========================================================
const SUPABASE_URL = 'https://umkbdxwbagwnkgvsqcrb.supabase.co/rest/v1/';
const SUPABASE_ANON_KEY = 'sb_publishable_Dw2ug9P1PiLWUo0xvMjY1w_iiQ1Z7Uu';
const SUPABASE_ROW_ID = 'prius-principal';

// Controle de Tema (Claro / Escuro)
function aplicarTema(t) {
  const tema = t || localStorage.getItem(KEY + '-tema') || 'dark';
  if (tema === 'light') {
    document.documentElement.setAttribute('data-theme', 'light');
  } else {
    document.documentElement.removeAttribute('data-theme');
  }
  try { localStorage.setItem(KEY + '-tema', tema); } catch (e) {}
  return tema;
}
aplicarTema();

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

// Normalização e saneamento do objeto de estado S
function normalizarEstado(raw) {
  const obj = (raw && typeof raw === 'object' && !Array.isArray(raw)) ? raw : {};

  ['aulas', 'reparos', 'hist', 'orcHist', 'fornecedores', 'apelidos', 'filaMateriais', 'lembretes'].forEach(k => {
    if (!Array.isArray(obj[k])) obj[k] = [];
    obj[k] = obj[k].filter(item => item && typeof item === 'object');
  });

  obj.docs = obj.docs || {};
  obj.cat = obj.cat || {};
  obj.meta = obj.meta || {};
  obj.orc = obj.orc || { inst: 'Prius', titulo: '', solic: '', data: hoje, obs: '', qtdTotal: '', itens: [] };

  if (Array.isArray(obj.orc.itens)) {
    obj.orc.itens.forEach(i => {
      if (!i.status) i.status = 'Aguardando aprovação';
      if (i.status === 'Pedido') i.status = 'Pedido feito';
    });
  }

  obj.reparos.forEach(r => {
    if (!r.status) r.status = r.feito ? 'Concluído' : 'Pendente';
    if (!r.dataReg) r.dataReg = hoje;
    if (r.status === 'Concluído' && !r.dataConc) r.dataConc = hoje;
    if (!r.local) r.local = '';
  });

  return obj;
}

// Inicialização local imediata (cache offline)
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
  S = normalizarEstado(JSON.parse(bruto));
} catch (e) {
  S = normalizarEstado({});
}

// ========================================================
// MOTOR DE SINCRONIZAÇÃO COM SUPABASE (NUVEM + REALTIME)
// ========================================================
let sbClient = null;
let sbSyncTimer = null;
let sbUltimaAtualizacaoLocal = 0;

const supabaseConfigurado = () =>
  typeof window !== 'undefined' &&
  window.supabase &&
  SUPABASE_URL &&
  SUPABASE_URL.startsWith('http') &&
  SUPABASE_ANON_KEY &&
  !SUPABASE_ANON_KEY.includes('COLE_SUA');

async function enviarEstadoParaNuvem() {
  if (!sbClient) return;
  try {
    const agoraIso = new Date().toISOString();
    S.meta = S.meta || {};
    S.meta.ultimoSyncNuvem = agoraIso;
    sbUltimaAtualizacaoLocal = Date.now();

    const { error } = await sbClient
      .from('painel_estado')
      .upsert({
        id: SUPABASE_ROW_ID,
        dados: S,
        atualizado_em: agoraIso
      }, { onConflict: 'id' });

    if (error) {
      console.error('Erro ao sincronizar com Supabase:', error.message);
      toast('⚠️ Falha ao salvar na nuvem (dados mantidos localmente).');
    }
  } catch (err) {
    console.error('Exceção ao enviar para Supabase:', err);
  }
}

function agendarSyncNuvem() {
  if (!sbClient) return;
  clearTimeout(sbSyncTimer);
  sbSyncTimer = setTimeout(() => {
    enviarEstadoParaNuvem();
  }, 600);
}

async function iniciarSupabase() {
  if (!supabaseConfigurado()) return;

  try {
    sbClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    // 1. Busca o estado mais recente da nuvem ao abrir o painel
    const { data, error } = await sbClient
      .from('painel_estado')
      .select('dados, atualizado_em')
      .eq('id', SUPABASE_ROW_ID)
      .maybeSingle();

    if (error) {
      console.error('Erro ao carregar dados do Supabase:', error.message);
      toast('⚠️ Modo offline ativo (erro ao conectar à nuvem).');
      return;
    }

    const nuvemTemDados = data && data.dados && Object.keys(data.dados).length > 0 &&
      ((data.dados.aulas && data.dados.aulas.length > 0) ||
       (data.dados.reparos && data.dados.reparos.length > 0) ||
       (data.dados.orc && data.dados.orc.itens && data.dados.orc.itens.length > 0) ||
       (data.dados.lembretes && data.dados.lembretes.length > 0));

    const localTemDados = (S.aulas && S.aulas.length > 0) ||
      (S.reparos && S.reparos.length > 0) ||
      (S.orc && S.orc.itens && S.orc.itens.length > 0);

    if (nuvemTemDados) {
      // A nuvem já possui dados: aplica no painel e atualiza o cache local
      S = normalizarEstado(data.dados);
      localStorage.setItem(KEY, JSON.stringify(S));
      if (typeof render === 'function') render();
      toast('☁️ Painel sincronizado com a nuvem!');
    } else if (localTemDados) {
      // Primeira migração: banco na nuvem vazio, mas este navegador já tem dados -> sobe automaticamente
      await enviarEstadoParaNuvem();
      toast('☁️ Dados locais enviados para o Supabase com sucesso!');
    }

    // 2. Escuta alterações em tempo real feitas por outro operador/navegador
    sbClient
      .channel('sync-painel-prius')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'painel_estado', filter: `id=eq.${SUPABASE_ROW_ID}` },
        payload => {
          // Ignora eco da própria gravação feita há menos de 2 segundos
          if (Date.now() - sbUltimaAtualizacaoLocal < 2000) return;
          if (payload && payload.new && payload.new.dados) {
            S = normalizarEstado(payload.new.dados);
            try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {}
            if (typeof render === 'function') render();
            toast('🔄 Atualizado por outro operador!');
          }
        }
      )
      .subscribe();

  } catch (e) {
    console.error('Falha na inicialização do Supabase:', e);
  }
}

const save = () => {
  try {
    localStorage.setItem(KEY, JSON.stringify(S));
  } catch (e) {
    console.error('Falha ao salvar:', e);
    toast('⚠️ Falha ao salvar no navegador! Armazenamento indisponível.');
  }
  agendarSyncNuvem();
};

// Inicia a conexão com a nuvem em segundo plano
iniciarSupabase();

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
let resumoTextoCustomizado = null;
let resumoTipoAtual = 'dia';

let prev = null, pend = null, wk = 0, turmaPad = '', msg = '';
let repFiltro = 'abertos', buscaAulas = '', showPast = false, buscaGlobalTermo = '', buscaGlobalTipo = 'todos';
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
