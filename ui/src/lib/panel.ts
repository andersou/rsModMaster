// Altura do painel de baixo, arrastada pela borda de cima.
/** barra de título (44) + barra de status (36) + uma folga para a borda de arrastar continuar visível */
const RESERVED = 44 + 36 + 8;
const MIN_HEIGHT = 120;

/** Altura arrastada, entre o mínimo e quase a janela inteira. */
export const clampHeight = (height: number, viewport: number) => Math.round(Math.max(MIN_HEIGHT, Math.min(height, viewport - RESERVED)));
