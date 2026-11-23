// Comparação das versões das releases do GitHub, sem DOM.

/** `v1.2.3` ou `1.2.3` -> [1, 2, 3]; `null` se não for x.y.z (pré-release fica de fora). */
export const parseVersion = (raw: string): number[] | null => {
  const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(raw.trim());
  return match ? match.slice(1).map(Number) : null;
};

/** Se `latest` é mais nova que `current`; versão que não se entende nunca é "nova". */
export function isNewer(latest: string, current: string): boolean {
  const a = parseVersion(latest);
  const b = parseVersion(current);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i];
  return false;
}
