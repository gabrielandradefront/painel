/* ========================================================
   CORE.JS - ESTADO GLOBAL, SUPABASE SYNC E UTILITÁRIOS
   ARGOS OPS
======================================================== */

const KEY = 'prius-painel-v2';

// ========================================================
// CONFIGURAÇÃO DO SUPABASE (COLE SUAS CREDENCIAIS ABAIXO)
// Encontre em: Supabase Dashboard > Project Settings > API
// ========================================================
const SUPABASE_URL = 'https://umkbdxwbagwnkgvsqcrb.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_Dw2ug9P1PiLWUo0xvMjY1w_iiQ1Z7Uu';
const SUPABASE_ROW_ID = 'prius-principal';

// ========================================================
// EVENT BUS CENTRAL E REGISTRO DE DEPENDÊNCIAS (PRIUS BUS)
// ========================================================
const PriusBus = (() => {
  const listeners = new Map();
  const registered = new Map();
  const waiters = [];
  const CORE_TREE = ['core', 'orcamento', 'operacional', 'aulas', 'hoje', 'app'];

  let domReady = typeof document === 'undefined' || document.readyState !== 'loading';
  let appReadyEmitted = false;

  if (!domReady && typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', () => {
      domReady = true;
      emit('dom:ready');
      resolveAll();
    }, { once: true });
  }

  function on(event, fn) {
    if (typeof fn !== 'function') return () => {};
    if (!listeners.has(event)) listeners.set(event, new Set());
    listeners.get(event).add(fn);
    return () => off(event, fn);
  }

  function off(event, fn) {
    const set = listeners.get(event);
    if (set) set.delete(fn);
  }

  function once(event, fn) {
    if (typeof fn !== 'function') return () => {};
    const wrapper = payload => {
      off(event, wrapper);
      fn(payload);
    };
    return on(event, wrapper);
  }

  function emit(event, payload) {
    const set = listeners.get(event);
    if (!set) return;
    [...set].forEach(fn => {
      try {
        fn(payload);
      } catch (err) {
        console.error(`[PriusBus] Erro no listener "${event}":`, err);
      }
    });
  }

  function depsSatisfied(deps, requireDom = false) {
    if (requireDom && !domReady) return false;
    return (deps || []).every(d => {
      const mod = registered.get(d);
      return !!mod && mod.initialized;
    });
  }

  function resolveAll() {
    let progressed = true;
    while (progressed) {
      progressed = false;

      registered.forEach((mod, name) => {
        if (mod.initialized) return;
        if (!depsSatisfied(mod.deps, mod.requireDom)) return;

        mod.initialized = true;
        progressed = true;

        if (typeof mod.onReady === 'function') {
          try {
            mod.onReady({ bus: api, name });
          } catch (err) {
            console.error(`[PriusBus] Erro ao inicializar módulo "${name}":`, err);
          }
        }
        emit(`module:ready:${name}`, { name, deps: mod.deps });
        emit('module:ready', { name, deps: mod.deps });
      });

      waiters.forEach(w => {
        if (w.fired) return;
        if (!depsSatisfied(w.deps, w.dom)) return;
        w.fired = true;
        progressed = true;
        try {
          w.fn({ bus: api, modules: getRegisteredModules() });
        } catch (err) {
          console.error('[PriusBus] Erro em callback whenReady:', err);
        }
      });
    }

    if (!appReadyEmitted && depsSatisfied(CORE_TREE, true)) {
      appReadyEmitted = true;
      emit('app:ready', { modules: getRegisteredModules() });
    }
  }

  function register(name, deps = [], onReady = null, options = {}) {
    if (!name || typeof name !== 'string') return api;
    const cleanDeps = Array.isArray(deps) ? deps.filter(Boolean) : [];
    const existing = registered.get(name);
    if (existing && existing.initialized) return api;

    registered.set(name, {
      deps: cleanDeps,
      onReady: typeof onReady === 'function' ? onReady : null,
      requireDom: !!options.dom,
      initialized: false
    });

    emit('module:registered', { name, deps: cleanDeps });
    resolveAll();
    return api;
  }

  function whenReady(deps, fn, options = {}) {
    if (typeof fn !== 'function') return api;
    const depList = Array.isArray(deps) ? deps.filter(Boolean) : (deps ? [deps] : []);
    const requireDom = !!options.dom;
    if (depsSatisfied(depList, requireDom)) {
      try {
        fn({ bus: api, modules: getRegisteredModules() });
      } catch (err) {
        console.error('[PriusBus] Erro em callback whenReady:', err);
      }
      return api;
    }
    waiters.push({ deps: depList, dom: requireDom, fn, fired: false });
    return api;
  }

  function isReady(nameOrDeps, options = {}) {
    if (!nameOrDeps) return appReadyEmitted || depsSatisfied(CORE_TREE, true);
    const list = Array.isArray(nameOrDeps) ? nameOrDeps : [nameOrDeps];
    return depsSatisfied(list, !!options.dom);
  }

  function getRegisteredModules() {
    const out = [];
    registered.forEach((mod, name) => {
      if (mod.initialized) out.push(name);
    });
    return out;
  }

  function getPendingModules() {
    const out = [];
    registered.forEach((mod, name) => {
      if (!mod.initialized) {
        const missing = mod.deps.filter(d => !isReady(d));
        out.push({ name, missing, waitingDom: mod.requireDom && !domReady });
      }
    });
    return out;
  }

  const api = {
    on,
    off,
    once,
    emit,
    register,
    whenReady,
    isReady,
    getRegisteredModules,
    getPendingModules,
    CORE_TREE
  };

  return api;
})();

