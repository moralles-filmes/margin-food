import { useState, forwardRef } from 'react';
import { Input } from '@/components/ui/input';
import { Eye, EyeOff } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

interface PasswordInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  /** Extra className for the wrapper div */
  wrapperClassName?: string;
}

const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(
  ({ className, wrapperClassName, ...props }, ref) => {
    const [visible, setVisible] = useState(false);

    return (
      <div className={cn('relative', wrapperClassName)}>
        <Input
          ref={ref}
          type={visible ? 'text' : 'password'}
          className={cn('pr-9', className)}
          {...props}
        />
        <TooltipProvider delayDuration={300}>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => setVisible(v => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors cursor-pointer p-0.5 rounded-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                aria-label={visible ? 'Ocultar senha' : 'Mostrar senha'}
                tabIndex={-1}
              >
                {visible
                  ? <EyeOff className="w-4 h-4" />
                  : <Eye className="w-4 h-4" />}
              </button>
            </TooltipTrigger>
            <TooltipContent side="left" className="text-xs">
              {visible ? 'Ocultar senha' : 'Mostrar senha'}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    );
  }
);

PasswordInput.displayName = 'PasswordInput';

export default PasswordInput;
