import { useCallback, useState } from 'react';
import {
  CENTRO_CUSTO_TODOS,
  registrarNomesCentroCusto,
  rotuloCentroCusto,
  type CentroCustoResumo,
  type NomesCentroCusto,
} from '@/domain/financeiro/centroCusto';

/** Recorte por centro de custo do DRE/DFC: seleção, centros do período e nomes já vistos. */
export function useCentroCustoRecorte() {
  const [selecao, setSelecao] = useState(CENTRO_CUSTO_TODOS);
  const [centros, setCentros] = useState<CentroCustoResumo[]>([]);
  const [nomes, setNomes] = useState<NomesCentroCusto>({});

  const registrarCentros = useCallback((lista: CentroCustoResumo[]) => {
    setCentros(lista);
    setNomes(prev => registrarNomesCentroCusto(prev, lista));
  }, []);

  return {
    selecao,
    setSelecao,
    centros,
    nomes,
    registrarCentros,
    filtrado: selecao !== CENTRO_CUSTO_TODOS,
    rotulo: rotuloCentroCusto(selecao, nomes),
  };
}
