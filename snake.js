/* ========================================================
   SNAKE.JS - EASTER EGG (JOGO DA COBRINHA BLINDADO)
   Ativação: Clicar 5x no logótipo ou digitar "snake"
   Controles: Setas / WASD / Espaço (Reiniciar) / Esc (Sair)
======================================================== */

(function () {
  let easterEggClicks = 0;
  let easterEggTimer = null;
  let bufferTeclas = '';

  // 1. Escuta silenciosa para abrir o jogo (só roda fora de inputs)
  window.addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

    if (e.key === 'Escape') fecharSnake();

    bufferTeclas += e.key.toLowerCase();
    if (bufferTeclas.length > 10) bufferTeclas = bufferTeclas.slice(-10);

    if (bufferTeclas.endsWith('snake')) {
      bufferTeclas = '';
      abrirSnake();
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

  let jogoLoop = null;
  let resetarPartidaFn = null;
  let handlerTeclasJogo = null;

  function abrirSnake() {
    if (document.getElementById('modalSnake')) return;

    const modal = document.createElement('div');
    modal.id = 'modalSnake';
    modal.style.cssText = `
      position: fixed; inset: 0; background: rgba(0, 0, 0, 0.82);
      backdrop-filter: blur(5px); display: flex; flex-direction: column;
      align-items: center; justify-content: center; z-index: 99999;
      padding: 16px; box-sizing: border-box;
    `;

    modal.innerHTML = `
      <div style="background: var(--card, #1c1d22); border: 1px solid var(--bd, #2d2f36); border-radius: 12px; padding: 20px; text-align: center; box-shadow: 0 15px 40px rgba(0,0,0,0.6); max-width: 95vw; max-height: 95vh; display: flex; flex-direction: column; align-items: center;">
        <div style="display: flex; justify-content: space-between; align-items: center; width: 100%; margin-bottom: 12px; gap: 12px;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <b style="color: var(--ac, #f59e0b); font-size: 18px;">🐍 Snake Prius</b>
            <span style="font-size: 14px; color: var(--tx, #fff); font-variant-numeric: tabular-nums;">Pontos: <b id="snakeScore">0</b></span>
          </div>
          <div style="display: flex; align-items: center; gap: 8px;">
            <button id="btnReiniciarSnake" class="b p" style="font-size: 12px; padding: 4px 10px; cursor: pointer;">🔄 Reiniciar</button>
            <button id="btnFecharSnake" class="x" style="padding: 2px 8px; font-size: 18px; cursor: pointer;">✕</button>
          </div>
        </div>

        <div style="position: relative; display: inline-block;">
          <canvas id="canvasSnake" width="600" height="600" style="background: #111215; border: 2px solid var(--bd, #2d2f36); border-radius: 8px; display: block; max-width: 85vw; max-height: 72vh; aspect-ratio: 1/1;"></canvas>
          <div id="snakeOverlayGameOver" style="display: none; position: absolute; inset: 0; background: rgba(0, 0, 0, 0.78); border-radius: 8px; flex-direction: column; align-items: center; justify-content: center; gap: 12px;">
            <span style="color: #ef4444; font-size: 24px; font-weight: bold;">Fim de Jogo!</span>
            <span id="snakeGameOverMsg" style="color: #fff; font-size: 15px;"></span>
            <button id="btnTentarNovamenteSnake" class="b p" style="font-size: 14px; padding: 8px 18px; font-weight: bold; cursor: pointer;">🔄 Jogar Novamente (Espaço)</button>
          </div>
        </div>

        <div style="margin-top: 10px; font-size: 12px; color: var(--mu, #8e929d);">
          Setas ou WASD para mover • <b>Espaço</b> reinicia • <b>Esc</b> fecha
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    document.getElementById('btnFecharSnake').onclick = fecharSnake;
    document.getElementById('btnReiniciarSnake').onclick = () => { if (resetarPartidaFn) resetarPartidaFn(); };
    document.getElementById('btnTentarNovamenteSnake').onclick = () => { if (resetarPartidaFn) resetarPartidaFn(); };

    modal.onclick = e => { if (e.target === modal) fecharSnake(); };

    iniciarMotorSnake();
  }

  function fecharSnake() {
    const modal = document.getElementById('modalSnake');
    if (modal) {
      if (jogoLoop) clearInterval(jogoLoop);
      if (handlerTeclasJogo) {
        window.removeEventListener('keydown', handlerTeclasJogo);
        handlerTeclasJogo = null;
      }
      modal.remove();
    }
  }

  function iniciarMotorSnake() {
    const canvas = document.getElementById('canvasSnake');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const scoreEl = document.getElementById('snakeScore');
    const overlayGameOver = document.getElementById('snakeOverlayGameOver');
    const msgGameOver = document.getElementById('snakeGameOverMsg');

    const gridSize = 20;
    const tileCount = canvas.width / gridSize;
    let snake = [];
    let comida = { x: 5, y: 5 };
    let dx = 1, dy = 0;
    let score = 0;
    let mudouDirecao = false;
    let emJogo = true;

    function gerarComida() {
      comida = {
        x: Math.floor(Math.random() * tileCount),
        y: Math.floor(Math.random() * tileCount)
      };
      if (snake.some(p => p.x === comida.x && p.y === comida.y)) {
        gerarComida();
      }
    }

    function resetarPartida() {
      if (jogoLoop) clearInterval(jogoLoop);
      snake = [
        { x: 12, y: 15 },
        { x: 11, y: 15 },
        { x: 10, y: 15 }
      ];
      dx = 1; 
      dy = 0;
      score = 0;
      mudouDirecao = false;
      emJogo = true;
      if (scoreEl) scoreEl.textContent = '0';
      if (overlayGameOver) overlayGameOver.style.display = 'none';
      gerarComida();
      iniciarLoop();
    }

    resetarPartidaFn = resetarPartida;

    // Remove qualquer ouvinte anterior para evitar duplicidade
    if (handlerTeclasJogo) window.removeEventListener('keydown', handlerTeclasJogo);

    handlerTeclasJogo = e => {
      // TRAVA 1: Se o modal não estiver aberto, não faz nada
      if (!document.getElementById('modalSnake')) return;

      // TRAVA 2: Se o usuário estiver num campo de texto, não intercepta o Espaço
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

      const k = e.key.toLowerCase();

      if (e.code === 'Space') {
        e.preventDefault();
        resetarPartida();
        return;
      }

      if (!emJogo || mudouDirecao) return;

      if ((k === 'arrowup' || k === 'w') && dy === 0) { dx = 0; dy = -1; mudouDirecao = true; }
      else if ((k === 'arrowdown' || k === 's') && dy === 0) { dx = 0; dy = 1; mudouDirecao = true; }
      else if ((k === 'arrowleft' || k === 'a') && dx === 0) { dx = -1; dy = 0; mudouDirecao = true; }
      else if ((k === 'arrowright' || k === 'd') && dx === 0) { dx = 1; dy = 0; mudouDirecao = true; }
    };

    window.addEventListener('keydown', handlerTeclasJogo);

    function iniciarLoop() {
      jogoLoop = setInterval(() => {
        mudouDirecao = false;
        const head = { x: snake[0].x + dx, y: snake[0].y + dy };

        if (
          head.x < 0 || head.x >= tileCount ||
          head.y < 0 || head.y >= tileCount ||
          snake.some(p => p.x === head.x && p.y === head.y)
        ) {
          emJogo = false;
          clearInterval(jogoLoop);
          if (msgGameOver) msgGameOver.textContent = `Pontuação final: ${score} pontos`;
          if (overlayGameOver) overlayGameOver.style.display = 'flex';
          return;
        }

        snake.unshift(head);

        if (head.x === comida.x && head.y === comida.y) {
          score += 10;
          if (scoreEl) scoreEl.textContent = score;
          gerarComida();
        } else {
          snake.pop();
        }

        ctx.fillStyle = '#111215';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.strokeStyle = '#181a1f';
        ctx.lineWidth = 1;
        for (let x = 0; x < canvas.width; x += gridSize) {
          ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
        }
        for (let y = 0; y < canvas.height; y += gridSize) {
          ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
        }

        ctx.fillStyle = '#ef4444';
        ctx.fillRect(comida.x * gridSize + 2, comida.y * gridSize + 2, gridSize - 4, gridSize - 4);

        snake.forEach((p, index) => {
          ctx.fillStyle = index === 0 ? '#f59e0b' : '#d97706';
          ctx.fillRect(p.x * gridSize + 1, p.y * gridSize + 1, gridSize - 2, gridSize - 2);
        });
      }, 135);
    }

    resetarPartida();
  }
})();