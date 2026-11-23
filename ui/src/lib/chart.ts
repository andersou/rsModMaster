// Histórico do gráfico, sem UI: amostras por instante (hora do fim da transação) e uma coluna por
// registrador no gráfico, no formato colunar que o uPlot desenha. Só os selecionados são gravados.

export const MAX_SERIES = 8;
/** ~16 min a 50 ms ou ~5,5 h a 1 s; acima de 5% a mais, corta para este tamanho. */
export const MAX_ROWS = 20_000;

export interface ChartData {
  /** instantes em ms, estritamente crescentes */
  t: number[];
  /** endereço -> valor em cada instante (`null` = sem valor: erro, texto, fora do intervalo) */
  cols: Map<number, (number | null)[]>;
}

export const emptyChart = (): ChartData => ({ t: [], cols: new Map() });

/** Acrescenta uma amostra; endereços novos começam com lacunas no passado. Devolve o instante
 *  gravado (o uPlot exige X crescente: dois no mesmo ms viram +1). */
export function pushSample(data: ChartData, at: number, values: Map<number, number | null>, addresses: number[]): number {
  const last = data.t[data.t.length - 1];
  const t = last !== undefined && at <= last ? last + 1 : at;
  for (const address of addresses) {
    if (!data.cols.has(address)) data.cols.set(address, new Array(data.t.length).fill(null));
  }
  data.t.push(t);
  for (const [address, col] of data.cols) col.push(values.get(address) ?? null);
  if (data.t.length > MAX_ROWS * 1.05) {
    const cut = data.t.length - MAX_ROWS;
    data.t.splice(0, cut);
    for (const col of data.cols.values()) col.splice(0, cut);
  }
  return t;
}

/** Preenche depois o valor de um instante já gravado (o decode dos converters chega depois da
 *  amostra). Sem a linha (cortada ou limpa), não faz nada. */
export function fillSample(data: ChartData, t: number, address: number, value: number | null): boolean {
  const col = data.cols.get(address);
  if (!col) return false;
  for (let i = data.t.length - 1; i >= 0 && data.t[i] >= t; i--) {
    if (data.t[i] === t) {
      col[i] = value;
      return true;
    }
  }
  return false;
}

/** Zera uma série (o formato dela mudou: o passado não é comparável). */
export function resetColumn(data: ChartData, address: number) {
  if (data.cols.has(address)) data.cols.set(address, new Array(data.t.length).fill(null));
}

export function dropColumn(data: ChartData, address: number) {
  data.cols.delete(address);
}

/** Bobinas: cada uma na sua faixa (y = faixa + 0,8·valor), para os degraus 0/1 não se sobreporem. */
export const laneValue = (lane: number, value: number | null) => (value === null ? null : lane + 0.8 * (value ? 1 : 0));

/** Primeira cor livre (0..7) para um registrador novo no gráfico; `null` se já houver 8. */
export function freeSlot(used: Iterable<number>): number | null {
  const taken = new Set(used);
  for (let slot = 0; slot < MAX_SERIES; slot++) if (!taken.has(slot)) return slot;
  return null;
}

/** Último valor (não nulo) de uma série, para a legenda fora do cursor. */
export function lastValue(col: readonly (number | null)[] | undefined): number | null {
  if (!col) return null;
  for (let i = col.length - 1; i >= 0; i--) if (col[i] !== null) return col[i];
  return null;
}

/** Janela visível: o fim é o instante mais recente; `null` = tudo. */
export const WINDOWS = [
  { value: '30s', label: '30 s', ms: 30_000 },
  { value: '2m', label: '2 min', ms: 120_000 },
  { value: '10m', label: '10 min', ms: 600_000 },
  { value: 'all', label: 'All', ms: null },
] as const;
export type WindowKey = (typeof WINDOWS)[number]['value'];
