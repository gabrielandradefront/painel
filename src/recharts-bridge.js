/* ========================================================
   RECHARTS-BRIDGE.JS - PONTE REACT/RECHARTS PARA VANILLA JS
   ARGOS OPS
======================================================== */
import React from 'react';
import { createRoot } from 'react-dom/client';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine
} from 'recharts';

const h = React.createElement;
let activeMount = null; // { container, root }

function formatBrl(v) {
  return (+v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function CustomPriceTooltip({ active, payload, label, itemNome }) {
  if (!active || !payload || !payload.length) return null;
  const point = payload[0].payload || {};
  const delta = point.deltaPct;
  let deltaText = '';
  let deltaColor = 'var(--mu)';

  if (typeof delta === 'number' && !Number.isNaN(delta)) {
    if (delta > 0) {
      deltaText = `▲ +${delta}% vs anterior`;
      deltaColor = 'var(--er)';
    } else if (delta < 0) {
      deltaText = `▼ ${delta}% vs anterior`;
      deltaColor = 'var(--ok)';
    } else {
      deltaText = '= sem variação';
    }
  }

  return h(
    'div',
    { className: 'orc-recharts-tooltip' },
    h('div', { className: 'orc-recharts-tooltip-date' }, `${label}${point.origem === 'atual' ? ' • Cotação Atual' : ''}`),
    h('div', { className: 'orc-recharts-tooltip-price' }, formatBrl(point.preco)),
    itemNome ? h('div', { className: 'orc-recharts-tooltip-meta' }, itemNome) : null,
    deltaText
      ? h('div', { className: 'orc-recharts-tooltip-meta', style: { color: deltaColor, fontWeight: 600 } }, deltaText)
      : null
  );
}

function SupplierHistoryLineChart({ data, itemNome, media, tema }) {
  const isLight = tema === 'light';
  const gridStroke = isLight ? '#e2e8f0' : 'rgba(255, 255, 255, 0.08)';
  const axisColor = isLight ? '#475569' : '#9ca3af';
  const lineColor = isLight ? '#d97706' : '#f59e0b';
  const dotFill = isLight ? '#ffffff' : '#1c1d22';
  const refColor = isLight ? '#059669' : '#10b981';

  const valores = data.map(d => d.preco).filter(v => typeof v === 'number' && !Number.isNaN(v));
  const minVal = valores.length ? Math.min(...valores) : 0;
  const maxVal = valores.length ? Math.max(...valores) : 100;
  const padVal = maxVal === minVal ? Math.max(1, maxVal * 0.15) : (maxVal - minVal) * 0.18;
  const yDomain = [Math.max(0, Math.floor((minVal - padVal) * 100) / 100), Math.ceil((maxVal + padVal) * 100) / 100];

  return h(
    ResponsiveContainer,
    { width: '100%', height: '100%' },
    h(
      LineChart,
      { data, margin: { top: 14, right: 20, left: 6, bottom: 6 } },
      h(CartesianGrid, { strokeDasharray: '3 3', stroke: gridStroke, vertical: false }),
      h(XAxis, {
        dataKey: 'label',
        stroke: axisColor,
        tick: { fill: axisColor, fontSize: 11 },
        tickLine: false,
        axisLine: { stroke: gridStroke }
      }),
      h(YAxis, {
        domain: yDomain,
        stroke: axisColor,
        tick: { fill: axisColor, fontSize: 11 },
        tickLine: false,
        axisLine: false,
        width: 72,
        tickFormatter: v => `R$ ${Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}`
      }),
      h(Tooltip, {
        content: props => h(CustomPriceTooltip, Object.assign({}, props, { itemNome }))
      }),
      media > 0 && data.length > 1
        ? h(ReferenceLine, {
            y: media,
            stroke: refColor,
            strokeDasharray: '4 4',
            strokeOpacity: 0.75,
            label: {
              value: `Média ${formatBrl(media)}`,
              position: 'insideTopRight',
              fill: refColor,
              fontSize: 10.5,
              fontWeight: 600
            }
          })
        : null,
      h(Line, {
        type: 'monotone',
        dataKey: 'preco',
        name: itemNome || 'Preço',
        stroke: lineColor,
        strokeWidth: 2.8,
        dot: { r: 4.5, stroke: lineColor, strokeWidth: 2.2, fill: dotFill },
        activeDot: { r: 6.5, stroke: lineColor, strokeWidth: 2, fill: lineColor },
        isAnimationActive: true,
        animationDuration: 350
      })
    )
  );
}

function unmountActive() {
  if (activeMount) {
    try {
      activeMount.root.unmount();
    } catch (e) {}
    activeMount = null;
  }
}

function renderLineChart(containerEl, config) {
  if (!containerEl) return;
  if (activeMount && activeMount.container !== containerEl) {
    unmountActive();
  }
  if (!activeMount) {
    activeMount = {
      container: containerEl,
      root: createRoot(containerEl)
    };
  }
  activeMount.root.render(h(SupplierHistoryLineChart, config));
}

window.PriusRecharts = {
  renderLineChart,
  unmount: unmountActive
};

if (typeof window.PriusBus !== 'undefined') {
  window.PriusBus.emit('recharts:ready');
}
if (typeof window.montarGraficoRechartsOrc === 'function') {
  window.montarGraficoRechartsOrc();
}