if (typeof window !== 'undefined') {
  window.PriusBus = PriusBus;
}

// Controle de Tema (Claro / Escuro)
function aplicarTema(t) {
  let salvo = null;
  try { salvo = localStorage.getItem(KEY + '-tema'); } catch (e) {}
  const tema = t || salvo || 'dark';
  if (typeof document !== 'undefined' && document.documentElement) {
    if (tema === 'light') {
      document.documentElement.setAttribute('data-theme', 'light');
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
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
  ['hoje', 'Controle'],
  ['aulas', 'Aulas'],
  ['semana', 'Operações'],
  ['orc', 'Orçamento']
];

// Helpers de saneamento e validação de objetos/URLs
function safePlainObj(v) {
  const out = {};
  if (!v || typeof v !== 'object' || Array.isArray(v)) return out;
  for (const k of Object.keys(v)) {
    if (k === '__proto__' || k === 'constructor' || k === 'prototype') continue;
    out[k] = v[k];
  }
  return out;
}

function safeHttpUrl(raw) {
  const s = String(raw ?? '').trim();
  if (!s || /[\u0000-\u001F\u007F\s]/.test(s) || s.startsWith('//')) return '';
  let candidate = s;
  if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(candidate)) {
    if (!/^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}([:/?#].*)?$/.test(candidate)) return '';
    candidate = 'https://' + candidate;
  }
  try {
    const u = new URL(candidate);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return '';
    if (!u.hostname || (!u.hostname.includes('.') && u.hostname !== 'localhost')) return '';
    return u.toString();
  } catch (e) {
    return '';
  }
}

function sanitizeOptionalLink(raw) {
  const s = String(raw ?? '').trim();
  if (!s) return '';
  if (/^\s*(javascript|data|vbscript|file):/i.test(s) || s.startsWith('//')) return '';
  const valid = safeHttpUrl(s);
  if (valid) return valid;
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(s)) return '';
  return s;
}

function _normTxtCore(s) {
  return String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

function _uidCore() {
  return Math.random().toString(36).slice(2, 9);
}

function _cleanProfList(raw, excludeNorm = '') {
  const arr = Array.isArray(raw)
    ? raw
    : (typeof raw === 'string' && raw.trim() ? [raw] : []);
  const vistos = new Set();
  const out = [];
  arr.forEach(v => {
    const limpo = String(v ?? '').trim();
    const n = _normTxtCore(limpo);
    if (!limpo || !n || (excludeNorm && n === excludeNorm) || vistos.has(n)) return;
    vistos.add(n);
    out.push(limpo);
  });
  return out;
}

function normalizarProfessores(rawProfs, rawApelidos, rawPerfis, mesclarLegado = false) {
  const porNome = new Map();
  const lista = [];

  const obterOuCriar = (nomeRaw, idPreferido = '') => {
    const name = String(nomeRaw ?? '').trim();
    const nk = _normTxtCore(name);
    if (!name || !nk) return null;
    if (porNome.has(nk)) return porNome.get(nk);
    const id = (typeof idPreferido === 'string' && idPreferido.trim()) ? idPreferido.trim() : ('prof_' + _uidCore());
    const prof = { id, name, aliases: [], subjects: [], turno: '', sala: '' };
    porNome.set(nk, prof);
    lista.push(prof);
    return prof;
  };

  const encontrarPorNomeOuApelido = nomeRaw => {
    const nk = _normTxtCore(nomeRaw);
    if (!nk) return null;
    if (porNome.has(nk)) return porNome.get(nk);
    for (const p of lista) {
      if (p.aliases.some(a => _normTxtCore(a) === nk)) return p;
    }
    return null;
  };

  const mesclarEm = (prof, aliasesRaw, subjectsRaw, turnoRaw, salaRaw) => {
    if (!prof) return;
    const nkNome = _normTxtCore(prof.name);
    const alts = _cleanProfList(aliasesRaw, nkNome);
    alts.forEach(a => {
      if (!prof.aliases.some(x => _normTxtCore(x) === _normTxtCore(a))) {
        prof.aliases.push(a);
      }
    });
    const subjs = _cleanProfList(subjectsRaw);
    subjs.forEach(s => {
      if (!prof.subjects.some(x => _normTxtCore(x) === _normTxtCore(s))) {
        prof.subjects.push(s);
      }
    });
    const turno = String(turnoRaw ?? '').trim();
    const sala = String(salaRaw ?? '').trim();
    if (turno && !prof.turno) prof.turno = turno;
    if (sala && !prof.sala) prof.sala = sala;
  };

  if (Array.isArray(rawProfs)) {
    rawProfs.forEach(item => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return;
      const clean = safePlainObj(item);
      const nameRaw = clean.name !== undefined ? clean.name : clean.nome;
      const prof = obterOuCriar(nameRaw, clean.id);
      if (!prof) return;
      const aliasesSrc = clean.aliases !== undefined
        ? (typeof clean.aliases === 'string' ? clean.aliases.split(',') : clean.aliases)
        : (clean.alts !== undefined ? clean.alts : []);
      const subjectsSrc = [
        ..._cleanProfList(clean.subjects),
        ..._cleanProfList(clean.subject),
        ..._cleanProfList(clean.disciplinas),
        ..._cleanProfList(clean.disciplina)
      ];
      mesclarEm(prof, aliasesSrc, subjectsSrc, clean.turno, clean.sala);
    });
  }

  if (mesclarLegado) {
    if (Array.isArray(rawApelidos)) {
      rawApelidos.forEach(a => {
        if (!a || typeof a !== 'object' || Array.isArray(a)) return;
        const clean = safePlainObj(a);
        const prof = obterOuCriar(clean.nome || clean.name, clean.id);
        if (!prof) return;
        const alts = Array.isArray(clean.alts) ? clean.alts : (Array.isArray(clean.aliases) ? clean.aliases : []);
        mesclarEm(prof, alts, [], '', '');
      });
    }

    const perfisObj = safePlainObj(rawPerfis);
    Object.values(perfisObj).forEach(p => {
      if (!p || typeof p !== 'object' || Array.isArray(p)) return;
      const clean = safePlainObj(p);
      const nome = String(clean.nome || clean.name || '').trim();
      if (!nome) return;
      const prof = encontrarPorNomeOuApelido(nome) || obterOuCriar(nome, clean.id);
      if (!prof) return;
      const subjectsSrc = [
        ..._cleanProfList(clean.subjects),
        ..._cleanProfList(clean.subject),
        ..._cleanProfList(clean.disciplinas),
        ..._cleanProfList(clean.disciplina)
      ];
      mesclarEm(prof, clean.aliases || [], subjectsSrc, clean.turno, clean.sala);
    });
  }

  // Garante unicidade global de apelidos e ordenação consistente
  const usados = new Set(lista.map(p => _normTxtCore(p.name)));
  lista.forEach(p => {
    const finais = [];
    p.aliases.forEach(a => {
      const na = _normTxtCore(a);
      if (!na || usados.has(na)) return;
      usados.add(na);
      finais.push(a);
    });
    p.aliases = finais.sort((a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }));
    p.subjects = _cleanProfList(p.subjects).sort((a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }));
  });

  return lista;
}

