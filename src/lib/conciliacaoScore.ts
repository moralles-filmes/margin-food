/**
 * Score de similaridade entre uma linha de extrato bancário e um candidato
 * (lançamento, conta a pagar/receber ou contrapartida de transferência).
 * Extraído de ConciliacaoBancariaSection para ser reutilizável e testável.
 */
export function computeScore(
  extratoValor: number,
  extratoData: string,
  extratoDesc: string,
  candidateValor: number,
  candidateData: string,
  candidateDesc: string,
): number {
  let score = 0;
  const diff = Math.abs(candidateValor - extratoValor);
  const tolerance = Math.max(extratoValor * 0.01, 0.01);
  if (diff < 0.01) score += 50;
  else if (diff <= tolerance) score += 40;
  else if (diff <= extratoValor * 0.05) score += 20;
  else return 0;

  const d1 = new Date(extratoData);
  const d2 = new Date(candidateData);
  const daysDiff = Math.abs((d1.getTime() - d2.getTime()) / 86400000);
  if (daysDiff === 0) score += 30;
  else if (daysDiff <= 1) score += 25;
  else if (daysDiff <= 3) score += 15;
  else if (daysDiff <= 7) score += 5;
  else return 0;

  if (extratoDesc && candidateDesc) {
    const a = extratoDesc.toLowerCase().trim();
    const b = candidateDesc.toLowerCase().trim();
    if (a === b) score += 20;
    else if (a.includes(b) || b.includes(a)) score += 15;
    else {
      const wordsA = a.split(/\s+/);
      const wordsB = new Set(b.split(/\s+/));
      const common = wordsA.filter(w => w.length > 2 && wordsB.has(w)).length;
      score += Math.min(common * 3, 10);
    }
  }

  return score;
}
