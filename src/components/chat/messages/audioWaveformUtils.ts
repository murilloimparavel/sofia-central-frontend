/**
 * Helper com hash determinístico para gerar alturas visuais de barras de áudio (waveform)
 * sem re-renderizar aleatoriamente nem flickar a tela a cada timeupdate.
 */
export const getStableBarHeights = (seed: string, count = 25): number[] => {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0;
  }

  const heights: number[] = [];
  for (let i = 0; i < count; i++) {
    // Pseudo-random baseado no hash
    const pseudo = Math.abs(Math.sin((hash + i * 997) * 0.1));
    // Alturas entre 4px e 20px
    const height = Math.round(4 + pseudo * 16);
    heights.push(height);
  }
  return heights;
};