function sincronizarLegadoProfessores(stateObj) {
  const alvo = stateObj || (typeof S !== 'undefined' ? S : null);
  if (!alvo || typeof alvo !== 'object') return;
  const profs = Array.isArray(alvo.professores) ? alvo.professores : [];

  alvo.apelidos = profs
    .filter(p => p && p.name && Array.isArray(p.aliases) && p.aliases.length > 0)
    .map(p => ({
      id: p.id,
      nome: p.name,
      alts: [...p.aliases]
    }));

  const perfis = {};
  profs.forEach(p => {
    if (!p || !p.name) return;
    const k = _normTxtCore(p.name);
    if (!k || k === '__proto__' || k === 'constructor' || k === 'prototype') return;
    perfis[k] = {
      id: p.id,
      nome: p.name,
      disciplina: (Array.isArray(p.subjects) && p.subjects[0]) ? p.subjects[0] : '',
      subjects: Array.isArray(p.subjects) ? [...p.subjects] : [],
      turno: p.turno || '',
      sala: p.sala || ''
    };
  });
  alvo.profPerfis = perfis;
}

// Normalização e saneamento do objeto de estado S
function normalizarEstado(raw) {
  const obj = safePlainObj(raw);
  const tinhaProfessoresPadrao = Array.isArray(obj.professores);

  ['aulas', 'reparos', 'hist', 'orcHist', 'apelidos', 'filaMateriais', 'lembretes'].forEach(k => {
    if (!Array.isArray(obj[k])) obj[k] = [];
    obj[k] = obj[k].filter(item => item && typeof item === 'object' && !Array.isArray(item)).map(item => safePlainObj(item));
  });
  if (!Array.isArray(obj.fornecedores)) obj.fornecedores = [];
  obj.fornecedores = obj.fornecedores.filter(item => typeof item === 'string' || (item && typeof item === 'object' && !Array.isArray(item)));

  obj.docs = safePlainObj(obj.docs);
  obj.cat = safePlainObj(obj.cat);
  obj.meta = safePlainObj(obj.meta);
  obj.profPerfis = safePlainObj(obj.profPerfis);
  obj.professores = normalizarProfessores(obj.professores, obj.apelidos, obj.profPerfis, !tinhaProfessoresPadrao);
  sincronizarLegadoProfessores(obj);
  obj.presets = safePlainObj(obj.presets);
  obj.cronogramas = safePlainObj(obj.cronogramas);
  Object.keys(obj.cronogramas).forEach(k => {
    const entry = obj.cronogramas[k];
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      delete obj.cronogramas[k];
      return;
    }
    const clean = safePlainObj(entry);
    obj.cronogramas[k] = {
      nome: typeof clean.nome === 'string' ? clean.nome : '',
      createdAt: (typeof clean.createdAt === 'string' || typeof clean.createdAt === 'number') ? clean.createdAt : '',
      updatedAt: (typeof clean.updatedAt === 'string' || typeof clean.updatedAt === 'number') ? clean.updatedAt : ''
    };
  });

  const DEFAULT_SUPPORT_SHEETS = [
    { id: 'sheet-1', task: 'Tarefa 1 — Planilha de Apoio', url: 'https://docs.google.com/spreadsheets/d/exemplo-1' },
    { id: 'sheet-2', task: 'Tarefa 2 — Planilha de Apoio', url: 'https://docs.google.com/spreadsheets/d/exemplo-2' },
    { id: 'sheet-3', task: 'Tarefa 3 — Planilha de Apoio', url: 'https://docs.google.com/spreadsheets/d/exemplo-3' },
    { id: 'sheet-4', task: 'Tarefa 4 — Planilha de Apoio', url: 'https://docs.google.com/spreadsheets/d/exemplo-4' },
    { id: 'sheet-5', task: 'Tarefa 5 — Planilha de Apoio', url: 'https://docs.google.com/spreadsheets/d/exemplo-5' },
    { id: 'sheet-6', task: 'Tarefa 6 — Planilha de Apoio', url: 'https://docs.google.com/spreadsheets/d/exemplo-6' }
  ];
  if (!Array.isArray(obj.supportSheets)) {
    obj.supportSheets = JSON.parse(JSON.stringify(DEFAULT_SUPPORT_SHEETS));
  } else {
    obj.supportSheets = obj.supportSheets
      .filter(it => it && typeof it === 'object' && !Array.isArray(it))
      .slice(0, 10)
      .map(it => {
        const clean = safePlainObj(it);
        const task = String(clean.task || '').trim();
        const url = safeHttpUrl(clean.url || '');
        if (!task || !url) return null;
        return {
          id: (clean.id && typeof clean.id === 'string') ? clean.id : ('sh-' + Math.random().toString(36).slice(2, 9)),
          task,
          url
        };
      })
      .filter(Boolean);
  }

  obj.snakeTop5 = normalizarSnakeTop5(obj.snakeTop5);
  
  const defaultPresets = {
    reparos: {
      locais: ['Hall', 'Recepção', 'Copa', 'Copinha', 'Corredor', 'Nárnia', 'Banheiro', 'Coordenação', 'Sala 1', 'Sala 2', 'Sala 3', 'Almoxarife', 'Estúdio', 'Sala de descanso'],
      categorias: ['Elétrica', 'Hidráulica', 'Pintura', 'Ar Condicionado', 'Mobiliário', 'Tecnologia / Rede', 'Limpeza', 'Outros'],
      prestadores: ['Equipe Interna', 'Manutenção Predial', 'Técnico de Ar', 'Eletricista Plantão', 'TI / Suporte']
    },
    professores: {
      turnos: ['Manhã', 'Tarde', 'Noite', 'Integral'],
      salas: ['Sala 1', 'Sala 2', 'Sala 3', 'Estúdio 1', 'Estúdio 2', 'Auditório'],
      disciplinas: ['Raciocínio Lógico', 'Matemática', 'Português', 'Redação', 'Biologia', 'Química', 'Física', 'História', 'Geografia', 'Inglês']
    },
    operacao: {
      formasEnvio: ['WhatsApp', 'E-mail', 'Drive', 'Impresso', 'Servidor / Rede']
    },
    orcamentos: {
      fornecedores: [
        { nome: 'Kalunga', link: 'https://www.kalunga.com.br' },
        { nome: 'Amazon', link: 'https://www.amazon.com.br' },
        { nome: 'Atacadão', link: 'https://www.atacadao.com.br' },
        { nome: 'Mercado Livre', link: 'https://www.mercadolivre.com.br' }
      ],
      categorias: ['Material de Escritório', 'Limpeza', 'Manutenção', 'Tecnologia', 'Alimentação', 'Divulgação', 'Geral'],
      unidades: ['un', 'cx', 'pct', 'resma', 'kit', 'kg', 'litro', 'm', 'par', 'rolo']
    },
    notas: {
      etiquetas: ['Urgente', 'Reunião', 'Financeiro', 'Pedagógico', 'Manutenção', 'Pessoal', 'Prazo']
    }
  };

  ['reparos', 'professores', 'operacao', 'orcamentos', 'notas'].forEach(cat => {
    obj.presets[cat] = safePlainObj(obj.presets[cat]);
    const targetCat = obj.presets[cat];
    const sourceCat = defaultPresets[cat];
    Object.keys(sourceCat).forEach(sub => {
      if (!Array.isArray(targetCat[sub])) {
        targetCat[sub] = JSON.parse(JSON.stringify(sourceCat[sub]));
      }
    });
  });

  if (Array.isArray(obj.presets.orcamentos.fornecedores)) {
    obj.presets.orcamentos.fornecedores = obj.presets.orcamentos.fornecedores
      .map(f => {
        if (typeof f === 'string') return { nome: f.trim(), link: '' };
        if (f && typeof f === 'object' && !Array.isArray(f)) {
          return {
            nome: String(f.nome || '').trim(),
            link: sanitizeOptionalLink(f.link || '')
          };
        }
        return null;
      })
      .filter(f => f && f.nome);
  }

  const orcRaw = (obj.orc && typeof obj.orc === 'object' && !Array.isArray(obj.orc)) ? safePlainObj(obj.orc) : null;
  obj.orc = orcRaw || { inst: 'ARGOS OPS', modo: 'comparativo_fornecedores', titulo: '', fornecedor: '', link: '', categoria: '', unidade: '', solic: '', data: hoje, obs: '', qtdTotal: '', itens: [] };
  obj.orc.modo = obj.orc.modo === 'pedido_fornecedor' ? 'pedido_fornecedor' : 'comparativo_fornecedores';
  if (typeof obj.orc.fornecedor !== 'string') obj.orc.fornecedor = '';
  obj.orc.link = typeof obj.orc.link === 'string' ? sanitizeOptionalLink(obj.orc.link) : '';
  if (typeof obj.orc.categoria !== 'string') obj.orc.categoria = '';
  if (typeof obj.orc.unidade !== 'string') obj.orc.unidade = '';
  if (typeof obj.orc.data !== 'string' || (obj.orc.data && !/^\d{4}-\d{2}-\d{2}$/.test(obj.orc.data))) obj.orc.data = hoje;
  if (!Array.isArray(obj.orc.itens)) obj.orc.itens = [];
  obj.orc.itens = obj.orc.itens.filter(i => i && typeof i === 'object' && !Array.isArray(i)).map(i => safePlainObj(i));

  obj.orc.itens.forEach(i => {
    if (!i.id || typeof i.id !== 'string') i.id = uid();
    if (!i.status || typeof i.status !== 'string') i.status = 'Aguardando aprovação';
    if (i.status === 'Pedido') i.status = 'Pedido feito';
    if (typeof i.link === 'string') i.link = sanitizeOptionalLink(i.link);
  });

  obj.orcHist.forEach(h => {
    if (!h.id || typeof h.id !== 'string') h.id = uid();
    if (h.modo !== 'pedido_fornecedor') h.modo = 'comparativo_fornecedores';
    if (typeof h.link === 'string') h.link = sanitizeOptionalLink(h.link);
    if (Array.isArray(h.itens)) {
      h.itens = h.itens.filter(it => it && typeof it === 'object' && !Array.isArray(it)).map(it => {
        const clean = safePlainObj(it);
        if (typeof clean.link === 'string') clean.link = sanitizeOptionalLink(clean.link);
        return clean;
      });
    }
  });

  obj.aulas.forEach(a => {
    if (!a.id || typeof a.id !== 'string') a.id = uid();
    a.destaque = (a.destaque === 'nova' || a.destaque === 'alterada') ? a.destaque : null;
  });

  obj.reparos.forEach(r => {
    if (!r.id || typeof r.id !== 'string') r.id = uid();
    if (!r.status) r.status = r.feito ? 'Concluído' : 'Pendente';
    if (!r.dataReg) r.dataReg = hoje;
    if (r.status === 'Concluído' && !r.dataConc) r.dataConc = hoje;
    if (!r.local) r.local = '';
  });

  obj.lembretes.forEach(l => {
    if (!l.id || typeof l.id !== 'string') l.id = uid();
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
        (o.orc = o.orc || { inst: 'ARGOS OPS', titulo: '', solic: '', data: '', obs: '', itens: [] }).itens.push({ id: c.id, nome: c.item, qtd: c.qtd || '', forn: c.fornecedor || '', status: c.status, cat: '', un: '', preco: '' }); 
      }); 
      delete o.compras; bruto = JSON.stringify(o); 
    } 
  }
  S = normalizarEstado(JSON.parse(bruto));
} catch (e) {
  S = normalizarEstado({});
}

