interface Props {
  strength: number;
  strengthLabel: string;
  strengthColor: string;
  errors: string[];
  serverErrors: string[];
}

export default function PasswordStrengthMeter({ strength, strengthLabel, strengthColor, errors, serverErrors }: Props) {
  if (strength === 0 && errors.length === 0) return null;

  return (
    <div className="space-y-1.5 mt-1.5">
      {/* Strength bar */}
      <div className="flex items-center gap-2">
        <div className="flex-1 flex gap-0.5">
          {[1, 2, 3, 4, 5].map(i => (
            <div
              key={i}
              className={`h-1 flex-1 rounded-full transition-all duration-200 ${
                i <= strength ? strengthColor : 'bg-border'
              }`}
            />
          ))}
        </div>
        {strengthLabel && (
          <span className={`text-[10px] font-semibold ${
            strength <= 2 ? 'text-destructive' : strength <= 3 ? 'text-warning' : 'text-success'
          }`}>
            {strengthLabel}
          </span>
        )}
      </div>

      {/* Errors */}
      {(errors.length > 0 || serverErrors.length > 0) && (
        <div className="space-y-0.5">
          {errors.map((err, i) => (
            <p key={i} className="text-[10px] text-muted-foreground">• {err}</p>
          ))}
          {serverErrors.map((err, i) => (
            <p key={`s-${i}`} className="text-[10px] text-destructive font-medium">⚠ {err}</p>
          ))}
        </div>
      )}
    </div>
  );
}
