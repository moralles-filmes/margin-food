import { useState, useCallback, useRef, useEffect } from 'react';
import { Calculator, X, GripVertical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const STORAGE_KEY = 'calc-position';
const PANEL_W = 288;
const PANEL_H = 380;
const FAB_SIZE = 48;
const MARGIN = 8;
const DRAG_THRESHOLD = 5; // px movement to distinguish drag from click

function clamp(x: number, y: number, w: number, h: number): { x: number; y: number } {
  const maxX = window.innerWidth - w - MARGIN;
  const maxY = window.innerHeight - h - MARGIN;
  return {
    x: Math.max(MARGIN, Math.min(x, maxX)),
    y: Math.max(MARGIN, Math.min(y, maxY)),
  };
}

function loadPosition(): { x: number; y: number } | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed.x === 'number' && typeof parsed.y === 'number') {
      return clamp(parsed.x, parsed.y, FAB_SIZE, FAB_SIZE);
    }
  } catch { /* ignore */ }
  return null;
}

function savePosition(x: number, y: number) {
  try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ x, y })); } catch { /* ignore */ }
}

export default function FloatingCalculator() {
  const [open, setOpen] = useState(false);
  const [display, setDisplay] = useState('0');
  const [prev, setPrev] = useState<number | null>(null);
  const [op, setOp] = useState<string | null>(null);
  const [resetNext, setResetNext] = useState(false);

  // Shared position (top-left of wherever the element is)
  const defaultPos = { x: window.innerWidth - FAB_SIZE - 24, y: window.innerHeight - FAB_SIZE - 24 };
  const [position, setPosition] = useState(() => loadPosition() || defaultPos);
  const dragging = useRef(false);
  const didDrag = useRef(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const fabPosBeforeOpen = useRef<{ x: number; y: number } | null>(null);
  const dragOffset = useRef({ x: 0, y: 0 });

  // Clamp on resize
  useEffect(() => {
    const onResize = () => {
      setPosition(p => {
        const size = open ? { w: PANEL_W, h: PANEL_H } : { w: FAB_SIZE, h: FAB_SIZE };
        return clamp(p.x, p.y, size.w, size.h);
      });
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [open]);

  // When toggling open, re-clamp for the new size
  const toggleOpen = useCallback(() => {
    setOpen(prev => {
      const next = !prev;
      if (next) {
        // Opening: save FAB position, then clamp for panel size
        setPosition(p => {
          fabPosBeforeOpen.current = { ...p };
          return clamp(p.x, p.y, PANEL_W, PANEL_H);
        });
      } else {
        // Closing: restore FAB position
        if (fabPosBeforeOpen.current) {
          const restored = clamp(fabPosBeforeOpen.current.x, fabPosBeforeOpen.current.y, FAB_SIZE, FAB_SIZE);
          setPosition(restored);
          savePosition(restored.x, restored.y);
        } else {
          setPosition(p => clamp(p.x, p.y, FAB_SIZE, FAB_SIZE));
        }
      }
      return next;
    });
  }, []);

  // Shared drag handlers — used by both FAB and panel header
  const onDragPointerDown = useCallback((e: React.PointerEvent) => {
    dragging.current = true;
    didDrag.current = false;
    dragStart.current = { x: e.clientX, y: e.clientY };
    dragOffset.current = { x: e.clientX - position.x, y: e.clientY - position.y };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    e.preventDefault();
  }, [position]);

  const onDragPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging.current) return;
    const dx = e.clientX - dragStart.current.x;
    const dy = e.clientY - dragStart.current.y;
    if (!didDrag.current && Math.abs(dx) + Math.abs(dy) < DRAG_THRESHOLD) return;
    didDrag.current = true;
    const w = open ? PANEL_W : FAB_SIZE;
    const h = open ? PANEL_H : FAB_SIZE;
    setPosition(clamp(e.clientX - dragOffset.current.x, e.clientY - dragOffset.current.y, w, h));
  }, [open]);

  const onDragPointerUp = useCallback((e: React.PointerEvent) => {
    if (!dragging.current) return;
    dragging.current = false;
    try { (e.target as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    if (didDrag.current) {
      const w = open ? PANEL_W : FAB_SIZE;
      const h = open ? PANEL_H : FAB_SIZE;
      const newPos = clamp(e.clientX - dragOffset.current.x, e.clientY - dragOffset.current.y, w, h);
      setPosition(newPos);
      savePosition(newPos.x, newPos.y);
    }
  }, [open]);

  // FAB pointer up: open only if not dragged
  const onFabPointerUp = useCallback((e: React.PointerEvent) => {
    onDragPointerUp(e);
    if (!didDrag.current) {
      toggleOpen();
    }
  }, [onDragPointerUp, toggleOpen]);

  const handleNumber = useCallback((n: string) => {
    setDisplay(d => {
      if (resetNext || d === '0') { setResetNext(false); return n; }
      return d + n;
    });
  }, [resetNext]);

  const handleDot = useCallback(() => {
    setDisplay(d => {
      if (resetNext) { setResetNext(false); return '0.'; }
      return d.includes('.') ? d : d + '.';
    });
  }, [resetNext]);

  const calc = useCallback((a: number, operator: string, b: number): number => {
    switch (operator) {
      case '+': return a + b;
      case '-': return a - b;
      case '×': return a * b;
      case '÷': return b === 0 ? 0 : a / b;
      default: return b;
    }
  }, []);

  const handleOp = useCallback((nextOp: string) => {
    const cur = parseFloat(display);
    if (prev !== null && op && !resetNext) {
      const result = calc(prev, op, cur);
      setPrev(result);
      setDisplay(String(parseFloat(result.toFixed(10))));
    } else {
      setPrev(cur);
    }
    setOp(nextOp);
    setResetNext(true);
  }, [display, prev, op, resetNext, calc]);

  const handleEquals = useCallback(() => {
    if (prev === null || !op) return;
    const cur = parseFloat(display);
    const result = calc(prev, op, cur);
    setDisplay(String(parseFloat(result.toFixed(10))));
    setPrev(null);
    setOp(null);
    setResetNext(true);
  }, [display, prev, op, calc]);

  const handlePercent = useCallback(() => {
    const cur = parseFloat(display);
    if (prev !== null && op) {
      setDisplay(String(parseFloat((prev * cur / 100).toFixed(10))));
    } else {
      setDisplay(String(parseFloat((cur / 100).toFixed(10))));
    }
    setResetNext(true);
  }, [display, prev, op]);

  const handleClear = useCallback(() => {
    setDisplay('0');
    setPrev(null);
    setOp(null);
    setResetNext(false);
  }, []);

  const handleToggleSign = useCallback(() => {
    setDisplay(d => d.startsWith('-') ? d.slice(1) : d === '0' ? d : '-' + d);
  }, []);

  const numBtn = "h-10 text-base font-medium bg-muted hover:bg-muted/80 text-foreground";
  const opBtn = "h-10 text-base font-medium bg-primary/15 hover:bg-primary/25 text-primary";
  const fnBtn = "h-10 text-sm font-medium bg-secondary hover:bg-secondary/80 text-secondary-foreground";

  return (
    <>
      {/* FAB — draggable + click to open */}
      {!open && (
        <button
          onPointerDown={onDragPointerDown}
          onPointerMove={onDragPointerMove}
          onPointerUp={onFabPointerUp}
          className={cn(
            "fixed z-40 w-12 h-12 rounded-full shadow-lg flex items-center justify-center transition-shadow select-none touch-none",
            "bg-primary text-primary-foreground hover:bg-primary/90",
          )}
          style={{ left: position.x, top: position.y, cursor: 'grab' }}
          title="Calculadora — arraste para mover"
        >
          <Calculator className="w-5 h-5 pointer-events-none" />
        </button>
      )}

      {/* Calculator panel */}
      {open && (
        <div
          className="fixed z-50 w-72 rounded-2xl border border-border bg-card shadow-2xl animate-scale-in overflow-hidden"
          style={{ left: position.x, top: position.y }}
        >
          {/* Header — drag handle */}
          <div
            className="flex items-center justify-between px-4 py-2 border-b border-border bg-muted/40 select-none touch-none"
            style={{ cursor: 'grab' }}
            onPointerDown={onDragPointerDown}
            onPointerMove={onDragPointerMove}
            onPointerUp={onDragPointerUp}
          >
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <GripVertical className="w-3.5 h-3.5 text-muted-foreground/50" />
              <Calculator className="w-4 h-4 text-primary" />
              Calculadora
            </div>
            <button
              onClick={() => toggleOpen()}
              onPointerDown={(e) => e.stopPropagation()}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Display */}
          <div className="px-4 py-3 text-right">
            {prev !== null && op && (
              <p className="text-xs text-muted-foreground truncate">{prev} {op}</p>
            )}
            <p className="text-2xl font-mono font-bold text-foreground truncate">{display}</p>
          </div>

          {/* Buttons */}
          <div className="grid grid-cols-4 gap-1 p-2">
            <Button variant="ghost" className={fnBtn} onClick={handleClear}>C</Button>
            <Button variant="ghost" className={fnBtn} onClick={handleToggleSign}>±</Button>
            <Button variant="ghost" className={fnBtn} onClick={handlePercent}>%</Button>
            <Button variant="ghost" className={opBtn} onClick={() => handleOp('÷')}>÷</Button>

            {['7','8','9'].map(n => <Button key={n} variant="ghost" className={numBtn} onClick={() => handleNumber(n)}>{n}</Button>)}
            <Button variant="ghost" className={opBtn} onClick={() => handleOp('×')}>×</Button>

            {['4','5','6'].map(n => <Button key={n} variant="ghost" className={numBtn} onClick={() => handleNumber(n)}>{n}</Button>)}
            <Button variant="ghost" className={opBtn} onClick={() => handleOp('-')}>−</Button>

            {['1','2','3'].map(n => <Button key={n} variant="ghost" className={numBtn} onClick={() => handleNumber(n)}>{n}</Button>)}
            <Button variant="ghost" className={opBtn} onClick={() => handleOp('+')}>+</Button>

            <Button variant="ghost" className={cn(numBtn, "col-span-2")} onClick={() => handleNumber('0')}>0</Button>
            <Button variant="ghost" className={numBtn} onClick={handleDot}>.</Button>
            <Button className="h-10 text-base font-bold bg-primary text-primary-foreground hover:bg-primary/90" onClick={handleEquals}>=</Button>
          </div>
        </div>
      )}
    </>
  );
}