if (typeof globalThis !== 'undefined' && !Object.prototype.hasOwnProperty.call(globalThis, 'appPresets')) {
  try {
    Object.defineProperty(globalThis, 'appPresets', {
      get() { return (typeof S !== 'undefined' && S && S.presets) ? S.presets : {}; },
      set(v) { if (typeof S !== 'undefined' && S && v && typeof v === 'object') S.presets = v; },
      configurable: true
    });
  } catch (e) {}
}

// Variáveis globais de controle de navegação, filtros e notificações
// Declaradas antes do motor de sincronização para evitar erros de TDZ durante a inicialização
let tab = 'hoje';
let subTabAulas = 'quadro';
let subTabSemana = 'docs';
let orcSlideAtivo = 0; // 0 = Slide 1 (Dados e Tabela), 1 = Slide 2 (Gráficos)
let modoOrcamentoAtual = (S && S.orc && S.orc.modo === 'pedido_fornecedor') ? 'pedido_fornecedor' : 'comparativo_fornecedores';
let orcHistFiltroModo = 'todos';
let prodFiltroHist = '';
let cotacaoBaseComparacao = null;
let orcFornHistorico = '';
let orcItemHistorico = '';

let modoEntradaCronograma = 'pdf'; // 'pdf', 'texto', 'novo'
let novaTurmaManualNome = '';
let drawerAberto = false;
let sheetsMenuAberto = false;
let sheetsFormModo = '';
let sheetsEditId = '';
let searchFilterAberto = false;
let notaTagSelecionada = '';
let novaTagNotaAberta = false;
let apelidosAberto = false;
let profsExpandidos = new Set();
let filtroGestaoProfs = '';
let resumoTextoCustomizado = null;
let resumoTipoAtual = 'dia';
let resumoDataIni = hoje;
let resumoDataFim = hoje;

