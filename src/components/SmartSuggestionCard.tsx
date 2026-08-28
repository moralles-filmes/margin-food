import { Lightbulb, Zap, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SmartSuggestion } from '@/types/salmon';
import { formatFixedBR } from '@/lib/formatters';

interface Props {
  suggestion: SmartSuggestion | null;
  onUseSuggestion?: (kgBruto: number, kgLimpo: number, peixes: number) => void;
}

export default function SmartSuggestionCard({ suggestion, onUseSuggestion }: Props) {
  if (!suggestion) return null;

  return (
    <div className="bg-card border border-warning/30 rounded-xl p-4 space-y-3 animate-fade-up">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-warning/15 flex items-center justify-center">
            <Lightbulb className="w-4 h-4 text-warning" />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">Sugestão para Hoje</p>
            <p className="text-[10px] text-muted-foreground">{suggestion.fallback ? 'Histórico limitado' : 'Baseado em histórico'}</p>
          </div>
        </div>
        {onUseSuggestion && (
          <Button
            size="sm"
            className="bg-primary-strong text-primary-foreground border-0 text-xs gap-1"
            onClick={() => onUseSuggestion(suggestion.kgBrutoSugerido, suggestion.kgLimpoSugerido, suggestion.peixesSugeridos)}
          >
            <Zap className="w-3 h-3" /> Usar
          </Button>
        )}
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="text-center bg-secondary/50 rounded-lg p-2.5">
          <p className="text-[10px] text-muted-foreground">Kg limpo</p>
          <p className="text-lg font-display font-bold text-success">{formatFixedBR(suggestion.kgLimpoSugerido, 1)}</p>
        </div>
        <div className="text-center bg-secondary/50 rounded-lg p-2.5">
          <p className="text-[10px] text-muted-foreground">Kg bruto</p>
          <p className="text-lg font-display font-bold text-foreground">{formatFixedBR(suggestion.kgBrutoSugerido, 1)}</p>
        </div>
        <div className="text-center bg-secondary/50 rounded-lg p-2.5">
          <p className="text-[10px] text-muted-foreground">Peixes</p>
          <p className="text-lg font-display font-bold text-primary">{formatFixedBR(suggestion.peixesSugeridos, 1)}</p>
        </div>
      </div>

      <div className="flex items-start gap-1.5 text-[10px] text-muted-foreground bg-secondary/30 rounded-lg p-2">
        <Info className="w-3 h-3 mt-0.5 shrink-0" />
        <span>{suggestion.explicacao}</span>
      </div>

      {!suggestion.fallback && (
        <div className="flex gap-2 text-[10px]">
          {suggestion.fatorSemanaMes !== undefined && (
            <span className="px-1.5 py-0.5 rounded bg-warning/10 text-warning">Fator semana: ×{formatFixedBR(suggestion.fatorSemanaMes, 2)}</span>
          )}
          {suggestion.ajustePressao !== undefined && (
            <span className="px-1.5 py-0.5 rounded bg-primary/10 text-primary">Pressão: ×{formatFixedBR(suggestion.ajustePressao, 2)}</span>
          )}
          {suggestion.historicoBase !== undefined && (
            <span className="px-1.5 py-0.5 rounded bg-secondary text-muted-foreground">{suggestion.historicoBase} registros</span>
          )}
        </div>
      )}
    </div>
  );
}
