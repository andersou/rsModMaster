import { createEffect, createMemo, createSignal, For, on, onCleanup, onMount, Show } from 'solid-js';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';
import { app } from '../appStore';
import { laneValue, lastValue, WINDOWS, type WindowKey } from '../lib/chart';
import { t } from '../i18n';
import { formatFloat } from '../lib/registers';
import { localIso } from '../lib/time';
import { theme } from '../theme';
import { Icon } from './Icon';
import { Segmented } from './Segmented';

interface Series {
  address: number;
  slot: number;
  label: string;
}

const windowOptions = () => WINDOWS.map((w) => ({ value: w.value, label: w.value === 'all' ? t('chart.all') : w.label }));

/** Valores dos registradores escolhidos (botão direito → Show in chart) ao longo do tempo, com o
 *  uPlot (canvas; estilos só via CSSOM, a CSP segue estrita). Uma série por registrador, na cor
 *  dele; bobinas em degrau, cada uma na sua faixa. */
export function ChartView() {
  let host!: HTMLDivElement;
  let plot: uPlot | undefined;
  /** acompanha o instante mais recente; um zoom por arraste pausa (o histórico segue gravando) */
  const [live, setLive] = createSignal(true);
  const [cursor, setCursor] = createSignal<number | null>(null);
  const [hidden, setHidden] = createSignal<ReadonlySet<number>>(new Set());
  /** muda a cada redesenho: a legenda relê os últimos valores */
  const [drawn, setDrawn] = createSignal(0);
  const bits = () => app.spec().bits;
  const series = createMemo<Series[]>(() =>
    [...app.charted()].map(([address, slot]) => ({ address, slot, label: app.labels()[address] ?? t('chart.reg', { address }) })),
  );
  const windowMs = () => WINDOWS.find((w) => w.value === app.chartWindow())?.ms ?? null;

  const columns = (): uPlot.AlignedData => {
    const { t, cols } = app.chart;
    const ys = series().map((s, lane) => {
      const col = cols.get(s.address) ?? new Array<number | null>(t.length).fill(null);
      return bits() ? col.map((v) => laneValue(lane, v)) : col;
    });
    return [t, ...ys] as uPlot.AlignedData;
  };

  const create = () => {
    plot?.destroy();
    plot = undefined;
    if (!series().length) return;
    const css = getComputedStyle(document.documentElement);
    const token = (name: string) => css.getPropertyValue(name).trim();
    const axis = {
      stroke: token('--muted'),
      grid: { stroke: token('--border'), width: 1 },
      ticks: { stroke: token('--border'), width: 1 },
      font: '11px ui-monospace, Menlo, Consolas, monospace',
    };
    const lanes = series().length;
    plot = new uPlot(
      {
        width: Math.max(host.clientWidth, 100),
        height: Math.max(host.clientHeight, 100),
        ms: 1,
        legend: { show: false },
        cursor: { drag: { x: true, y: false, setScale: false } },
        scales: {
          x: {
            time: true,
            // ao vivo: a janela começa na primeira amostra até se encher e depois acompanha o fim
            range: (_u, min, max) => {
              const ms = windowMs();
              if (!live() || ms === null || min === null || max === null) return [min, max];
              return max - min < ms ? [min, min + ms] : [max - ms, max];
            },
          },
          y: bits() ? { range: () => [-0.2, Math.max(lanes, 1)] } : { auto: true },
        },
        axes: [
          axis,
          bits()
            ? { ...axis, size: 96, splits: () => series().map((_, i) => i + 0.4), values: (_u, splits) => splits.map((_, i) => series()[i]?.label ?? '') }
            : { ...axis, size: 64 },
        ],
        series: [
          {},
          ...series().map((s) => ({
            label: s.label,
            stroke: token(`--series-${s.slot + 1}`),
            width: 1.5,
            show: !hidden().has(s.address),
            points: { show: false },
            paths: bits() ? uPlot.paths.stepped?.({ align: 1 }) : undefined,
          })),
        ],
        hooks: {
          // arraste no X: zoom manual e pausa o acompanhamento
          setSelect: [
            (u) => {
              if (u.select.width < 2) return;
              setLive(false);
              const min = u.posToVal(u.select.left, 'x');
              const max = u.posToVal(u.select.left + u.select.width, 'x');
              u.setScale('x', { min, max });
              u.setSelect({ left: 0, top: 0, width: 0, height: 0 }, false);
            },
          ],
          setCursor: [(u) => setCursor(u.cursor.idx ?? null)],
        },
      },
      columns(),
      host,
    );
  };

  // recria com outras séries, bobinas ou outro tema (as cores vêm dos tokens)
  createEffect(on([series, bits, theme], () => queueMicrotask(create)));

  let frame = 0;
  const redraw = () => {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      plot?.setData(columns(), live());
      setDrawn((n) => n + 1);
    });
  };
  createEffect(on(app.chartVersion, redraw, { defer: true }));
  createEffect(
    on(
      app.chartWindow,
      () => {
        setLive(true);
        redraw();
      },
      { defer: true },
    ),
  );

  onMount(() => {
    const observer = new ResizeObserver(() => plot?.setSize({ width: Math.max(host.clientWidth, 100), height: Math.max(host.clientHeight, 100) }));
    observer.observe(host);
    onCleanup(() => observer.disconnect());
  });
  onCleanup(() => {
    cancelAnimationFrame(frame);
    plot?.destroy();
  });

  const goLive = () => {
    setLive(true);
    plot?.setData(columns(), true);
  };
  const toggleHidden = (address: number, index: number) => {
    const next = new Set(hidden());
    if (next.has(address)) next.delete(address);
    else next.add(address);
    setHidden(next);
    plot?.setSeries(index, { show: !next.has(address) });
  };
  const valueOf = (address: number) => {
    drawn();
    const col = app.chart.cols.get(address);
    const idx = cursor();
    const v = idx !== null && col ? col[idx] : lastValue(col);
    if (v === null || v === undefined) return '—';
    return bits() ? String(v) : formatFloat(v);
  };
  const cursorTime = () => {
    drawn();
    const idx = cursor();
    const time = idx !== null ? app.chart.t[idx] : undefined;
    return time === undefined ? t('chart.latest') : localIso(time).slice(11);
  };

  return (
    <div class="chart-view">
      <div class="chart-toolbar">
        <Segmented label={t('chart.window')} value={app.chartWindow()} options={windowOptions()} onChange={(w) => app.setChartWindow(w as WindowKey)} />
        <Show when={!live()}>
          <button class="btn small" type="button" title={t('chart.followLatest')} onClick={goLive}>
            <Icon name="play" />
            {t('chart.live')}
          </button>
        </Show>
        <span class="context">{live() ? t('chart.dragToZoom') : t('chart.paused')}</span>
      </div>
      <div class="chart-body">
        <div class="chart-plot" ref={host}>
          <Show when={!series().length}>
            <div class="log-empty">
              <Icon name="activity" />
              <span class="log-empty-title">{t('chart.emptyTitle')}</span>
              <span class="log-empty-text">{t('chart.emptyText')}</span>
            </div>
          </Show>
        </div>
        <Show when={series().length}>
          <div class="chart-legend">
            <div class="legend-time">{cursorTime()}</div>
            <ul>
              <For each={series()}>
                {(s, i) => (
                  <li classList={{ off: hidden().has(s.address) }}>
                    <button
                      class="legend-item"
                      type="button"
                      aria-pressed={!hidden().has(s.address)}
                      title={t(hidden().has(s.address) ? 'chart.legendShow' : 'chart.legendHide', { label: s.label, address: s.address })}
                      onClick={() => toggleHidden(s.address, i() + 1)}
                    >
                      <span class="menu-swatch" style={{ background: `var(--series-${s.slot + 1})` }} />
                      <span class="legend-label">{s.label}</span>
                      <span class="legend-value">{valueOf(s.address)}</span>
                    </button>
                    <button class="btn ghost square small" type="button" aria-label={t('chart.remove', { label: s.label })} onClick={() => app.toggleChart(s.address)}>
                      <Icon name="x" />
                    </button>
                  </li>
                )}
              </For>
            </ul>
          </div>
        </Show>
      </div>
    </div>
  );
}