let prev = null, pend = null, wk = 0, turmaPad = '', msg = '';
let repFiltro = 'abertos', showPast = false, buscaGlobalTermo = '', buscaGlobalTipo = 'todos', buscaGlobalExpandida = false;
let dest = 'novo', nomeNovo = '', destPre = '', orcAsk = false;

let toastTimer = null;
let delTarget = null, delTimer = null;

// ========================================================
// MOTOR DE SINCRONIZAÇÃO COM SUPABASE (NUVEM + REALTIME)
// ========================================================
let sbClient = null;
let sbChannel = null;
let sbSyncTimer = null;
let sbUltimaAtualizacaoLocal = 0;
let sbConectado = false;
let sbPendenciasLocais = false;

const supabaseConfigurado = () =>
  typeof window !== 'undefined' &&
  window.supabase &&
  typeof window.supabase.createClient === 'function' &&
  SUPABASE_URL &&
  SUPABASE_URL.startsWith('http') &&
  SUPABASE_ANON_KEY &&
  !SUPABASE_ANON_KEY.includes('COLE_SUA');

// Inicializa o cliente Supabase imediatamente se o SDK CDN estiver disponível
if (supabaseConfigurado()) {
  try {
    sbClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  } catch (e) {
    console.error('Erro ao inicializar cliente Supabase:', e);
    sbClient = null;
  }
}

