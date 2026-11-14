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

  // 2. Escuta de 5 cliques rápidos no título
  document.addEventListener('click', e => {
    const el = e.target.closest('h1, .top h1, [data-brand]');
    if (!el) return;

    easterEggClicks++;
    clearTimeout(easterEggTimer);
    easterEggTimer = setTimeout(() => { easterEggClicks = 0; }, 1200);

    if (easterEggClicks >= 5) {
      easterEggClicks = 0;
      abrirSnake();
    }
  });

  const SLOT_CORES = {
    1: { head: '#f59e0b', body: '#d97706', tag: 'J1', nome: 'Jogador 1' },
    2: { head: '#10b981', body: '#059669', tag: 'J2', nome: 'Jogador 2' },
    3: { head: '#38bdf8', body: '#0284c7', tag: 'J3', nome: 'Jogador 3' }
  };

  let jogoLoop = null;
  let renderLoop = null;
  let fallbackTimer = null;
  let handlerTeclasJogo = null;
  let resetarRodadaFn = null;
  let snakeChannel = null;

  function abrirSnake() {
    if (document.getElementById('modalSnake')) return;

    const modal = document.createElement('div');
    modal.id = 'modalSnake';
    modal.style.cssText = `
      position: fixed; inset: 0; background: rgba(0, 0, 0, 0.84);
      backdrop-filter: blur(6px); display: flex; flex-direction: column;
      align-items: center; justify-content: center; z-index: 99999;
      padding: 12px; box-sizing: border-box;
    `;

    modal.innerHTML = `
      <div style="background: var(--card, #1c1d22); border: 1px solid var(--bd, #2d2f36); border-radius: 14px; padding: 16px 18px; text-align: center; box-shadow: 0 20px 50px rgba(0,0,0,0.65); width: fit-content; max-width: 96vw; max-height: 96vh; display: flex; flex-direction: column; align-items: center; overflow-y: auto;">
        <div style="display: flex; justify-content: space-between; align-items: center; width: 100%; margin-bottom: 10px; gap: 12px; flex-wrap: wrap;">
          <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
            <b style="color: var(--ac, #f59e0b); font-size: 18px;">🐍 Snake Prius Arena</b>
            <span id="snakeModoBadge" class="pill" style="font-size: 11px; padding: 2px 9px;">⏳ Conectando...</span>
            <span id="snakeRoundStatus" style="font-size: 12px; color: var(--mu, #9ca3af); font-weight: 500;"></span>
          </div>
          <div style="display: flex; align-items: center; gap: 8px;">
            <button id="btnReiniciarSnake" class="b p" disabled style="font-size: 12px; padding: 5px 11px; opacity: 0.42; cursor: not-allowed;">🔄 Reiniciar</button>
            <button id="btnFecharSnake" class="x" style="padding: 2px 8px; font-size: 18px; cursor: pointer;" title="Fechar (Esc)">✕</button>
          </div>
        </div>

        <div id="snakeScoreboard" style="display: flex; flex-wrap: wrap; gap: 8px; width: 100%; justify-content: center; margin-bottom: 10px;"></div>

        <div style="position: relative; display: inline-block; max-width: 92vw;">
          <canvas id="canvasSnake" width="800" height="800" style="background: #111215; border: 2px solid var(--bd, #2d2f36); border-radius: 10px; display: block; width: min(74vh, 92vw, 800px); height: min(74vh, 92vw, 800px); max-width: 92vw; max-height: 74vh; aspect-ratio: 1/1;"></canvas>

          <div id="snakeEliminadoBanner" style="display: none; position: absolute; top: 10px; right: 10px; background: rgba(17, 18, 21, 0.9); border: 1px solid rgba(239, 68, 68, 0.45); color: #fca5a5; padding: 7px 12px; border-radius: 8px; font-size: 12px; font-weight: 600; pointer-events: none; box-shadow: 0 6px 18px rgba(0,0,0,0.45); max-width: 82%; text-align: left;">
            💀 Você foi eliminado! Aguardando os outros jogadores terminarem...
          </div>

          <div id="snakeEspectadorBanner" style="display: none; position: absolute; top: 10px; left: 10px; background: rgba(17, 18, 21, 0.9); border: 1px solid rgba(56, 189, 248, 0.45); color: #bae6fd; padding: 6px 11px; border-radius: 8px; font-size: 12px; font-weight: 600; pointer-events: none;">
            👀 Sala cheia (3/3) — Modo Espectador
          </div>

          <div id="snakeOverlayGameOver" style="display: none; position: absolute; inset: 0; background: rgba(10, 11, 14, 0.84); backdrop-filter: blur(3px); border-radius: 10px; flex-direction: column; align-items: center; justify-content: center; gap: 12px; padding: 20px; box-sizing: border-box;">
            <span style="color: #f59e0b; font-size: 24px; font-weight: 800; letter-spacing: -0.02em;">🏁 Fim de Rodada!</span>
            <div id="snakeRankingFinal" style="width: 100%; max-width: 340px; display: flex; flex-direction: column; gap: 6px;"></div>
            <button id="btnTentarNovamenteSnake" class="b p" style="font-size: 14px; padding: 9px 20px; font-weight: 700; cursor: pointer; margin-top: 4px;">🔄 Nova Rodada (Espaço)</button>
          </div>
        </div>

        <div style="margin-top: 10px; font-size: 12px; color: var(--mu, #8e929d);">
          Setas ou WASD para mover • <b>Espaço</b> nova rodada (ao fim) • <b>Esc</b> fecha
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    document.getElementById('btnFecharSnake').onclick = fecharSnake;
    document.getElementById('btnReiniciarSnake').onclick = () => { if (resetarRodadaFn) resetarRodadaFn(); };
    document.getElementById('btnTentarNovamenteSnake').onclick = () => { if (resetarRodadaFn) resetarRodadaFn(); };

    modal.onclick = e => { if (e.target === modal) fecharSnake(); };

    iniciarMotorSnake();
  }

  function fecharSnake() {
    const modal = document.getElementById('modalSnake');
    if (fallbackTimer) {
      clearTimeout(fallbackTimer);
      fallbackTimer = null;
    }
    if (jogoLoop) {
      clearInterval(jogoLoop);
      jogoLoop = null;
    }
    if (renderLoop) {
      clearInterval(renderLoop);
      renderLoop = null;
    }
    if (handlerTeclasJogo) {
      window.removeEventListener('keydown', handlerTeclasJogo);
      handlerTeclasJogo = null;
    }
    if (snakeChannel) {
      const ch = snakeChannel;
      snakeChannel = null;
      try { ch.untrack().catch(() => {}); } catch (e) {}
      try {
        if (typeof sbClient !== 'undefined' && sbClient && typeof sbClient.removeChannel === 'function') {
          sbClient.removeChannel(ch);
        }
      } catch (e) {}
    }
    resetarRodadaFn = null;
    if (modal) modal.remove();
  }

  function iniciarMotorSnake() {
    const canvas = document.getElementById('canvasSnake');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const scoreboardEl = document.getElementById('snakeScoreboard');
    const modoBadgeEl = document.getElementById('snakeModoBadge');
    const roundStatusEl = document.getElementById('snakeRoundStatus');
    const btnReiniciar = document.getElementById('btnReiniciarSnake');
    const overlayGameOver = document.getElementById('snakeOverlayGameOver');
    const rankingFinalEl = document.getElementById('snakeRankingFinal');
    const eliminadoBanner = document.getElementById('snakeEliminadoBanner');
    const espectadorBanner = document.getElementById('snakeEspectadorBanner');

    const gridSize = 20;
    const tileCount = canvas.width / gridSize; // 800 / 20 = 40

    const playerId = 'p_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
    const myJoinedAt = Date.now();

    let modoMultiplayer = false;
    let inicializado = false;
    let mySlot = 1; // 1, 2, 3 ou 0 (espectador)
    let mySnake = [];
    let dx = 1, dy = 0;
    let myScore = 0;
    let myAlive = true;
    let mudouDirecao = false;
    let apples = [];

    // Estado remoto dos outros jogadores: { [id]: { id, slot, joinedAt, score, alive, snake, dx, dy } }
    let remotePlayers = {};
    // Lista ordenada dos participantes com presença ativa no canal
    let presencaLista = [];
    // Guarda IDs recém-desconectados para ignorar pacotes atrasados em trânsito
    const leftIds = new Set();

    function temSupabaseAtivo() {
      return typeof sbClient !== 'undefined' && !!sbClient && typeof sbClient.channel === 'function';
    }

    function obterJogadoresAtivos() {
      if (!modoMultiplayer) {
        return [{
          id: playerId,
          slot: 1,
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
        if (rp.id !== playerId && rp.slot >= 1 && rp.slot <= 3) {
          lista.push({ ...rp, isLocal: false });
        }
      });

      return lista.sort((a, b) => a.slot - b.slot);
    }

    function obterHostId() {
      const ativos = obterJogadoresAtivos();
      if (!ativos.length) return playerId;
      return ativos.map(p => p.id).sort()[0];
    }

    function ehHost() {
      return !modoMultiplayer || obterHostId() === playerId;
    }

    function obterTodosCorposOcupados(ignorarLocal = false) {
      const ocupados = new Set();
      if (!ignorarLocal && myAlive && mySnake.length) {
        mySnake.forEach(p => ocupados.add(`${p.x},${p.y}`));
      }
      Object.values(remotePlayers).forEach(rp => {
        if (rp.id !== playerId && rp.alive && Array.isArray(rp.snake)) {
          rp.snake.forEach(p => ocupados.add(`${p.x},${p.y}`));
        }
      });
      return ocupados;
    }

    function gerarMacaLivre(ocupadosExtras) {
      const ocupados = obterTodosCorposOcupados(false);
      apples.forEach(a => ocupados.add(`${a.x},${a.y}`));
      if (ocupadosExtras) ocupadosExtras.forEach(k => ocupados.add(k));

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

    function garantirMacas(transmitir = false) {
      if (!ehHost()) return;
      const ativos = obterJogadoresAtivos();
      const alvo = ativos.length >= 2 ? 2 : 1;
      let alterou = false;

      if (apples.length > alvo) {
        apples = apples.slice(0, alvo);
        alterou = true;
      }
      while (apples.length < alvo) {
        apples.push(gerarMacaLivre());
        alterou = true;
      }

      if (alterou && transmitir) transmitirMacas();
    }

    function gerarPosicaoSegura() {
      const ocupados = obterTodosCorposOcupados(true);
      apples.forEach(a => ocupados.add(`${a.x},${a.y}`));

      // Evita nascer na cara de outra cobrinha viva
      const zonaPerigo = new Set(ocupados);
      Object.values(remotePlayers).forEach(rp => {
        if (rp.alive && Array.isArray(rp.snake) && rp.snake[0]) {
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
          score: myScore,
          alive: myAlive
        });
      } catch (e) {}
    }

    function transmitirEstadoCobrinha() {
      if (!snakeChannel || !modoMultiplayer || mySlot < 1 || mySlot > 3) return;
      try {
        snakeChannel.send({
          type: 'broadcast',
          event: 'snake_state',
          payload: {
            id: playerId,
            slot: mySlot,
            joinedAt: myJoinedAt,
            score: myScore,
            alive: myAlive,
            snake: mySnake,
            dx,
            dy
          }
        });
      } catch (e) {}
    }

    function transmitirMacas() {
      if (!snakeChannel || !modoMultiplayer || !ehHost()) return;
      try {
        snakeChannel.send({
          type: 'broadcast',
          event: 'apples_sync',
          payload: { hostId: playerId, apples }
        });
      } catch (e) {}
    }

    function transmitirMacaComida(apple) {
      if (!snakeChannel || !modoMultiplayer) return;
      try {
        snakeChannel.send({
          type: 'broadcast',
          event: 'apple_eaten',
          payload: { by: playerId, x: apple.x, y: apple.y }
        });
      } catch (e) {}
    }

    function atualizarInterface() {
      const ativos = obterJogadoresAtivos();
      const vivos = ativos.filter(p => p.alive).length;
      const todosEliminados = ativos.length > 0 && vivos === 0;

      if (modoBadgeEl) {
        if (!modoMultiplayer) {
          modoBadgeEl.textContent = '👤 Modo Solo';
          modoBadgeEl.className = 'pill w';
        } else if (mySlot === 0) {
          modoBadgeEl.textContent = `👀 Espectador (${ativos.length}/3)`;
          modoBadgeEl.className = 'pill b';
        } else {
          modoBadgeEl.textContent = `☁️ Online • ${ativos.length}/3`;
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
        btnReiniciar.textContent = bloqueado ? '🔄 Reiniciar' : '🔄 Nova Rodada';
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
          const statusTxt = p.alive ? '🟢 Jogando' : '💀 Eliminado';
          const rotulo = p.isLocal ? `${cor.nome} (Você)` : cor.nome;
          const borda = p.isLocal ? `border-color: ${cor.head}; box-shadow: 0 0 0 1px ${cor.head}44;` : '';
          return `
            <div style="display: inline-flex; align-items: center; gap: 8px; padding: 5px 11px; border-radius: 9px; background: var(--card-sub, #23252c); border: 1px solid var(--bd, #2d2f36); font-size: 12.5px; ${borda}">
              <span style="width: 10px; height: 10px; border-radius: 999px; background: ${cor.head}; display: inline-block; flex-shrink: 0;"></span>
              <b style="color: var(--tx, #fff);">${rotulo}</b>
              <span style="color: var(--ac, #f59e0b); font-weight: 700; font-variant-numeric: tabular-nums;">${p.score} pts</span>
              <span style="font-size: 11.5px; color: ${p.alive ? '#34d399' : '#f87171'}; font-weight: 600;">${statusTxt}</span>
            </div>
          `;
        }).join('') || '<span class="mu" style="font-size:12px;">Nenhum jogador ativo na arena</span>';
      }

      if (overlayGameOver && rankingFinalEl) {
        if (todosEliminados) {
          const ranking = [...ativos].sort((a, b) => b.score - a.score || a.slot - b.slot);
          const medalhas = ['🥇', '🥈', '🥉'];
          rankingFinalEl.innerHTML = ranking.map((p, idx) => {
            const cor = SLOT_CORES[p.slot] || SLOT_CORES[1];
            const rotulo = p.isLocal ? `${cor.nome} (Você)` : cor.nome;
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
          overlayGameOver.style.display = 'none';
        }
      }
    }

    function reiniciarMinhaCobrinha(ehNovaRodada = true) {
      if (mySlot < 1 || mySlot > 3) {
        atualizarInterface();
        return;
      }

      const spawn = gerarPosicaoSegura();
      mySnake = spawn.snake;
      dx = spawn.dx;
      dy = spawn.dy;
      if (ehNovaRodada) myScore = 0;
      myAlive = true;
      mudouDirecao = false;

      if (ehHost()) {
        if (ehNovaRodada) apples = [];
        garantirMacas(true);
      }

      transmitirPresenca();
      transmitirEstadoCobrinha();
      atualizarInterface();
    }

    function solicitarReiniciarRodada() {
      const ativos = obterJogadoresAtivos();
      const vivos = ativos.filter(p => p.alive).length;
      if (vivos > 0) return; // Bloqueado enquanto houver pelo menos 1 vivo

      if (modoMultiplayer && snakeChannel) {
        try {
          snakeChannel.send({
            type: 'broadcast',
            event: 'reset_all',
            payload: { by: playerId, ts: Date.now() }
          });
        } catch (e) {}
      }
      reiniciarMinhaCobrinha(true);
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

      // Ordenação determinística por chegada e ID
      todos.sort((a, b) => (a.joinedAt || 0) - (b.joinedAt || 0) || String(a.id).localeCompare(String(b.id)));
      presencaLista = todos;

      // Remove jogadores desconectados do mapa remoto
      const idsAtivos = new Set(todos.map(x => x.id));
      Object.keys(remotePlayers).forEach(id => {
        if (!idsAtivos.has(id)) delete remotePlayers[id];
      });

      // Atualiza metadados básicos de quem está presente
      todos.forEach(p => {
        if (p.id === playerId) return;
        const prev = remotePlayers[p.id] || { id: p.id, snake: [], dx: 1, dy: 0 };
        remotePlayers[p.id] = {
          ...prev,
          id: p.id,
          joinedAt: p.joinedAt,
          slot: typeof p.slot === 'number' ? p.slot : prev.slot,
          score: typeof p.score === 'number' ? p.score : (prev.score || 0),
          alive: typeof p.alive === 'boolean' ? p.alive : (prev.alive !== false)
        };
      });

      // Verifica slots ocupados por OUTROS jogadores com prioridade maior (ou já estáveis)
      const slotsOcupadosPorOutros = new Set();
      todos.forEach(p => {
        if (p.id === playerId) return;
        if (p.slot >= 1 && p.slot <= 3 && !slotsOcupadosPorOutros.has(p.slot)) {
          slotsOcupadosPorOutros.add(p.slot);
        }
      });

      // Resolve conflito caso dois jogadores entrem ao mesmo tempo no mesmo slot
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
          reiniciarMinhaCobrinha(true);
        } else {
          myAlive = false;
          mySnake = [];
          transmitirPresenca();
          atualizarInterface();
        }
        iniciarLoops();
      } else if (meuAntes === 0 && mySlot >= 1 && mySlot <= 3) {
        // Espectador acabou de ganhar vaga livre -> entra como drop-in!
        reiniciarMinhaCobrinha(true);
      } else {
        if (temConflitoComPrioridade && mySlot >= 1 && mySlot <= 3) {
          transmitirEstadoCobrinha();
        }
        if (ehHost()) {
          garantirMacas(true);
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

        // Brilho e folhinha
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

          // Olhinhos na cabeça
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

        // Tag discreta identificando J1/J2/J3 acima da cabeça
        const cabeca = p.snake[0];
        ctx.font = 'bold 10px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.fillText(p.isLocal ? `${cor.tag}•Você` : cor.tag, cabeca.x * gridSize + gridSize / 2, Math.max(11, cabeca.y * gridSize - 3));
      });
    }

    function passoDoJogo() {
      if (mySlot >= 1 && mySlot <= 3 && myAlive && mySnake.length) {
        mudouDirecao = false;
        const head = { x: mySnake[0].x + dx, y: mySnake[0].y + dy };

        // Colisão com bordas ou próprio corpo
        let bateu =
          head.x < 0 || head.x >= tileCount ||
          head.y < 0 || head.y >= tileCount ||
          mySnake.some(p => p.x === head.x && p.y === head.y);

        // Colisão com outras cobrinhas vivas
        if (!bateu) {
          for (const rp of Object.values(remotePlayers)) {
            if (rp.id !== playerId && rp.alive && Array.isArray(rp.snake)) {
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
          transmitirPresenca();
          transmitirEstadoCobrinha();
          atualizarInterface();
        } else {
          mySnake.unshift(head);

          const idxMaca = apples.findIndex(a => a.x === head.x && a.y === head.y);
          if (idxMaca !== -1) {
            const comida = apples[idxMaca];
            myScore += 10;
            apples.splice(idxMaca, 1);

            if (ehHost()) {
              garantirMacas(true);
            } else {
              transmitirMacaComida(comida);
            }
            transmitirPresenca();
            atualizarInterface();
          } else {
            mySnake.pop();
          }

          transmitirEstadoCobrinha();
        }
      }

      if (ehHost()) {
        garantirMacas(false);
      }
      desenharArena();
    }

    function iniciarLoops() {
      if (jogoLoop) clearInterval(jogoLoop);
      if (renderLoop) clearInterval(renderLoop);

      desenharArena();
      jogoLoop = setInterval(passoDoJogo, 130);
      // Mantém espectadores/eliminados com renderização fluida ao receber broadcasts
      renderLoop = setInterval(() => {
        if (!myAlive || mySlot === 0) desenharArena();
      }, 65);
    }

    // Remove qualquer ouvinte anterior para evitar duplicidade
    if (handlerTeclasJogo) window.removeEventListener('keydown', handlerTeclasJogo);

    handlerTeclasJogo = e => {
      // TRAVA 1: Se o modal não estiver aberto, não faz nada
      if (!document.getElementById('modalSnake')) return;

      // TRAVA 2: Se o usuário estiver num campo de texto / área editável, não intercepta teclas
      if (estaEditandoTexto(e.target)) return;

      const k = (e.key || '').toLowerCase();

      if (e.code === 'Space') {
        e.preventDefault();
        // Só permite nova rodada quando todos estiverem eliminados
        solicitarReiniciarRodada();
        return;
      }

      if (mySlot < 1 || mySlot > 3 || !myAlive || mudouDirecao) return;

      if ((k === 'arrowup' || k === 'w') && dy === 0) { dx = 0; dy = -1; mudouDirecao = true; }
      else if ((k === 'arrowdown' || k === 's') && dy === 0) { dx = 0; dy = 1; mudouDirecao = true; }
      else if ((k === 'arrowleft' || k === 'a') && dx === 0) { dx = -1; dy = 0; mudouDirecao = true; }
      else if ((k === 'arrowright' || k === 'd') && dx === 0) { dx = 1; dy = 0; mudouDirecao = true; }
    };

    window.addEventListener('keydown', handlerTeclasJogo);

    function iniciarSoloFallback() {
      if (inicializado) return;
      modoMultiplayer = false;
      inicializado = true;
      mySlot = 1;
      reiniciarMinhaCobrinha(true);
      iniciarLoops();
    }

    if (!temSupabaseAtivo()) {
      iniciarSoloFallback();
      return;
    }

    // Fallback automático para modo solo caso o Realtime não conecte a tempo
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
          // Envia snapshot atual para o recém-chegado (drop-in)
          if (inicializado) {
            if (mySlot >= 1 && mySlot <= 3) transmitirEstadoCobrinha();
            if (ehHost()) transmitirMacas();
          }
        })
        .on('presence', { event: 'leave' }, ({ leftPresences }) => {
          if (Array.isArray(leftPresences)) {
            leftPresences.forEach(p => { if (p && p.id) leftIds.add(p.id); });
          }
          sincronizarPresenca();
        })
        .on('broadcast', { event: 'snake_state' }, msg => {
          const p = msg && msg.payload;
          if (!p || p.id === playerId || leftIds.has(p.id)) return;
          remotePlayers[p.id] = {
            id: p.id,
            slot: p.slot,
            joinedAt: p.joinedAt || Date.now(),
            score: p.score || 0,
            alive: !!p.alive,
            snake: Array.isArray(p.snake) ? p.snake : [],
            dx: p.dx ?? 1,
            dy: p.dy ?? 0
          };
          atualizarInterface();
          if (!myAlive || mySlot === 0) desenharArena();
        })
        .on('broadcast', { event: 'apples_sync' }, msg => {
          const p = msg && msg.payload;
          if (!p || !Array.isArray(p.apples)) return;
          // Aceita atualização do host dinâmico atual
          if (p.hostId === obterHostId() || !ehHost()) {
            apples = p.apples.map(a => ({ x: a.x, y: a.y }));
            if (!myAlive || mySlot === 0) desenharArena();
          }
        })
        .on('broadcast', { event: 'apple_eaten' }, msg => {
          const p = msg && msg.payload;
          if (!p || p.by === playerId) return;
          const idx = apples.findIndex(a => a.x === p.x && a.y === p.y);
          if (idx !== -1) apples.splice(idx, 1);
          if (ehHost()) {
            garantirMacas(true);
          }
        })
        .on('broadcast', { event: 'reset_all' }, () => {
          if (mySlot >= 1 && mySlot <= 3) {
            reiniciarMinhaCobrinha(true);
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
            // Define slot provisório com base na presença atual antes do track inicial
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
              score: 0,
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