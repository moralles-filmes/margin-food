import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Printer, X } from 'lucide-react';
import { Manipulation } from '@/types/salmon';
import { format } from 'date-fns';
import QRCode from 'qrcode';

function parseLocalDate(d: string) {
  const [y, m, dd] = d.split('-').map(Number);
  return new Date(y, m - 1, dd);
}

interface Props {
  manipulation: Manipulation;
  dataValidade: string;
  onClose: () => void;
}

export default function EtiquetaModal({ manipulation, dataValidade, onClose }: Props) {
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const printRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    QRCode.toDataURL(manipulation.id, { width: 120, margin: 1, color: { dark: '#000', light: '#fff' } })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(''));
  }, [manipulation.id]);

  const handlePrint = () => {
    if (!printRef.current) return;
    const printWindow = window.open('', '_blank', 'width=400,height=500');
    if (!printWindow) return;
    printWindow.document.write(`
      <html>
        <head>
          <title>Etiqueta Salmão</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 16px; margin: 0; }
            .label { border: 2px solid #000; border-radius: 8px; padding: 16px; max-width: 300px; margin: 0 auto; }
            .title { text-align: center; font-size: 14px; font-weight: bold; border-bottom: 1px solid #000; padding-bottom: 8px; margin-bottom: 8px; }
            .row { display: flex; justify-content: space-between; font-size: 12px; padding: 3px 0; }
            .row .label-text { font-weight: bold; }
            .qr { text-align: center; margin-top: 12px; }
            .validity { text-align: center; font-size: 16px; font-weight: bold; margin-top: 8px; padding: 8px; border: 2px solid #c00; border-radius: 4px; color: #c00; }
            @media print { body { padding: 0; } }
          </style>
        </head>
        <body>
          ${printRef.current.innerHTML}
          <script>window.onload = function() { window.print(); window.close(); }</script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const m = manipulation;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
      <div className="bg-card border border-border rounded-xl p-5 w-[90%] max-w-sm space-y-4 animate-scale-in">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-foreground">🖨 Etiqueta do Lote</p>
          <button onClick={onClose} className="p-1 rounded text-muted-foreground hover:bg-secondary">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Preview */}
        <div ref={printRef}>
          <div className="label" style={{ border: '2px solid hsl(var(--border))', borderRadius: '8px', padding: '16px' }}>
            <div style={{ textAlign: 'center', fontSize: '14px', fontWeight: 'bold', borderBottom: '1px solid hsl(var(--border))', paddingBottom: '8px', marginBottom: '8px' }}>
              🐟 SALMÃO LIMPO
            </div>
            <div className="space-y-1 text-[11px]">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Kg Limpo:</span>
                <span className="font-bold text-foreground">{m.cleanKg.toFixed(1)} kg</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Lote:</span>
                <span className="font-bold text-foreground">{m.lot || '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">SIF:</span>
                <span className="font-bold text-foreground">{m.sif || '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Fornecedor:</span>
                <span className="font-bold text-foreground">{m.supplier || '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Manipulação:</span>
                <span className="font-bold text-foreground">{format(parseLocalDate(m.date), 'dd/MM/yyyy')}</span>
              </div>
            </div>
            <div style={{ textAlign: 'center', fontSize: '14px', fontWeight: 'bold', marginTop: '8px', padding: '8px', border: '2px solid hsl(var(--destructive))', borderRadius: '4px', color: 'hsl(var(--destructive))' }}>
              VALIDADE: {format(parseLocalDate(dataValidade), 'dd/MM/yyyy')}
            </div>
            {qrDataUrl && (
              <div style={{ textAlign: 'center', marginTop: '12px' }}>
                <img src={qrDataUrl} alt="QR Code" style={{ width: '100px', height: '100px', margin: '0 auto' }} />
                <p style={{ fontSize: '9px', color: '#999', marginTop: '4px' }}>{m.id.slice(0, 8)}</p>
              </div>
            )}
          </div>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="flex-1 text-xs border-border text-muted-foreground" onClick={onClose}>
            Fechar
          </Button>
          <Button size="sm" className="flex-1 bg-primary-strong text-primary-foreground border-0 text-xs gap-1" onClick={handlePrint}>
            <Printer className="w-3.5 h-3.5" /> Imprimir
          </Button>
        </div>
      </div>
    </div>
  );
}