async function enviarEstadoParaNuvem() {
  if (!supabaseConfigurado()) return false;
  if (!sbClient) sbClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
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
      sbConectado = false;
      console.error('Erro ao sincronizar com Supabase:', error.message);
      toast('⚠\uFE0E Falha ao salvar na nuvem (dados mantidos localmente).');
      return false;
    }

    sbConectado = true;
    sbPendenciasLocais = false;
    try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {}
    return true;
  } catch (err) {
    sbConectado = false;
    console.error('Exceção ao enviar para Supabase:', err);
    return false;
  }
}

function agendarSyncNuvem() {
  if (!sbClient && !supabaseConfigurado()) return;
  clearTimeout(sbSyncTimer);
  sbSyncTimer = setTimeout(async () => {
    await enviarEstadoParaNuvem();
    if (typeof render === 'function' && tab === 'config') render();
  }, 600);
}

async function iniciarSupabase() {
  if (!supabaseConfigurado()) {
    sbConectado = false;
    return false;
  }

  try {
    if (!sbClient) {
      sbClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    }

    // 1. Busca o estado mais recente da nuvem ao abrir o painel
    const { data, error } = await sbClient
      .from('painel_estado')
      .select('dados, atualizado_em')
      .eq('id', SUPABASE_ROW_ID)
      .maybeSingle();

    if (error) {
      sbConectado = false;
      console.error('Erro ao carregar dados do Supabase:', error.message);
      toast('⚠\uFE0E Modo offline ativo (erro ao conectar à nuvem).');
      if (typeof render === 'function') render();
      return false;
    }

    sbConectado = true;

    const nuvemTemDados = data && data.dados && Object.keys(data.dados).length > 0 &&
      ((data.dados.aulas && data.dados.aulas.length > 0) ||
       (data.dados.reparos && data.dados.reparos.length > 0) ||
       (data.dados.orc && data.dados.orc.itens && data.dados.orc.itens.length > 0) ||
       (data.dados.lembretes && data.dados.lembretes.length > 0) ||
       (Array.isArray(data.dados.professores) && data.dados.professores.length > 0) ||
       (Array.isArray(data.dados.snakeTop5) && data.dados.snakeTop5.length > 0) ||
       Array.isArray(data.dados.supportSheets));

    const localTemDados = (S.aulas && S.aulas.length > 0) ||
      (S.reparos && S.reparos.length > 0) ||
      (S.orc && S.orc.itens && S.orc.itens.length > 0) ||
      (Array.isArray(S.professores) && S.professores.length > 0) ||
      (Array.isArray(S.snakeTop5) && S.snakeTop5.length > 0);

    if (nuvemTemDados) {
      // A nuvem já possui dados: aplica no painel e atualiza o cache local
      S = normalizarEstado(data.dados);
      S.meta = S.meta || {};
      S.meta.ultimoSyncNuvem = S.meta.ultimoSyncNuvem || data.atualizado_em || new Date().toISOString();
      sbPendenciasLocais = false;
      try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {}
      if (typeof render === 'function') render();
      toast('☁\uFE0E ARGOS OPS sincronizado com a nuvem!');
    } else if (localTemDados) {
      // Primeira migração: banco na nuvem vazio, mas este navegador já tem dados -> sobe automaticamente
      await enviarEstadoParaNuvem();
      if (typeof render === 'function') render();
      toast('☁\uFE0E Dados locais enviados para o Supabase com sucesso!');
    } else {
      S.meta = S.meta || {};
      S.meta.ultimoSyncNuvem = new Date().toISOString();
      try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {}
      if (typeof render === 'function') render();
    }

    // 2. Escuta alterações em tempo real feitas por outro operador/navegador
    if (!sbChannel) {
      sbChannel = sbClient
        .channel('sync-painel-prius')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'painel_estado', filter: `id=eq.${SUPABASE_ROW_ID}` },
          payload => {
            // Ignora eco da própria gravação feita há menos de 2 segundos
            if (Date.now() - sbUltimaAtualizacaoLocal < 2000) return;
            if (payload && payload.new && payload.new.dados) {
              S = normalizarEstado(payload.new.dados);
              S.meta = S.meta || {};
              S.meta.ultimoSyncNuvem = S.meta.ultimoSyncNuvem || payload.new.atualizado_em || new Date().toISOString();
              sbPendenciasLocais = false;
              try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {}
              PriusBus.emit('sync:updated', { state: S, origem: 'realtime' });
              if (typeof render === 'function') render();
              toast('↻ Atualizado por outro operador!');
            }
          }
        )
        .subscribe();
    }

    PriusBus.emit('sync:ready', { conectado: sbConectado });
    return true;
  } catch (e) {
    sbConectado = false;
    console.error('Falha na inicialização do Supabase:', e);
    PriusBus.emit('sync:ready', { conectado: false, erro: e });
    return false;
  }
}

const save = () => {
  sbPendenciasLocais = true;
  try {
    localStorage.setItem(KEY, JSON.stringify(S));
  } catch (e) {
    console.error('Falha ao salvar:', e);
    toast('⚠\uFE0E Falha ao salvar no navegador! Armazenamento indisponível.');
  }
  PriusBus.emit('state:saved', { state: S });
  agendarSyncNuvem();
};

const salvarESincronizarAgora = () => {
  save();
  if (supabaseConfigurado() && (typeof navigator === 'undefined' || navigator.onLine !== false)) {
    clearTimeout(sbSyncTimer);
    enviarEstadoParaNuvem();
  }
};

