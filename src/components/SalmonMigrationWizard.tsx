import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';
import { Upload, CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react';

import { useCan } from '@/permissions/hooks';
interface LocalEntry {
  id: string;
  date: string;
  lot: string;
  sif: string;
  supplier: string;
  totalValue: number;
  grossKg: number;
  boxes: number;
  units: number;
  notes: string;
  pricePerKg?: number;
}

interface LocalManipulation {
  id: string;
  entryId: string;
  date: string;
  lot: string;
  sif: string;
  supplier: string;
  fishCount: number;
  grossKg: number;
  cleanKg: number;
  leftoverKg: number;
  custoKgBrutoLote?: number;
}

type MigrationStatus = 'idle' | 'scanning' | 'importing' | 'done' | 'error';

interface MigrationResult {
  entriesFound: number;
  entriesImported: number;
  entriesSkipped: number;
  entriesErrored: number;
  manipsFound: number;
  manipsImported: number;
  manipsSkipped: number;
  manipsErrored: number;
  errors: string[];
}

export default function SalmonMigrationWizard({
 onComplete }: { onComplete?: () => void }) {
  const canViewRbac = useCan('salmon:estoque:view');
  const [status, setStatus] = useState<MigrationStatus>('idle');
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<MigrationResult | null>(null);
  const [progressText, setProgressText] = useState('');

  const loadLocalData = useCallback(() => {
    const entries: LocalEntry[] = [];
    const manipulations: LocalManipulation[] = [];
    try {
      const rawEntries = localStorage.getItem('salmon_entries');
      if (rawEntries) entries.push(...JSON.parse(rawEntries));
    } catch { /* empty */ }
    try {
      const rawManips = localStorage.getItem('salmon_manipulations');
      if (rawManips) manipulations.push(...JSON.parse(rawManips));
    } catch { /* empty */ }
    return { entries, manipulations };
  }, []);

  const runMigration = useCallback(async () => {
    setStatus('scanning');
    setProgress(0);

    const { entries, manipulations } = loadLocalData();
    if (entries.length === 0 && manipulations.length === 0) {
      toast.info('Nenhum dado encontrado no navegador para migrar.');
      setStatus('idle');
      return;
    }

    setStatus('importing');
    const res: MigrationResult = {
      entriesFound: entries.length,
      entriesImported: 0,
      entriesSkipped: 0,
      entriesErrored: 0,
      manipsFound: manipulations.length,
      manipsImported: 0,
      manipsSkipped: 0,
      manipsErrored: 0,
      errors: [],
    };

    const total = entries.length + manipulations.length;
    let processed = 0;

    // Map old entry IDs to new DB entry IDs
    const entryIdMap = new Map<string, string>();

    // Import entries
    for (const entry of entries) {
      setProgressText(`Entrada ${processed + 1}/${entries.length}: ${entry.lot || 'sem lote'}`);

      // Check if already imported (by checking reference_id in movimentacoes)
      const { data: existing } = await supabase
        .from('salmon_entries')
        .select('id')
        .eq('lot', entry.lot || '')
        .eq('entry_date', entry.date)
        .eq('gross_kg', entry.grossKg)
        .maybeSingle();

      if (existing) {
        entryIdMap.set(entry.id, existing.id);
        res.entriesSkipped++;
      } else {
        const { data, error } = await supabase.rpc('create_salmon_entry_atomic', {
          p_entry_date: entry.date,
          p_lot: entry.lot || '',
          p_sif: entry.sif || '',
          p_supplier_name: entry.supplier || '',
          p_boxes: entry.boxes || 0,
          p_units: entry.units || 0,
          p_gross_kg: entry.grossKg,
          p_total_value: entry.totalValue,
          p_notes: entry.notes || '',
        });

        if (error) {
          res.entriesErrored++;
          res.errors.push(`Entrada ${entry.lot}: ${error.message}`);
        } else {
          const result = data as any;
          entryIdMap.set(entry.id, result.entry_id);
          res.entriesImported++;
        }
      }

      processed++;
      setProgress(Math.round((processed / total) * 100));
    }

    // Import manipulations
    for (const manip of manipulations) {
      setProgressText(`Manipulação ${processed - entries.length + 1}/${manipulations.length}`);

      const dbEntryId = entryIdMap.get(manip.entryId);
      if (!dbEntryId) {
        res.manipsErrored++;
        res.errors.push(`Manipulação ${manip.id}: entrada pai não encontrada (${manip.entryId})`);
        processed++;
        setProgress(Math.round((processed / total) * 100));
        continue;
      }

      // Check if already imported
      const { data: existingManip } = await supabase
        .from('salmon_manipulations')
        .select('id')
        .eq('entry_id', dbEntryId)
        .eq('manipulation_date', manip.date)
        .eq('gross_out_kg', manip.grossKg)
        .maybeSingle();

      if (existingManip) {
        res.manipsSkipped++;
      } else {
        const { error } = await supabase.rpc('create_salmon_manipulation_atomic', {
          p_entry_id: dbEntryId,
          p_manipulation_date: manip.date,
          p_fish_count: manip.fishCount || 0,
          p_gross_out_kg: manip.grossKg,
          p_clean_in_kg: manip.cleanKg,
          p_leftover_kg: manip.leftoverKg || 0,
          p_notes: '',
        });

        if (error) {
          res.manipsErrored++;
          res.errors.push(`Manipulação lote ${manip.lot}: ${error.message}`);
        } else {
          res.manipsImported++;
        }
      }

      processed++;
      setProgress(Math.round((processed / total) * 100));
    }

    // Save config to salmon_config if present
    try {
      const rawConfig = localStorage.getItem('salmon_stock_config');
      if (rawConfig) {
        const config = JSON.parse(rawConfig);
        const { data: existingConfig } = await supabase.from('salmon_config').select('id').limit(1).single();
        if (existingConfig) {
          await supabase.from('salmon_config').update({
            loss_percent_alert: config.perdaPercentAlerta ?? 15,
            loss_value_alert: config.perdaValorAlerta ?? 500,
            expiration_days: config.validadePadraoDias ?? 2,
            expiration_alert_days: config.alertaVencimentoDias ?? 1,
            min_gross_kg: config.minGrossKg ?? 50,
            min_clean_kg: config.minCleanKg ?? 30,
            stale_days_limit: config.staleDaysLimit ?? 7,
          }).eq('id', existingConfig.id);
        }
      }
    } catch { /* optional */ }

    // Save purchase targets if present
    try {
      const rawMetas = localStorage.getItem('salmon_metas_compra');
      if (rawMetas) {
        const metas = JSON.parse(rawMetas);
        for (const meta of metas) {
          const [year, month] = (meta.mesAno || '').split('-').map(Number);
          if (year && month) {
            await supabase.from('salmon_purchase_targets').upsert({
              year_num: year,
              month_num: month,
              category: meta.categoria || 'salmao',
              target_value: meta.metaValorCompra || 0,
              alert_yellow_percent: meta.alertaAmareloPercent || 80,
              alert_red_percent: meta.alertaVermelhoPercent || 100,
            }, { onConflict: 'year_num,month_num,category' });
          }
        }
      }
    } catch { /* optional */ }

    setResult(res);
    setStatus('done');
    setProgressText('');

    if (res.entriesErrored === 0 && res.manipsErrored === 0) {
      // Clean localStorage salmon keys
      ['salmon_entries', 'salmon_manipulations', 'salmon_daily', 'salmon_suppliers',
       'salmon_metas_compra', 'salmon_stock_config', 'salmon_auditorias', 'salmon_metas_provisionadas'
      ].forEach(k => localStorage.removeItem(k));

      toast.success('Migração concluída com sucesso! Dados do navegador foram limpos.');
      onComplete?.();
    } else {
      toast.warning(`Migração concluída com ${res.entriesErrored + res.manipsErrored} erro(s). Verifique o relatório.`);
    }
  }, [loadLocalData, onComplete]);

  const hasLocalData = (() => {
    try {
      const e = localStorage.getItem('salmon_entries');
      const m = localStorage.getItem('salmon_manipulations');
      return (e && JSON.parse(e).length > 0) || (m && JSON.parse(m).length > 0);
    } catch { return false; }
  })();

  if (!hasLocalData && status === 'idle') {
    return (
      <div className="bg-card border border-border rounded-xl p-4 space-y-2">
        <p className="text-sm font-semibold text-foreground flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-success" /> Migração Salmão
        </p>
        <p className="text-[11px] text-muted-foreground">
          Nenhum dado local encontrado. O sistema já utiliza o banco de dados como fonte de verdade.
        </p>
      </div>
    );
  }

  if (!canViewRbac) return null;

  return (
    <div className="bg-card border border-border rounded-xl p-4 space-y-3">
      <p className="text-sm font-semibold text-foreground flex items-center gap-2">
        <Upload className="w-4 h-4 text-primary" /> Migrar Dados de Salmão do Navegador
      </p>
      <p className="text-[11px] text-muted-foreground">
        Importa entradas e manipulações armazenadas localmente para o banco de dados.
        Registros duplicados são ignorados automaticamente. Operação idempotente.
      </p>

      {status === 'idle' && (
        <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={runMigration}>
          <Upload className="w-3.5 h-3.5" /> Iniciar Migração
        </Button>
      )}

      {(status === 'scanning' || status === 'importing') && (
        <div className="space-y-2">
          <Progress value={progress} className="h-2" />
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <Loader2 className="w-3 h-3 animate-spin" />
            {progressText || 'Processando...'}
          </div>
        </div>
      )}

      {status === 'done' && result && (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2 text-[11px]">
            <div className="bg-secondary rounded-lg p-2">
              <p className="text-muted-foreground">Entradas encontradas</p>
              <p className="text-base font-bold text-foreground">{result.entriesFound}</p>
            </div>
            <div className="bg-secondary rounded-lg p-2">
              <p className="text-muted-foreground">Importadas / Duplicadas / Erros</p>
              <p className="text-base font-bold text-foreground">
                {result.entriesImported} / {result.entriesSkipped} / {result.entriesErrored}
              </p>
            </div>
            <div className="bg-secondary rounded-lg p-2">
              <p className="text-muted-foreground">Manipulações encontradas</p>
              <p className="text-base font-bold text-foreground">{result.manipsFound}</p>
            </div>
            <div className="bg-secondary rounded-lg p-2">
              <p className="text-muted-foreground">Importadas / Duplicadas / Erros</p>
              <p className="text-base font-bold text-foreground">
                {result.manipsImported} / {result.manipsSkipped} / {result.manipsErrored}
              </p>
            </div>
          </div>

          {result.errors.length > 0 && (
            <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-2 space-y-1 max-h-32 overflow-y-auto">
              <p className="text-[11px] font-semibold text-destructive flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" /> Erros ({result.errors.length})
              </p>
              {result.errors.map((err, i) => (
                <p key={i} className="text-[10px] text-destructive/80">{err}</p>
              ))}
            </div>
          )}

          <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={() => { setStatus('idle'); setResult(null); }}>
            Fechar
          </Button>
        </div>
      )}
    </div>
  );
}
