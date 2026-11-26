/* ========================================================
   SNAKE.JS - EASTER EGG MULTIPLAYER ONLINE (ATÉ 3 JOGADORES)
   Ativação: Clicar 5x no logótipo ou digitar "snake"
   Controles: Setas / WASD / Espaço (Nova Rodada) / Esc (Sair)
   Infraestrutura: Supabase Realtime (Presence + Broadcast) via sbClient
======================================================== */

(function () {
  let easterEggClicks = 0;
  let easterEggTimer = null;
  let bufferTeclas = '';

  function estaEditandoTexto(target) {
    if (!target) return false;
    return target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || !!target.isContentEditable;
  }

  let gatilhosSnakeRegistrados = false;
  function registrarGatilhosSnake() {
    if (gatilhosSnakeRegistrados) return;
    gatilhosSnakeRegistrados = true;

    // 1. Escuta silenciosa para abrir o jogo (só roda fora de inputs / áreas editáveis)
    window.addEventListener('keydown', e => {
      if (estaEditandoTexto(e.target)) return;

      if (e.key === 'Escape' && document.getElementById('modalSnake')) {
        fecharSnake();
        return;
      }

      if (e.key && e.key.length === 1) {
        bufferTeclas += e.key.toLowerCase();
        if (bufferTeclas.length > 10) bufferTeclas = bufferTeclas.slice(-10);

        if (bufferTeclas.endsWith('snake')) {
          bufferTeclas = '';
          abrirSnake();
        }
      }
    });

    // 2. Escuta de 5 cliques rápidos no título / logo Badge Tech
    document.addEventListener('click', e => {
      const el = e.target.closest('#appBrandTitle, .brand-badge-tech, h1, .top h1, [data-brand]');
      if (!el) return;

      easterEggClicks++;
      clearTimeout(easterEggTimer);
      easterEggTimer = setTimeout(() => { easterEggClicks = 0; }, 1200);

      if (easterEggClicks >= 5) {
        easterEggClicks = 0;
        abrirSnake();
      }
    });
  }

  if (typeof PriusBus !== 'undefined') {
    PriusBus.register('snake', ['core'], registrarGatilhosSnake, { dom: true });
  } else {
    registrarGatilhosSnake();
  }

  const SLOT_CORES = {
    1: { head: '#f59e0b', body: '#d97706', tag: 'J1', nome: 'Jogador 1' },
    2: { head: '#10b981', body: '#059669', tag: 'J2', nome: 'Jogador 2' },
    3: { head: '#38bdf8', body: '#0284c7', tag: 'J3', nome: 'Jogador 3' }
  };

  const TICK_MS = 165;
  const DEAD_RECKONING_MS = 190;
  const INATIVIDADE_TIMEOUT_MS = 4000;
  const NICK_STORAGE_KEY = (typeof KEY === 'string' ? KEY : 'prius-painel-v2') + '-snake-nick';

  let jogoLoop = null;
  let fallbackTimer = null;
  let appleFallbackTimer = null;
  let tickerInterval = null;
  let tickerAnimTimer = null;
  let handlerTeclasJogo = null;
  let resetarRodadaFn = null;
  let snakeChannel = null;
  let unsubscribeSyncBus = null;

  function gerarIdUnicoInstancia() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return 'p_' + crypto.randomUUID();
    }
    return 'p_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 9);
  }

  function limparNomeJogador(raw) {
    if (typeof normalizarNomeSnake === 'function') return normalizarNomeSnake(raw);
    const limpo = String(raw ?? '').replace(/[\u0000-\u001F\u007F]/g, '').trim().slice(0, 24);
    return limpo || 'Operador';
  }

  function lerNickSalvo() {
    try {
      return String(localStorage.getItem(NICK_STORAGE_KEY) || '').trim().slice(0, 24);
    } catch (e) {
      return '';
    }
  }

  function salvarNickLocal(val) {
    try {
      localStorage.setItem(NICK_STORAGE_KEY, String(val || '').trim().slice(0, 24));
    } catch (e) {}
  }

  function escaparHtml(s) {
    if (typeof esc === 'function') return esc(s);
    return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function obterListaTop5() {
    const raw = (typeof S !== 'undefined' && S && Array.isArray(S.snakeTop5)) ? S.snakeTop5 : [];
    if (typeof normalizarSnakeTop5 === 'function') return normalizarSnakeTop5(raw);
    return raw
      .filter(r => r && Number(r.score) > 0)
      .sort((a, b) => (b.score - a.score) || ((a.ts || 0) - (b.ts || 0)))
      .slice(0, 5);
  }

  function abrirSnake() {
    if (document.getElementById('modalSnake')) return;

    const playerId = gerarIdUnicoInstancia();
    const nickInicial = lerNickSalvo();

    const modal = document.createElement('div');
    modal.id = 'modalSnake';
    modal.className = 'snake-modal-overlay';

    modal.innerHTML = `
      <div class="snake-modal-card" role="dialog" aria-modal="true" aria-label="Snake ARGOS OPS Arena">
        <div class="snake-modal-header">
          <div class="snake-modal-title-group">
            <b class="snake-modal-title">Snake ARGOS OPS Arena</b>
            <span id="snakeModoBadge" class="pill" style="font-size: 11px; padding: 2px 9px;">● Conectando...</span>
            <span id="snakeRoundStatus" class="snake-round-status"></span>
          </div>
          <div class="snake-modal-actions">
            <label class="snake-nick-field" for="snakePlayerNameInput" title="Nome exibido na partida e no Top 5">
              <span class="snake-nick-label">Operador</span>
              <input id="snakePlayerNameInput" class="snake-nick-input" type="text" maxlength="24" placeholder="Operador" value="${escaparHtml(nickInicial)}" autocomplete="off">
            </label>
            <button id="btnReiniciarSnake" class="b p" disabled style="font-size: 12px; padding: 5px 11px; opacity: 0.42; cursor: not-allowed;">↻ Reiniciar</button>
            <button id="btnFecharSnake" class="x snake-close-btn" title="Fechar (Esc)" aria-label="Fechar Snake">✕</button>
          </div>
        </div>

        <div id="snakeScoreboard" class="snake-scoreboard"></div>

        <div class="snake-canvas-wrap">
          <canvas id="canvasSnake" class="snake-canvas" width="800" height="800"></canvas>

          <div id="snakeEliminadoBanner" class="snake-status-banner is-eliminated" style="display: none;">
            <span class="ui-glyph" aria-hidden="true">⚠\uFE0E</span> Você foi eliminado! Aguardando os outros jogadores terminarem...
          </div>

          <div id="snakeEspectadorBanner" class="snake-status-banner is-spectator" style="display: none;">
            Sala cheia (3/3) — Modo Espectador
          </div>

          <div id="snakeOverlayGameOver" class="snake-gameover-overlay" style="display: none;">
            <span class="snake-gameover-title">Fim de Rodada!</span>
            <div id="snakeNewRecordBanner" class="snake-new-record-banner" style="display: none;">
              <span class="ui-glyph" aria-hidden="true">★</span> Novo recorde no Top 5
            </div>
            <div id="snakeRankingFinal" class="snake-ranking-final"></div>
            <button id="btnTentarNovamenteSnake" class="b p snake-retry-btn">↻ Nova Rodada (Espaço)</button>
          </div>
        </div>

        <div id="snakeTop5Ticker" class="snake-top5-ticker" aria-live="polite" aria-label="Top 5 Recordes">
          <div id="snakeTop5TickerItem" class="snake-top5-ticker-item"></div>
        </div>

        <div class="snake-modal-footer">
          Setas ou WASD para mover • <b>Espaço</b> nova rodada (ao fim) • <b>Esc</b> fecha
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    document.getElementById('btnFecharSnake').onclick = fecharSnake;
    document.getElementById('btnReiniciarSnake').onclick = () => { if (resetarRodadaFn) resetarRodadaFn(); };
    document.getElementById('btnTentarNovamenteSnake').onclick = () => { if (resetarRodadaFn) resetarRodadaFn(); };

    modal.onclick = e => { if (e.target === modal) fecharSnake(); };

    iniciarMotorSnake(playerId);
  }

  async function fecharSnake() {
    const modal = document.getElementById('modalSnake');
    if (!modal || modal.dataset.fechando === '1') return;
    modal.dataset.fechando = '1';

    if (fallbackTimer) {
      clearTimeout(fallbackTimer);
      fallbackTimer = null;
    }
    if (appleFallbackTimer) {
      clearTimeout(appleFallbackTimer);
      appleFallbackTimer = null;
    }
    if (tickerInterval) {
      clearInterval(tickerInterval);
      tickerInterval = null;
    }
    if (tickerAnimTimer) {
      clearTimeout(tickerAnimTimer);
      tickerAnimTimer = null;
    }
    if (jogoLoop) {
      clearInterval(jogoLoop);
      jogoLoop = null;
    }
    if (handlerTeclasJogo) {
      window.removeEventListener('keydown', handlerTeclasJogo);
      handlerTeclasJogo = null;
    }
    if (typeof unsubscribeSyncBus === 'function') {
      try { unsubscribeSyncBus(); } catch (e) {}
      unsubscribeSyncBus = null;
    }

    if (snakeChannel) {
      const ch = snakeChannel;
      snakeChannel = null;
      try {
        await Promise.race([
          Promise.resolve(ch.untrack()),
          new Promise(res => setTimeout(res, 250))
        ]);
      } catch (e) {}
      try {
        if (typeof sbClient !== 'undefined' && sbClient && typeof sbClient.removeChannel === 'function') {
          await Promise.resolve(sbClient.removeChannel(ch));
        }
      } catch (e) {}
    }

    resetarRodadaFn = null;
    if (modal.isConnected) modal.remove();
  }

  function iniciarMotorSnake(playerId) {
    const canvas = document.getElementById('canvasSnake');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const scoreboardEl = document.getElementById('snakeScoreboard');
    const modoBadgeEl = document.getElementById('snakeModoBadge');
    const roundStatusEl = document.getElementById('snakeRoundStatus');
    const btnReiniciar = document.getElementById('btnReiniciarSnake');
    const overlayGameOver = document.getElementById('snakeOverlayGameOver');
    const rankingFinalEl = document.getElementById('snakeRankingFinal');
    const newRecordBannerEl = document.getElementById('snakeNewRecordBanner');
    const top5TickerItemEl = document.getElementById('snakeTop5TickerItem');
    const nickInputEl = document.getElementById('snakePlayerNameInput');
    const eliminadoBanner = document.getElementById('snakeEliminadoBanner');
    const espectadorBanner = document.getElementById('snakeEspectadorBanner');

    const gridSize = 20;
    const tileCount = canvas.width / gridSize; // 800 / 20 = 40
    const myJoinedAt = Date.now();

    let modoMultiplayer = false;
    let inicializado = false;
    let mySlot = 1; // 1, 2, 3 ou 0 (espectador)
    let myRoundSeq = 1;
    let mySnake = [];
    let dx = 1, dy = 0;
    let inputQueue = [];
    let myScore = 0;
    let myAlive = true;
    let apples = [];

    let rodadaRegistradaNoRanking = false;
    let novosRecordesIds = new Set();
    let teveNovoRecordeNaRodada = false;
    let tickerIndex = 0;

    // Estado remoto dos outros jogadores:
    // { [id]: { id, slot, name, roundSeq, joinedAt, score, alive, snake, dx, dy, ts, lastPacketTime, timedOut } }
    let remotePlayers = {};
    const leftIds = new Set();

    function obterMeuNome() {
      return limparNomeJogador(nickInputEl ? nickInputEl.value : lerNickSalvo());
    }

    function obterSequenciaTicker() {
      const lista = obterListaTop5();
      return lista.map((item, idx) => ({ rank: idx + 1, item })).reverse();
    }

    function aplicarConteudoTicker(entrada) {
      if (!top5TickerItemEl) return;
      if (!entrada) {
        top5TickerItemEl.className = 'snake-top5-ticker-item is-empty';
        top5TickerItemEl.textContent = 'Sem recordes registrados — jogue para estrear o Top 5';
        return;
      }

      const { rank, item } = entrada;
      const isFirst = rank === 1;
      const isNew = novosRecordesIds.has(item.id);
      top5TickerItemEl.className = [
        'snake-top5-ticker-item',
        isFirst ? 'is-first' : '',
        isNew ? 'is-new-record' : ''
      ].filter(Boolean).join(' ');

      const prefixo = isFirst
        ? `<span class="ui-glyph snake-ticker-star" aria-hidden="true">★</span> 1º`
        : `${rank}º`;

      top5TickerItemEl.innerHTML = `${prefixo} • <span class="snake-ticker-name">${escaparHtml(item.name)}</span> — <span class="snake-ticker-pts">${item.score} pts</span> <span class="snake-ticker-date">(${escaparHtml(item.date)})</span>`;
    }

    function renderTop5Recordes(comTransicao = false, preferirId = '') {
      if (!top5TickerItemEl) return;
      const seq = obterSequenciaTicker();

      if (!seq.length) {
        tickerIndex = 0;
        aplicarConteudoTicker(null);
        return;
      }

      if (preferirId) {
        const idxPreferido = seq.findIndex(e => e.item.id === preferirId);
        if (idxPreferido !== -1) tickerIndex = idxPreferido;
      }
      if (tickerIndex >= seq.length || tickerIndex < 0) tickerIndex = 0;

      const atual = seq[tickerIndex];

      if (!comTransicao || seq.length <= 1) {
        aplicarConteudoTicker(atual);
        return;
      }

      if (tickerAnimTimer) {
        clearTimeout(tickerAnimTimer);
        tickerAnimTimer = null;
      }

      top5TickerItemEl.classList.remove('is-entering');
      top5TickerItemEl.classList.add('is-leaving');

      tickerAnimTimer = setTimeout(() => {
        tickerAnimTimer = null;
        if (!document.getElementById('modalSnake') || !top5TickerItemEl) return;
        aplicarConteudoTicker(atual);
        top5TickerItemEl.classList.remove('is-leaving');
        top5TickerItemEl.classList.add('is-entering');

        const finalizarEntrada = () => {
          if (top5TickerItemEl) top5TickerItemEl.classList.remove('is-entering');
        };
        if (typeof requestAnimationFrame === 'function') {
          requestAnimationFrame(() => requestAnimationFrame(finalizarEntrada));
        } else {
          setTimeout(finalizarEntrada, 16);
        }
      }, 170);
    }

    function iniciarRotacaoTicker() {
      if (tickerInterval) {
        clearInterval(tickerInterval);
        tickerInterval = null;
      }
      if (tickerAnimTimer) {
        clearTimeout(tickerAnimTimer);
        tickerAnimTimer = null;
      }
      tickerIndex = 0;
      renderTop5Recordes(false);

      tickerInterval = setInterval(() => {
        if (!document.getElementById('modalSnake')) return;
        const seq = obterSequenciaTicker();
        if (seq.length <= 1) return;
        tickerIndex = (tickerIndex + 1) % seq.length;
        renderTop5Recordes(true);
      }, 3500);
    }

    iniciarRotacaoTicker();

    if (typeof PriusBus !== 'undefined' && typeof PriusBus.on === 'function') {
      unsubscribeSyncBus = PriusBus.on('sync:updated', () => {
        if (document.getElementById('modalSnake')) {
          renderTop5Recordes(false);
        }
      });
    }

    if (nickInputEl) {
      nickInputEl.addEventListener('input', () => {
        salvarNickLocal(nickInputEl.value);
        transmitirPresenca();
        enviarMovimento();
        atualizarInterface();
        desenharArena();
      });
      nickInputEl.addEventListener('keydown', e => {
        if (e.key === 'Enter') {
          e.preventDefault();
          nickInputEl.blur();
        }
      });
    }

    function temSupabaseAtivo() {
      return typeof sbClient !== 'undefined' && !!sbClient && typeof sbClient.channel === 'function';
    }

    function obterJogadoresAtivos() {
      const meuNome = obterMeuNome();
      if (!modoMultiplayer) {
        return [{
          id: playerId,
          slot: 1,
          name: meuNome,
          roundSeq: myRoundSeq,
          joinedAt: myJoinedAt,
          score: myScore,
          alive: myAlive,
          snake: mySnake,
          dx,
          dy,
          isLocal: true
        }];
      }

      const lista = [];
      if (mySlot >= 1 && mySlot <= 3) {
        lista.push({
          id: playerId,
          slot: mySlot,
          name: meuNome,
          roundSeq: myRoundSeq,
          joinedAt: myJoinedAt,
          score: myScore,
          alive: myAlive,
          snake: mySnake,
          dx,
          dy,
          isLocal: true
        });
      }

      Object.values(remotePlayers).forEach(rp => {
        if (rp.id !== playerId && rp.slot >= 1 && rp.slot <= 3 && !rp.timedOut) {
          lista.push({
            ...rp,
            name: limparNomeJogador(rp.name),
            roundSeq: rp.roundSeq || 1,
            isLocal: false
          });
        }
      });

      return lista.sort((a, b) => a.slot - b.slot);
    }

    function obterTodosCorposOcupados(ignorarLocal = false) {
      const ocupados = new Set();
      if (!ignorarLocal && myAlive && mySnake.length) {
        mySnake.forEach(p => ocupados.add(`${p.x},${p.y}`));
      }
      Object.values(remotePlayers).forEach(rp => {
        if (rp.id !== playerId && rp.alive && !rp.timedOut && Array.isArray(rp.snake)) {
          rp.snake.forEach(p => ocupados.add(`${p.x},${p.y}`));
        }
      });
      return ocupados;
    }

    function gerarMacaLivre(extrasOcupados) {
      const ocupados = obterTodosCorposOcupados(false);
      apples.forEach(a => ocupados.add(`${a.x},${a.y}`));
      if (extrasOcupados) extrasOcupados.forEach(k => ocupados.add(k));

      for (let tent = 0; tent < 400; tent++) {
        const x = Math.floor(Math.random() * tileCount);
        const y = Math.floor(Math.random() * tileCount);
        if (!ocupados.has(`${x},${y}`)) return { x, y };
      }

      for (let x = 0; x < tileCount; x++) {
        for (let y = 0; y < tileCount; y++) {
          if (!ocupados.has(`${x},${y}`)) return { x, y };
        }
      }
      return { x: 10, y: 10 };
    }

    function quantidadeAlvoMacas() {
      return modoMultiplayer ? 2 : 1;
    }

    function preencherMacas(transmitir = false) {
      const alvo = quantidadeAlvoMacas();
      let alterou = false;

      if (apples.length > alvo) {
        apples = apples.slice(0, alvo);
        alterou = true;
      }
      while (apples.length < alvo) {
        apples.push(gerarMacaLivre());
        alterou = true;
      }

      if (alterou && transmitir) {
        enviarFoodSync();
      }
    }

    function gerarPosicaoSegura() {
      const ocupados = obterTodosCorposOcupados(true);
      apples.forEach(a => ocupados.add(`${a.x},${a.y}`));

      const zonaPerigo = new Set(ocupados);
      Object.values(remotePlayers).forEach(rp => {
        if (rp.alive && !rp.timedOut && Array.isArray(rp.snake) && rp.snake[0]) {
          const h = rp.snake[0];
          for (let ox = -3; ox <= 3; ox++) {
            for (let oy = -3; oy <= 3; oy++) {
              zonaPerigo.add(`${h.x + ox},${h.y + oy}`);
            }
          }
        }
      });

      const dirs = [
        { dx: 1, dy: 0 },
        { dx: -1, dy: 0 },
        { dx: 0, dy: 1 },
        { dx: 0, dy: -1 }
      ];

      for (let tent = 0; tent < 350; tent++) {
        const d = dirs[Math.floor(Math.random() * dirs.length)];
        const hx = 6 + Math.floor(Math.random() * (tileCount - 12));
        const hy = 6 + Math.floor(Math.random() * (tileCount - 12));
        const segs = [
          { x: hx, y: hy },
          { x: hx - d.dx, y: hy - d.dy },
          { x: hx - d.dx * 2, y: hy - d.dy * 2 }
        ];
        const frente = [
          { x: hx + d.dx, y: hy + d.dy },
          { x: hx + d.dx * 2, y: hy + d.dy * 2 },
          { x: hx + d.dx * 3, y: hy + d.dy * 3 }
        ];

        const livre = [...segs, ...frente].every(p => !zonaPerigo.has(`${p.x},${p.y}`));
        if (livre) return { snake: segs, dx: d.dx, dy: d.dy };
      }

      const fallbackY = Math.min(tileCount - 6, 8 + ((mySlot || 1) * 9));
      return {
        snake: [{ x: 10, y: fallbackY }, { x: 9, y: fallbackY }, { x: 8, y: fallbackY }],
        dx: 1,
        dy: 0
      };
    }

    function transmitirPresenca() {
      if (!snakeChannel) return;
      try {
        snakeChannel.track({
          id: playerId,
          joinedAt: myJoinedAt,
          slot: mySlot,
          name: obterMeuNome(),
          roundSeq: myRoundSeq,
          alive: myAlive
        });
      } catch (e) {}
    }

    function enviarMovimento(dirOverride) {
      if (!snakeChannel || !modoMultiplayer || mySlot < 1 || mySlot > 3) return;
      const dirEnvio = dirOverride || { dx, dy };
      try {
        snakeChannel.send({
          type: 'broadcast',
          event: 'move',
          payload: {
            id: playerId,
            slot: mySlot,
            name: obterMeuNome(),
            roundSeq: myRoundSeq,
            snake: mySnake,
            dx: dirEnvio.dx,
            dy: dirEnvio.dy,
            score: myScore,
            alive: myAlive,
            ts: Date.now()
          }
        });
      } catch (e) {}
    }

    function enviarFoodSync() {
      if (!snakeChannel || !modoMultiplayer) return;
      try {
        snakeChannel.send({
          type: 'broadcast',
          event: 'food_sync',
          payload: {
            by: playerId,
            apples,
            ts: Date.now()
          }
        });
      } catch (e) {}
    }

    function registrarFimDeRodadaNoTop5(ativos) {
      if (rodadaRegistradaNoRanking) return;
      rodadaRegistradaNoRanking = true;
      novosRecordesIds = new Set();
      teveNovoRecordeNaRodada = false;

      if (typeof registrarScoresSnakeTop5 !== 'function') return;
      const entradas = ativos
        .filter(p => p && Math.floor(Number(p.score)) > 0)
        .map(p => ({
          name: limparNomeJogador(p.name),
          score: Math.floor(Number(p.score)),
          dedupKey: `${p.id}:${p.roundSeq || 1}:${Math.floor(Number(p.score))}`
        }));

      if (!entradas.length) return;

      const souCoordenador = !modoMultiplayer || (ativos[0] && ativos[0].isLocal);
      const res = registrarScoresSnakeTop5(entradas, { skipImmediateSync: !souCoordenador });
      if (res && res.entrouLista) {
        teveNovoRecordeNaRodada = true;
        novosRecordesIds = new Set(res.novosIds || []);
        const primeiroNovoId = (res.novosIds && res.novosIds[0]) || '';
        renderTop5Recordes(false, primeiroNovoId);
      }
    }

    function atualizarInterface() {
      const ativos = obterJogadoresAtivos();
      const vivos = ativos.filter(p => p.alive).length;
      const todosEliminados = ativos.length > 0 && vivos === 0;

      if (todosEliminados && !rodadaRegistradaNoRanking) {
        registrarFimDeRodadaNoTop5(ativos);
      }

      if (modoBadgeEl) {
        if (!modoMultiplayer) {
          modoBadgeEl.textContent = '● Modo Solo';
          modoBadgeEl.className = 'pill w';
        } else if (mySlot === 0) {
          modoBadgeEl.textContent = `○ Espectador (${ativos.length}/3)`;
          modoBadgeEl.className = 'pill b';
        } else {
          modoBadgeEl.textContent = `☁\uFE0E Online • ${ativos.length}/3`;
          modoBadgeEl.className = 'pill o';
        }
      }

      if (espectadorBanner) {
        espectadorBanner.style.display = (modoMultiplayer && mySlot === 0) ? 'block' : 'none';
      }

      if (eliminadoBanner) {
        eliminadoBanner.style.display = (mySlot >= 1 && !myAlive && !todosEliminados) ? 'block' : 'none';
      }

      if (btnReiniciar) {
        const bloqueado = vivos > 0;
        btnReiniciar.disabled = bloqueado;
        btnReiniciar.style.opacity = bloqueado ? '0.42' : '1';
        btnReiniciar.style.cursor = bloqueado ? 'not-allowed' : 'pointer';
        btnReiniciar.textContent = bloqueado ? '↻ Reiniciar' : '↻ Nova Rodada';
      }

      if (roundStatusEl) {
        if (!ativos.length) {
          roundStatusEl.textContent = 'Aguardando jogadores...';
        } else if (vivos > 0) {
          roundStatusEl.textContent = `Aguardando fim da rodada (${vivos} vivo${vivos > 1 ? 's' : ''})`;
        } else {
          roundStatusEl.textContent = 'Rodada encerrada!';
        }
      }

      if (scoreboardEl) {
        scoreboardEl.innerHTML = ativos.map(p => {
          const cor = SLOT_CORES[p.slot] || SLOT_CORES[1];
          const statusTxt = p.alive ? '● Jogando' : '✕ Eliminado';
          const nomeLimpo = escaparHtml(limparNomeJogador(p.name));
          const rotulo = p.isLocal ? `${cor.tag} • ${nomeLimpo} (Você)` : `${cor.tag} • ${nomeLimpo}`;
          const borda = p.isLocal ? `border-color: ${cor.head}; box-shadow: 0 0 0 1px ${cor.head}44;` : '';
          return `
            <div class="snake-score-chip" style="${borda}">
              <span style="width: 10px; height: 10px; border-radius: 999px; background: ${cor.head}; display: inline-block; flex-shrink: 0;"></span>
              <b class="snake-score-chip-name">${rotulo}</b>
              <span class="snake-score-chip-pts">${p.score} pts</span>
              <span style="font-size: 11.5px; color: ${p.alive ? 'var(--ok, #34d399)' : 'var(--er, #f87171)'}; font-weight: 600;">${statusTxt}</span>
            </div>
          `;
        }).join('') || '<span class="mu" style="font-size:12px;">Nenhum jogador ativo na arena</span>';
      }

      if (overlayGameOver && rankingFinalEl) {
        if (todosEliminados) {
          const ranking = [...ativos].sort((a, b) => b.score - a.score || a.slot - b.slot);
          const medalhas = ['1º', '2º', '3º'];
          if (newRecordBannerEl) {
            newRecordBannerEl.style.display = teveNovoRecordeNaRodada ? 'inline-flex' : 'none';
          }
          rankingFinalEl.innerHTML = ranking.map((p, idx) => {
            const cor = SLOT_CORES[p.slot] || SLOT_CORES[1];
            const nomeLimpo = escaparHtml(limparNomeJogador(p.name));
            const rotulo = p.isLocal ? `${nomeLimpo} (Você)` : nomeLimpo;
            return `
              <div style="display: flex; align-items: center; justify-content: space-between; padding: 8px 12px; border-radius: 9px; background: rgba(255,255,255,0.06); border: 1px solid ${p.isLocal ? cor.head : 'rgba(255,255,255,0.1)'}; font-size: 13.5px;">
                <span style="display: inline-flex; align-items: center; gap: 8px; color: #fff;">
                  <span>${medalhas[idx] || `${idx + 1}º`}</span>
                  <span style="width: 10px; height: 10px; border-radius: 999px; background: ${cor.head}; display: inline-block;"></span>
                  <b>${rotulo}</b>
                </span>
                <b style="color: ${cor.head}; font-variant-numeric: tabular-nums;">${p.score} pts</b>
              </div>
            `;
          }).join('');
          overlayGameOver.style.display = 'flex';
        } else {
          if (newRecordBannerEl) newRecordBannerEl.style.display = 'none';
          overlayGameOver.style.display = 'none';
        }
      }
    }

    function reiniciarMinhaCobrinha(ehNovaRodada = true, forcarNovasMacas = false) {
      if (ehNovaRodada) {
        if (inicializado) myRoundSeq += 1;
        rodadaRegistradaNoRanking = false;
        novosRecordesIds = new Set();
        teveNovoRecordeNaRodada = false;
        renderTop5Recordes();
      }

      if (mySlot < 1 || mySlot > 3) {
        atualizarInterface();
        return;
      }

      const spawn = gerarPosicaoSegura();
      mySnake = spawn.snake;
      dx = spawn.dx;
      dy = spawn.dy;
      inputQueue = [];
      if (ehNovaRodada) myScore = 0;
      myAlive = true;

      const outrosAtivos = Object.values(remotePlayers).some(rp => rp.id !== playerId && !rp.timedOut && rp.slot >= 1);

      if (!modoMultiplayer || forcarNovasMacas || (!outrosAtivos && apples.length === 0)) {
        if (forcarNovasMacas) apples = [];
        preencherMacas(true);
      } else if (apples.length === 0) {
        // Aguarda food_sync dos jogadores já conectados; se não chegar em 600ms, gera localmente
        if (appleFallbackTimer) clearTimeout(appleFallbackTimer);
        appleFallbackTimer = setTimeout(() => {
          if (apples.length < quantidadeAlvoMacas()) {
            preencherMacas(true);
            desenharArena();
          }
        }, 600);
      }

      transmitirPresenca();
      enviarMovimento();
      atualizarInterface();
    }

    function solicitarReiniciarRodada() {
      const ativos = obterJogadoresAtivos();
      const vivos = ativos.filter(p => p.alive).length;
      if (vivos > 0) return;

      const agora = Date.now();
      Object.values(remotePlayers).forEach(rp => {
        rp.timedOut = false;
        rp.lastPacketTime = agora;
      });

      if (modoMultiplayer && snakeChannel) {
        try {
          snakeChannel.send({
            type: 'broadcast',
            event: 'reset_all',
            payload: { by: playerId, ts: agora }
          });
        } catch (e) {}
      }
      reiniciarMinhaCobrinha(true, true);
    }

    resetarRodadaFn = solicitarReiniciarRodada;

    function sincronizarPresenca() {
      if (!snakeChannel) return;
      const state = snakeChannel.presenceState() || {};
      const todos = [];

      Object.keys(state).forEach(key => {
        const arr = state[key];
        if (!Array.isArray(arr) || !arr.length) return;
        const meta = arr[arr.length - 1];
        if (meta && meta.id) todos.push(meta);
      });

      todos.sort((a, b) => (a.joinedAt || 0) - (b.joinedAt || 0) || String(a.id).localeCompare(String(b.id)));

      const idsAtivos = new Set(todos.map(x => x.id));
      let entrouNovoJogador = false;

      Object.keys(remotePlayers).forEach(id => {
        if (!idsAtivos.has(id)) delete remotePlayers[id];
      });

      const agora = Date.now();
      todos.forEach(p => {
        if (p.id === playerId) return;
        if (!remotePlayers[p.id]) entrouNovoJogador = true;
        const prev = remotePlayers[p.id] || {
          id: p.id,
          name: 'Operador',
          roundSeq: 1,
          snake: [],
          dx: 1,
          dy: 0,
          score: 0,
          lastPacketTime: agora,
          timedOut: false
        };
        const novoAlive = prev.timedOut
          ? false
          : (typeof p.alive === 'boolean' ? p.alive : (prev.alive !== false));
        remotePlayers[p.id] = {
          ...prev,
          id: p.id,
          joinedAt: p.joinedAt,
          slot: typeof p.slot === 'number' ? p.slot : prev.slot,
          name: typeof p.name === 'string' ? limparNomeJogador(p.name) : limparNomeJogador(prev.name),
          roundSeq: typeof p.roundSeq === 'number' ? p.roundSeq : (prev.roundSeq || 1),
          score: typeof prev.score === 'number' ? prev.score : 0,
          alive: novoAlive,
          lastPacketTime: prev.lastPacketTime || agora
        };
      });

      const slotsOcupadosPorOutros = new Set();
      todos.forEach(p => {
        if (p.id === playerId) return;
        if (p.slot >= 1 && p.slot <= 3 && !slotsOcupadosPorOutros.has(p.slot)) {
          slotsOcupadosPorOutros.add(p.slot);
        }
      });

      const meuAntes = mySlot;
      const temConflitoComPrioridade = todos.some(p =>
        p.id !== playerId &&
        p.slot === mySlot &&
        mySlot >= 1 &&
        ((p.joinedAt || 0) < myJoinedAt || ((p.joinedAt || 0) === myJoinedAt && String(p.id) < playerId))
      );

      if (!inicializado || mySlot === 0 || temConflitoComPrioridade) {
        const livre = [1, 2, 3].find(s => !slotsOcupadosPorOutros.has(s));
        mySlot = livre || 0;
        if (mySlot !== meuAntes) {
          transmitirPresenca();
        }
      }

      if (!inicializado) {
        inicializado = true;
        if (mySlot >= 1 && mySlot <= 3) {
          reiniciarMinhaCobrinha(true, false);
        } else {
          myAlive = false;
          mySnake = [];
          transmitirPresenca();
          atualizarInterface();
        }
        iniciarLoops();
      } else if (meuAntes === 0 && mySlot >= 1 && mySlot <= 3) {
        reiniciarMinhaCobrinha(true, false);
      } else {
        if (temConflitoComPrioridade && mySlot >= 1 && mySlot <= 3) {
          enviarMovimento();
        }
        // Quando um novo jogador entra na sala, os jogadores ativos respondem enviando as maçãs atuais e seu estado
        if (entrouNovoJogador) {
          if (mySlot >= 1 && mySlot <= 3) enviarMovimento();
          if (apples.length > 0) enviarFoodSync();
        }
        atualizarInterface();
      }
    }

    function desenharArena() {
      ctx.fillStyle = '#111215';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Grade sutil 40x40
      ctx.strokeStyle = '#181a1f';
      ctx.lineWidth = 1;
      for (let x = 0; x <= canvas.width; x += gridSize) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
      }
      for (let y = 0; y <= canvas.height; y += gridSize) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
      }

      // Maçãs
      apples.forEach(m => {
        const cx = m.x * gridSize + gridSize / 2;
        const cy = m.y * gridSize + gridSize / 2;
        ctx.fillStyle = '#ef4444';
        ctx.beginPath();
        ctx.arc(cx, cy, gridSize * 0.38, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#fca5a5';
        ctx.beginPath();
        ctx.arc(cx - 2.5, cy - 2.5, 2.2, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#22c55e';
        ctx.fillRect(cx - 1, m.y * gridSize + 2, 3, 4);
      });

      // Cobrinhas vivas
      const ativos = obterJogadoresAtivos();
      ativos.forEach(p => {
        if (!p.alive || !Array.isArray(p.snake) || !p.snake.length) return;
        const cor = SLOT_CORES[p.slot] || SLOT_CORES[1];

        p.snake.forEach((seg, idx) => {
          const px = seg.x * gridSize + 1.5;
          const py = seg.y * gridSize + 1.5;
          const sz = gridSize - 3;
          ctx.fillStyle = idx === 0 ? cor.head : cor.body;

          if (typeof ctx.roundRect === 'function') {
            ctx.beginPath();
            ctx.roundRect(px, py, sz, sz, idx === 0 ? 5 : 3.5);
            ctx.fill();
          } else {
            ctx.fillRect(px, py, sz, sz);
          }

          if (idx === 0) {
            ctx.fillStyle = '#111215';
            const vx = p.dx || 0;
            const vy = p.dy || 0;
            if (vx !== 0) {
              const ex = vx > 0 ? px + sz - 5 : px + 3;
              ctx.fillRect(ex, py + 3.5, 2.5, 2.5);
              ctx.fillRect(ex, py + sz - 6, 2.5, 2.5);
            } else {
              const ey = vy > 0 ? py + sz - 5 : py + 3;
              ctx.fillRect(px + 3.5, ey, 2.5, 2.5);
              ctx.fillRect(px + sz - 6, ey, 2.5, 2.5);
            }
          }
        });

        const cabeca = p.snake[0];
        ctx.font = 'bold 10px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        const nomeTag = limparNomeJogador(p.name).slice(0, 12);
        ctx.fillText(p.isLocal ? `${nomeTag} (Você)` : nomeTag, cabeca.x * gridSize + gridSize / 2, Math.max(11, cabeca.y * gridSize - 3));
      });
    }

    function atualizarJogadoresRemotosNoTick() {
      const agora = Date.now();
      let houveRemocao = false;

      Object.keys(remotePlayers).forEach(id => {
        const rp = remotePlayers[id];
        if (!rp || rp.id === playerId) return;

        const semRespostaHa = agora - (rp.lastPacketTime || agora);

        // Remove jogador vivo inativo (aba minimizada/travada) após 4 segundos sem pacotes
        if (rp.alive && semRespostaHa > INATIVIDADE_TIMEOUT_MS) {
          delete remotePlayers[id];
          houveRemocao = true;
          return;
        }

        // Previsão inteligente sem rubber-banding: só prevê se atrasou > 190ms
        if (rp.alive && Array.isArray(rp.snake) && rp.snake.length > 0 && semRespostaHa > DEAD_RECKONING_MS) {
          const cabeca = rp.snake[0];
          const nx = cabeca.x + (rp.dx || 0);
          const ny = cabeca.y + (rp.dy || 0);
          if (nx >= 0 && nx < tileCount && ny >= 0 && ny < tileCount) {
            rp.snake.unshift({ x: nx, y: ny });
            rp.snake.pop();
          }
        }
      });

      if (houveRemocao) {
        atualizarInterface();
      }
    }

    function passoDoJogo() {
      if (modoMultiplayer) {
        atualizarJogadoresRemotosNoTick();
      }

      if (mySlot >= 1 && mySlot <= 3 && myAlive && mySnake.length) {
        // 1. Consome a próxima direção da fila de comandos (Input Queue)
        if (inputQueue.length > 0) {
          const proximo = inputQueue.shift();
          dx = proximo.dx;
          dy = proximo.dy;
        }

        const head = { x: mySnake[0].x + dx, y: mySnake[0].y + dy };

        // Colisão com bordas ou próprio corpo
        let bateu =
          head.x < 0 || head.x >= tileCount ||
          head.y < 0 || head.y >= tileCount ||
          mySnake.some(p => p.x === head.x && p.y === head.y);

        // Colisão com outras cobrinhas vivas
        if (!bateu) {
          for (const rp of Object.values(remotePlayers)) {
            if (rp.id !== playerId && rp.alive && !rp.timedOut && Array.isArray(rp.snake)) {
              if (rp.snake.some(p => p.x === head.x && p.y === head.y)) {
                bateu = true;
                break;
              }
            }
          }
        }

        if (bateu) {
          myAlive = false;
          mySnake = [];
          inputQueue = [];
          transmitirPresenca();
          enviarMovimento();
          atualizarInterface();
        } else {
          mySnake.unshift(head);

          const idxMaca = apples.findIndex(a => a.x === head.x && a.y === head.y);
          if (idxMaca !== -1) {
            myScore += 10;
            apples.splice(idxMaca, 1);
            // 2. Sincronização descentralizada: quem come sorteia e transmite food_sync
            preencherMacas(true);
            atualizarInterface();
          } else {
            mySnake.pop();
          }

          enviarMovimento();
        }
      }

      if (apples.length < quantidadeAlvoMacas() && !modoMultiplayer) {
        preencherMacas(false);
      }

      desenharArena();
    }

    function iniciarLoops() {
      if (jogoLoop) clearInterval(jogoLoop);
      desenharArena();
      jogoLoop = setInterval(passoDoJogo, TICK_MS);
    }

    if (handlerTeclasJogo) window.removeEventListener('keydown', handlerTeclasJogo);

    handlerTeclasJogo = e => {
      if (!document.getElementById('modalSnake')) return;
      if (estaEditandoTexto(e.target)) return;

      // Impede rolagem da página ao fundo com setas enquanto o modal estiver aberto
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
      }

      if (e.code === 'Space') {
        e.preventDefault();
        solicitarReiniciarRodada();
        return;
      }

      if (mySlot < 1 || mySlot > 3 || !myAlive) return;
      if (inputQueue.length >= 2) return;

      const k = (e.key || '').toLowerCase();
      let ndx = 0, ndy = 0, ehDirecao = false;

      if (k === 'arrowup' || k === 'w') { ndx = 0; ndy = -1; ehDirecao = true; }
      else if (k === 'arrowdown' || k === 's') { ndx = 0; ndy = 1; ehDirecao = true; }
      else if (k === 'arrowleft' || k === 'a') { ndx = -1; ndy = 0; ehDirecao = true; }
      else if (k === 'arrowright' || k === 'd') { ndx = 1; ndy = 0; ehDirecao = true; }

      if (!ehDirecao) return;

      // Valida contra a última direção pendente na fila (ou direção atual)
      const ref = inputQueue.length > 0 ? inputQueue[inputQueue.length - 1] : { dx, dy };
      const ehInversao180 = (ndx === -ref.dx && ndy === -ref.dy);
      const ehIgual = (ndx === ref.dx && ndy === ref.dy);
      if (ehInversao180 || ehIgual) return;

      inputQueue.push({ dx: ndx, dy: ndy });
      // Envia Broadcast imediato com a próxima direção prevista
      enviarMovimento(inputQueue[0]);
    };

    window.addEventListener('keydown', handlerTeclasJogo);

    function iniciarSoloFallback() {
      if (inicializado) return;
      modoMultiplayer = false;
      inicializado = true;
      mySlot = 1;
      reiniciarMinhaCobrinha(true, true);
      iniciarLoops();
    }

    if (!temSupabaseAtivo()) {
      iniciarSoloFallback();
      return;
    }

    fallbackTimer = setTimeout(() => {
      if (!inicializado) {
        if (snakeChannel) {
          try { sbClient.removeChannel(snakeChannel); } catch (e) {}
          snakeChannel = null;
        }
        iniciarSoloFallback();
      }
    }, 3000);

    try {
      modoMultiplayer = true;
      snakeChannel = sbClient.channel('prius-snake-arena', {
        config: {
          presence: { key: playerId },
          broadcast: { self: false }
        }
      });

      snakeChannel
        .on('presence', { event: 'sync' }, () => {
          sincronizarPresenca();
        })
        .on('presence', { event: 'join' }, ({ newPresences }) => {
          if (Array.isArray(newPresences)) {
            newPresences.forEach(p => { if (p && p.id) leftIds.delete(p.id); });
          }
          sincronizarPresenca();
        })
        .on('presence', { event: 'leave' }, ({ leftPresences }) => {
          if (Array.isArray(leftPresences)) {
            leftPresences.forEach(p => { if (p && p.id) leftIds.add(p.id); });
          }
          sincronizarPresenca();
        })
        .on('broadcast', { event: 'move' }, msg => {
          const p = msg && msg.payload;
          if (!p || p.id === playerId || leftIds.has(p.id)) return;
          const prev = remotePlayers[p.id] || {};
          remotePlayers[p.id] = {
            ...prev,
            id: p.id,
            slot: p.slot,
            name: typeof p.name === 'string' ? limparNomeJogador(p.name) : limparNomeJogador(prev.name),
            roundSeq: typeof p.roundSeq === 'number' ? p.roundSeq : (prev.roundSeq || 1),
            joinedAt: prev.joinedAt || Date.now(),
            score: p.score || 0,
            alive: !!p.alive,
            snake: Array.isArray(p.snake) ? p.snake.map(s => ({ x: s.x, y: s.y })) : [],
            dx: p.dx ?? 1,
            dy: p.dy ?? 0,
            ts: p.ts || Date.now(),
            lastPacketTime: Date.now(),
            timedOut: false
          };
          atualizarInterface();
          if (!myAlive || mySlot === 0) desenharArena();
        })
        .on('broadcast', { event: 'food_sync' }, msg => {
          const p = msg && msg.payload;
          if (!p || !Array.isArray(p.apples)) return;
          if (appleFallbackTimer) {
            clearTimeout(appleFallbackTimer);
            appleFallbackTimer = null;
          }
          apples = p.apples.map(a => ({ x: a.x, y: a.y }));
          if (!myAlive || mySlot === 0) desenharArena();
        })
        .on('broadcast', { event: 'reset_all' }, () => {
          const agora = Date.now();
          apples = [];
          rodadaRegistradaNoRanking = false;
          novosRecordesIds = new Set();
          teveNovoRecordeNaRodada = false;
          renderTop5Recordes();
          Object.values(remotePlayers).forEach(rp => {
            rp.timedOut = false;
            rp.lastPacketTime = agora;
          });
          if (mySlot >= 1 && mySlot <= 3) {
            reiniciarMinhaCobrinha(true, false);
          } else {
            atualizarInterface();
          }
        })
        .subscribe(async status => {
          if (status === 'SUBSCRIBED') {
            if (fallbackTimer) {
              clearTimeout(fallbackTimer);
              fallbackTimer = null;
            }
            const st = snakeChannel.presenceState() || {};
            const ocupados = new Set();
            Object.values(st).forEach(arr => {
              if (Array.isArray(arr) && arr.length) {
                const m = arr[arr.length - 1];
                if (m && m.slot >= 1 && m.slot <= 3) ocupados.add(m.slot);
              }
            });
            mySlot = [1, 2, 3].find(s => !ocupados.has(s)) || 0;
            await snakeChannel.track({
              id: playerId,
              joinedAt: myJoinedAt,
              slot: mySlot,
              name: obterMeuNome(),
              roundSeq: myRoundSeq,
              alive: mySlot >= 1
            });
            sincronizarPresenca();
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            if (fallbackTimer) {
              clearTimeout(fallbackTimer);
              fallbackTimer = null;
            }
            iniciarSoloFallback();
          }
        });
    } catch (err) {
      console.error('Erro ao iniciar Snake Multiplayer, alternando para modo solo:', err);
      if (fallbackTimer) {
        clearTimeout(fallbackTimer);
        fallbackTimer = null;
      }
      iniciarSoloFallback();
    }
  }
})();