import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BRLInput, CurrencyInput } from '@/components/ui/brl-input';

function NumericCurrencyHarness() {
  const [value, setValue] = useState(84);
  return (
    <CurrencyInput
      aria-label="Valor"
      value={String(value)}
      onValueChange={(_, parsed) => setValue(parsed ?? 0)}
      showPrefix
    />
  );
}

describe('currency inputs', () => {
  it('preserves a comma while a numeric parent rerenders on each keystroke', () => {
    render(<NumericCurrencyHarness />);
    const input = screen.getByLabelText('Valor') as HTMLInputElement;

    expect(input.value).toBe('84,00');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '84,' } });
    expect(input.value).toBe('84,');

    fireEvent.change(input, { target: { value: '84,02' } });
    expect(input.value).toBe('84,02');
    fireEvent.blur(input);
    expect(input.value).toBe('84,02');
  });

  it('accepts a dot and formats it with a Brazilian decimal comma on blur', () => {
    render(<NumericCurrencyHarness />);
    const input = screen.getByLabelText('Valor') as HTMLInputElement;

    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '84.02' } });
    fireEvent.blur(input);

    expect(input.value).toBe('84,02');
  });

  it('formats thousands and keeps numeric-state BRL fields editable', () => {
    function Harness() {
      const [value, setValue] = useState(1234.56);
      return <BRLInput aria-label="Total" numericValue={value} onNumericChange={setValue} showPrefix />;
    }

    render(<Harness />);
    const input = screen.getByLabelText('Total') as HTMLInputElement;
    expect(input.value).toBe('1.234,56');

    fireEvent.focus(input);
    expect(input.value).toBe('1234,56');
    fireEvent.blur(input);
    expect(input.value).toBe('1.234,56');
  });
});