// A sincronização inicial com a nuvem é disparada após o carregamento completo dos módulos em app.js

// Funções utilitárias
const uid = () => Math.random().toString(36).slice(2, 9);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const br = d => (typeof d === 'string' && d.includes('-')) ? esc(d.split('-').reverse().slice(0, 2).join('/')) : esc(d || '');
const brFull = d => (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)) ? d.split('-').reverse().join('/') : (typeof d === 'string' ? d : '');
function resolverIntervaloResumo(tipo, iniOpt, fimOpt) {
  const t = String(tipo || 'dia').trim();
  const ehIso = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
  let dataIni = ehIso(iniOpt) ? iniOpt : (ehIso(resumoDataIni) ? resumoDataIni : hoje);
  let dataFim = ehIso(fimOpt) ? fimOpt : (ehIso(resumoDataFim) ? resumoDataFim : dataIni);

  if (t === 'dia') {
    dataIni = hoje;
    dataFim = hoje;
  } else if (t !== 'custom') {
    const nSem = parseInt(t, 10);
    if (Number.isFinite(nSem) && nSem > 0) {
      dataIni = hoje;
      dataFim = addD(hoje, nSem * 7);
    }
  }

  if (dataIni > dataFim) {
    const tmp = dataIni;
    dataIni = dataFim;
    dataFim = tmp;
  }

  const dtIni = new Date(dataIni + 'T00:00:00');
  const dtFim = new Date(dataFim + 'T00:00:00');
  const dias = (!isNaN(dtIni.getTime()) && !isNaN(dtFim.getTime()))
    ? Math.max(1, Math.round((dtFim.getTime() - dtIni.getTime()) / 86400000) + 1)
    : 1;

  return {
    tipo: t,
    dataIni,
    dataFim,
    iniBR: brFull(dataIni),
    fimBR: brFull(dataFim),
    dias
  };
}
const formatarDataBR = ts => {
  const dt = ts == null || ts === '' ? new Date() : new Date(ts);
  if (isNaN(dt.getTime())) return `${pad(new Date().getDate())}/${pad(new Date().getMonth() + 1)}/${new Date().getFullYear()}`;
  return `${pad(dt.getDate())}/${pad(dt.getMonth() + 1)}/${dt.getFullYear()}`;
};
const formatarDataHoraBR = ts => {
  if (ts == null || ts === '') return '';
  const dt = new Date(ts);
  if (isNaN(dt.getTime())) return '';
  return `${pad(dt.getDate())}/${pad(dt.getMonth() + 1)}/${dt.getFullYear()} às ${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
};
function normalizarNomeSnake(raw) {
  const limpo = String(raw ?? '').replace(/[\u0000-\u001F\u007F]/g, '').trim().slice(0, 24);
  return limpo || 'Operador';
}
function normalizarSnakeTop5(rawList) {
  if (!Array.isArray(rawList)) return [];
  const vistosDedup = new Set();
  const limpos = [];
  rawList.forEach((item, idx) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return;
    const clean = safePlainObj(item);
    const score = Math.floor(Number(clean.score));
    if (!Number.isFinite(score) || score <= 0) return;
    const name = normalizarNomeSnake(clean.name);
    const rawTs = Number(clean.ts);
    const ts = Number.isFinite(rawTs) && rawTs > 0 ? rawTs : (Date.now() + idx);
    const rawDate = typeof clean.date === 'string' ? clean.date.trim() : '';
    const date = /^\d{2}\/\d{2}\/\d{4}$/.test(rawDate) ? rawDate : formatarDataBR(ts);
    const dedupKey = (typeof clean.dedupKey === 'string' && clean.dedupKey.trim()) ? clean.dedupKey.trim().slice(0, 80) : '';
    if (dedupKey) {
      if (vistosDedup.has(dedupKey)) return;
      vistosDedup.add(dedupKey);
    }
    const id = (typeof clean.id === 'string' && clean.id.trim())
      ? clean.id.trim().slice(0, 64)
      : (dedupKey || `rec_${ts}_${idx}`);
    const entry = { id, name, score, date, ts };
    if (dedupKey) entry.dedupKey = dedupKey;
    limpos.push(entry);
  });
  return limpos
    .sort((a, b) => (b.score - a.score) || (a.ts - b.ts) || String(a.id).localeCompare(String(b.id)))
    .slice(0, 5);
}
function registrarScoresSnakeTop5(entradas, opts = {}) {
  const atuais = normalizarSnakeTop5(S && S.snakeTop5);
  const agora = Date.now();
  const dataHojeBR = formatarDataBR(agora);
  const candidatos = [];
  const novosDedup = new Set();
  const novosIds = new Set();

  (Array.isArray(entradas) ? entradas : []).forEach((item, idx) => {
    if (!item || typeof item !== 'object') return;
    const score = Math.floor(Number(item.score));
    if (!Number.isFinite(score) || score <= 0) return;
    const name = normalizarNomeSnake(item.name);
    const dedupKey = (typeof item.dedupKey === 'string' && item.dedupKey.trim()) ? item.dedupKey.trim().slice(0, 80) : '';
    if (dedupKey && atuais.some(r => r.dedupKey === dedupKey)) return;
    const ts = agora + idx;
    const id = dedupKey || `rec_${ts.toString(36)}_${uid()}`;
    const reg = { id, name, score, date: dataHojeBR, ts };
    if (dedupKey) {
      reg.dedupKey = dedupKey;
      novosDedup.add(dedupKey);
    }
    novosIds.add(id);
    candidatos.push(reg);
  });

  if (!candidatos.length) {
    return { entrouLista: false, novosIds: [], top5: atuais };
  }

  const combinado = normalizarSnakeTop5([...atuais, ...candidatos]);
  const idsFinaisNovos = combinado
    .filter(r => novosIds.has(r.id) || (r.dedupKey && novosDedup.has(r.dedupKey)))
    .map(r => r.id);

  if (!idsFinaisNovos.length) {
    return { entrouLista: false, novosIds: [], top5: atuais };
  }

  S.snakeTop5 = combinado;
  save();
  if (!opts.skipImmediateSync && supabaseConfigurado() && (typeof navigator === 'undefined' || navigator.onLine !== false)) {
    clearTimeout(sbSyncTimer);
    enviarEstadoParaNuvem();
  }
  return { entrouLista: true, novosIds: idsFinaisNovos, top5: combinado };
}
function touchCronograma(turma, isNew = false, ts = new Date().toISOString()) {
  const nome = String(turma || '').trim();
  const k = norm(nome);
  if (!k || k === '__proto__' || k === 'constructor' || k === 'prototype') return;
  S.cronogramas = (S.cronogramas && typeof S.cronogramas === 'object' && !Array.isArray(S.cronogramas)) ? S.cronogramas : {};
  const cur = Object.prototype.hasOwnProperty.call(S.cronogramas, k) ? S.cronogramas[k] : null;
  if (cur && typeof cur === 'object') {
    cur.nome = nome || cur.nome || '';
    cur.updatedAt = ts;
  } else {
    S.cronogramas[k] = {
      nome,
      createdAt: isNew ? ts : '',
      updatedAt: ts
    };
  }
}
const wd = d => {
  if (!d || typeof d !== 'string') return '';
  const dt = new Date(d + 'T12:00');
  return isNaN(dt) ? '' : dt.toLocaleDateString('pt-BR', { weekday: 'short' });
};
const norm = s => _normTxtCore(s);
const find = (l, id) => (S[l] || []).find(x => x.id === id);
function buscarProfessorCadastro(nomeOuApelido) {
  const nq = _normTxtCore(nomeOuApelido);
  if (!nq || !S || !Array.isArray(S.professores)) return null;
  const exato = S.professores.find(p => p && _normTxtCore(p.name) === nq);
  if (exato) return exato;
  return S.professores.find(p => p && Array.isArray(p.aliases) && p.aliases.some(a => _normTxtCore(a) === nq)) || null;
}
function expandirCorpusProfessor(nomeOuApelido) {
  const bruto = String(nomeOuApelido ?? '').trim();
  if (!bruto) return '';
  const prof = buscarProfessorCadastro(bruto);
  if (prof) {
    return [bruto, prof.name, ...(prof.aliases || []), ...(prof.subjects || [])].filter(Boolean).join(' ');
  }
  return bruto;
}
const getBuscaTermos = () => (typeof buscaGlobalTermo === 'string' && buscaGlobalTermo.trim())
  ? norm(buscaGlobalTermo).split(/\s+/).filter(Boolean)
  : [];
const matchBusca = (corpus, termos = getBuscaTermos()) => {
  if (!termos || !termos.length) return true;
  const txt = norm(corpus);
  return termos.every(t => txt.includes(t));
};

function icoSeta(tipo, size = 15) {
  const paths = {
    down: '<polyline points="6 9 12 15 18 9"></polyline>',
    up: '<polyline points="18 15 12 9 6 15"></polyline>',
    left: '<polyline points="15 18 9 12 15 6"></polyline>',
    right: '<polyline points="9 18 15 12 9 6"></polyline>',
    'arrow-left': '<line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline>',
    'arrow-right': '<line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline>',
    'trend-up': '<polyline points="22 7 13.5 15.5 8.5 10.5 2 17"></polyline><polyline points="16 7 22 7 22 13"></polyline>',
    'trend-down': '<polyline points="22 17 13.5 8.5 8.5 13.5 2 7"></polyline><polyline points="16 17 22 17 22 11"></polyline>'
  };
  const safeTipo = Object.prototype.hasOwnProperty.call(paths, tipo) ? tipo : 'right';
  const safeSize = Math.max(8, Math.min(64, parseInt(size, 10) || 15));
  return `<svg class="ico-seta ico-${safeTipo}" width="${safeSize}" height="${safeSize}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[safeTipo]}</svg>`;
}

// Cálculo do consumo do localStorage
function getStorageUsage() {
  let bytes = 0;
  try {
    for (let k in localStorage) {
      if (Object.prototype.hasOwnProperty.call(localStorage, k)) {
        bytes += ((localStorage[k] || '').length + k.length) * 2;
      }
    }
  } catch (e) {}
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
const itemTotal = i => {
  if (i && i.qtd !== undefined && i.qtd !== '' && i.valorUnd !== undefined && i.valorUnd !== '' && (i.precoSemFrete === undefined || i.precoSemFrete === '') && !i.preco) {
    return Math.max(0, num(i.qtd)) * num(i.valorUnd);
  }
  return itemPrecoSemFrete(i) + itemFrete(i);
};

// Notificações e utilitários de interface
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
    el.innerHTML = '<span class="ui-glyph" aria-hidden="true">⚠\uFE0E</span> Confirmar?';
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
        ? `<span class="pill w card-count-badge" title="${n} item(ns)">${n}</span>` 
        : `<span class="pill o card-dot-badge" aria-hidden="true"></span>`;
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

// Registra o núcleo global como pronto após toda a inicialização de estado, banco e utilitários
PriusBus.register('core', []);
