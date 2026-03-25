import { useState, useCallback, useMemo } from 'react';
import { MODULE_MANIFESTS, type ModuleManifest } from '@/permissions/registry';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { ChevronDown, ChevronRight, Zap } from 'lucide-react';
import { PERMISSION_TEMPLATES } from '@/lib/permissions';

interface PermissionMatrixProps {
  selected: Set<string>;
  onChange: React.Dispatch<React.SetStateAction<Set<string>>>;
}

function getModuleKeys(mod: ModuleManifest): string[] {
  return mod.subtabs.flatMap(s => s.actions.map(a => `${mod.key}:${s.key}:${a.action}`));
}

export default function PermissionMatrix({ selected, onChange }: PermissionMatrixProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggle = useCallback((key: string) => {
    onChange(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }, [onChange]);

  const toggleModule = useCallback((mod: ModuleManifest) => {
    const keys = getModuleKeys(mod);
    onChange(prev => {
      const next = new Set(prev);
      const allChecked = keys.every(k => next.has(k));
      if (allChecked) {
        keys.forEach(k => next.delete(k));
      } else {
        keys.forEach(k => next.add(k));
      }
      return next;
    });
  }, [onChange]);

  const toggleExpand = (key: string) => {
    const next = new Set(expanded);
    if (next.has(key)) next.delete(key); else next.add(key);
    setExpanded(next);
  };

  const applyTemplate = (templateId: string) => {
    const tpl = PERMISSION_TEMPLATES.find(t => t.id === templateId);
    if (tpl) onChange(new Set(tpl.permissions));
  };

  return (
    <div className="space-y-3">
      {/* Templates (legacy) */}
      <div className="flex flex-wrap gap-1.5">
        <span className="text-[10px] font-medium text-muted-foreground flex items-center gap-1">
          <Zap className="w-3 h-3" /> Templates:
        </span>
        {PERMISSION_TEMPLATES.map(t => (
          <Button key={t.id} type="button" variant="outline" size="sm"
            className="h-6 text-[10px] px-2"
            onClick={() => applyTemplate(t.id)}>
            {t.label}
          </Button>
        ))}
        <Button type="button" variant="ghost" size="sm"
          className="h-6 text-[10px] px-2 text-destructive"
          onClick={() => onChange(new Set())}>
          Limpar tudo
        </Button>
      </div>

      {/* Module tree — new granular structure */}
      <div className="border border-border rounded-lg divide-y divide-border max-h-[400px] overflow-y-auto">
        {MODULE_MANIFESTS.map(mod => {
          const moduleKeys = getModuleKeys(mod);
          const allChecked = moduleKeys.length > 0 && moduleKeys.every(k => selected.has(k));
          const someChecked = moduleKeys.some(k => selected.has(k));
          const isExpanded = expanded.has(mod.key);

          return (
            <div key={mod.key}>
              {/* Module header */}
              <div className="flex items-center gap-2 px-3 py-2 bg-muted/30">
                <button type="button" onClick={() => toggleExpand(mod.key)} className="text-muted-foreground hover:text-foreground">
                  {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                </button>
                <Checkbox
                  checked={allChecked ? true : someChecked ? 'indeterminate' : false}
                  onCheckedChange={() => toggleModule(mod)}
                />
                <span className="text-xs font-semibold text-foreground">{mod.label}</span>
                <span className="text-[10px] text-muted-foreground ml-auto">
                  {moduleKeys.filter(k => selected.has(k)).length}/{moduleKeys.length}
                </span>
              </div>

              {/* Expanded: subtabs */}
              {isExpanded && (
                <div className="pl-8 pr-3 py-1.5 space-y-1.5 bg-background">
                  {mod.subtabs.map(sub => (
                    <div key={sub.key} className="border-l-2 border-border pl-3 py-1">
                      <p className="text-[11px] font-medium text-muted-foreground mb-1">{sub.label}</p>
                      <div className="flex flex-wrap gap-3">
                        {sub.actions.map(act => {
                          const key = `${mod.key}:${sub.key}:${act.action}`;
                          return (
                            <label key={key} className="flex items-center gap-1.5 cursor-pointer">
                              <Checkbox
                                checked={selected.has(key)}
                                onCheckedChange={() => toggle(key)}
                              />
                              <span className="text-[11px] text-foreground">{act.label}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
