import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { DecimalInput } from '@/components/ui/decimal-input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Target, RefreshCw } from 'lucide-react';
import type { CmvResult, MetaCmv } from './types';
import { fmtBRL, formatPercentBR } from '@/lib/formatters';

const COLORS = [
  'hsl(var(--chart-1))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))',
  'hsl(var(--chart-4))', 'hsl(var(--chart-5))', 'hsl(var(--chart-6))',
];

function fmt(v: number) {
  return fmtBRL(v);
}

function statusBadge(status: string) {
  if (status === 'ok') return <Badge className="bg-primary/10 text-primary border-primary/20">🟢 Dentro</Badge>;
  if (status === 'warning') return <Badge className="bg-warning/10 text-warning border-warning/20">🟡 Atenção</Badge>;
  if (status === 'danger') return <Badge className="bg-destructive/10 text-destructive border-destructive/20">🔴 Fora</Badge>;
  return <Badge variant="secondary">—</Badge>;
}

interface CmvMetasDialogProps {
  cmvData: CmvResult;
  meta: MetaCmv | null;
  errorMeta: string | null;
  mesAno: string;
  canEditSemanal: boolean;
  metaDialog: boolean;
  metaForm: { geral: string; salmao: string; total: string; amarelo: string; vermelho: string };
  onMetaDialogChange: (open: boolean) => void;
  onMetaFormChange: (form: any) => void;
  onSaveMeta: () => void;
  onRetryMeta: () => void;
  getMetaStatus: (valor: number, metaVal: number) => string;
}

export default function CmvMetasDialog({
  cmvData, meta, errorMeta, mesAno, canEditSemanal,
  metaDialog, metaForm, onMetaDialogChange, onMetaFormChange, onSaveMeta, onRetryMeta, getMetaStatus,
}: CmvMetasDialogProps) {
  if (errorMeta && !meta) {
    return (
      <Card className="border-destructive/30">
        <CardContent className="py-4 text-center">
          <p className="text-sm text-destructive mb-2">Falha ao carregar metas</p>
          <Button variant="outline" size="sm" onClick={onRetryMeta} className="gap-1.5">
            <RefreshCw className="w-3.5 h-3.5" /> Tentar novamente
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!meta) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2"><Target className="w-4 h-4" /> Meta vs Realizado</CardTitle>
          {canEditSemanal && (
            <Dialog open={metaDialog} onOpenChange={onMetaDialogChange}>
              <DialogTrigger asChild><Button variant="outline" size="sm">Editar Metas</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Metas CMV — {mesAno}</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <div><Label>Meta CMV Geral (%)</Label><DecimalInput value={metaForm.geral} onValueChange={(raw) => onMetaFormChange({ ...metaForm, geral: raw })} maxDecimals={1} placeholder="35" /></div>
                  <div><Label>Meta CMV Salmão (%)</Label><DecimalInput value={metaForm.salmao} onValueChange={(raw) => onMetaFormChange({ ...metaForm, salmao: raw })} maxDecimals={1} placeholder="15" /></div>
                  <div><Label>Meta CMV Total (%)</Label><DecimalInput value={metaForm.total} onValueChange={(raw) => onMetaFormChange({ ...metaForm, total: raw })} maxDecimals={1} placeholder="35" /></div>
                  <div><Label>Alerta Amarelo (+%)</Label><DecimalInput value={metaForm.amarelo} onValueChange={(raw) => onMetaFormChange({ ...metaForm, amarelo: raw })} maxDecimals={1} placeholder="3" /></div>
                  <div><Label>Alerta Vermelho (+%)</Label><DecimalInput value={metaForm.vermelho} onValueChange={(raw) => onMetaFormChange({ ...metaForm, vermelho: raw })} maxDecimals={1} placeholder="6" /></div>
                  <Button onClick={onSaveMeta} className="w-full">Salvar</Button>
                </div>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-3 gap-4">
          <div className="text-center">
            <p className="text-xs text-muted-foreground mb-1">CMV Geral</p>
            <p className="text-lg font-bold">{formatPercentBR(cmvData.cmvGeralPct)}</p>
            <p className="text-xs text-muted-foreground">Meta: {formatPercentBR(meta.meta_cmv_geral)}</p>
            {statusBadge(getMetaStatus(cmvData.cmvGeralPct, meta.meta_cmv_geral))}
          </div>
          <div className="text-center">
            <p className="text-xs text-muted-foreground mb-1">CMV Salmão</p>
            <p className="text-lg font-bold">{formatPercentBR(cmvData.cmvSalmaoPct)}</p>
            <p className="text-xs text-muted-foreground">Meta: {formatPercentBR(meta.meta_cmv_salmao)}</p>
            {statusBadge(getMetaStatus(cmvData.cmvSalmaoPct, meta.meta_cmv_salmao))}
          </div>
          <div className="text-center">
            <p className="text-xs text-muted-foreground mb-1">CMV Total</p>
            <p className="text-lg font-bold">{formatPercentBR(cmvData.cmvTotalPct)}</p>
            <p className="text-xs text-muted-foreground">Meta: {formatPercentBR(meta.meta_cmv_total)}</p>
            {statusBadge(getMetaStatus(cmvData.cmvTotalPct, meta.meta_cmv_total))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
