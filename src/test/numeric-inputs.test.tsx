import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Input } from '@/components/ui/input';
import { BRLInput, CurrencyInput } from '@/components/ui/brl-input';
import { DecimalInput } from '@/components/ui/decimal-input';
import { PercentInput } from '@/components/ui/percent-input';
import { MoneyInput, NumericInput } from '@/components/ui/numeric-input';
import { isZeroNumericValue, parseLooseNumber, stripLeadingZeros } from '@/lib/numericInputDisplay';

function NumberHarness({ recurrence = false }: { recurrence?: boolean }) {
  const [value, setValue] = useState(recurrence ? 2 : 0);
  return (
    <Input
      aria-label="Número"
      type="number"
      value={value}
      min={recurrence ? 2 : 0}
      max={recurrence ? 60 : undefined}
      step={1}
      onChange={e => setValue(Number.parseInt(e.target.value, 10) || 0)}
      onBlur={recurrence ? () => setValue(Math.min(Math.max(value || 2, 2), 60)) : undefined}
    />
  );
}

function StringNumberHarness() {
  const [value, setValue] = useState('0');
  return (
    <>
      <Input aria-label="Número" type="number" value={value} onChange={e => setValue(e.target.value)} />
      <output data-testid="parent-value">{value}</output>
    </>
  );
}

const stringInputs = { CurrencyInput, DecimalInput, PercentInput, NumericInput, MoneyInput };
type StringInputKind = keyof typeof stringInputs;

function StringValueHarness({ kind, showZero = false }: { kind: StringInputKind; showZero?: boolean }) {
  const [value, setValue] = useState('0');
  const Component = stringInputs[kind];
  return (
    <>
      <Component aria-label="Valor" value={value} onValueChange={setValue} showZero={showZero} />
      <output data-testid="parent-value">{value}</output>
    </>
  );
}

describe('numeric display helpers', () => {
  it.each([0, -0, '0', '0,00', 'R$ 0,00', '-0', '0.0', '00,00'])('recognizes zero: %s', value => {
    expect(isZeroNumericValue(value)).toBe(true);
  });

  it.each(['', '0,5', '10', '-', 'R$', 12, NaN, Infinity, null, undefined, false, {}, []])(
    'does not recognize nonzero or missing values as zero: %s', value => {
      expect(isZeroNumericValue(value)).toBe(false);
    },
  );

  it.each([
    ['012', '12'], ['00', '0'], ['-05', '-5'], ['0,5', '0,5'],
    ['00,5', '0,5'], ['000.5', '0.5'], ['', ''], ['-', '-'], ['12', '12'],
  ])('strips leading zeros from %s', (raw, expected) => {
    expect(stripLeadingZeros(raw)).toBe(expected);
  });

  it.each(['', '-', ',', '.', '-,', '-.'])('parses the intermediate value %s as zero', raw => {
    expect(parseLooseNumber(raw)).toBe(0);
  });

  it.each([['12', 12], ['12,5', 12.5], ['-0.5', -0.5], ['12,', 12], ['0,00', 0]] as const)(
    'parses %s', (raw, expected) => {
      expect(parseLooseNumber(raw)).toBe(expected);
    },
  );

  it.each(['invalid', '12abc', '1,2,3', '--1', 'R$ 12,00'])('rejects %s', raw => {
    expect(parseLooseNumber(raw)).toBeNaN();
  });
});

describe('controlled numeric Input', () => {
  it('starts empty and stays empty after deletion with a numeric parent', () => {
    render(<NumberHarness />);
    const input = screen.getByLabelText('Número');
    expect(input).toHaveValue('');
    expect(input).toHaveAttribute('placeholder', '0');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '12' } });
    expect(input).toHaveValue('12');
    fireEvent.change(input, { target: { value: '' } });
    expect(input).toHaveValue('');
  });

  it('clamps recurrence only on blur', () => {
    render(<NumberHarness recurrence />);
    const input = screen.getByLabelText('Número');
    expect(input).toHaveValue('2');
    expect(input).toHaveAttribute('min', '2');
    expect(input).toHaveAttribute('max', '60');
    expect(input).toHaveAttribute('step', '1');
    fireEvent.focus(input);
    for (const value of ['', '1', '12']) {
      fireEvent.change(input, { target: { value } });
      expect(input).toHaveValue(value);
    }
    fireEvent.blur(input);
    expect(input).toHaveValue('12');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.blur(input);
    expect(input).toHaveValue('2');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '99' } });
    expect(input).toHaveValue('99');
    fireEvent.blur(input);
    expect(input).toHaveValue('60');
  });

  it('hides a string zero without prepending it to typed digits', () => {
    render(<StringNumberHarness />);
    const input = screen.getByLabelText('Número');
    expect(input).toHaveValue('');
    fireEvent.change(input, { target: { value: '12' } });
    expect(input).toHaveValue('12');
    expect(screen.getByTestId('parent-value')).toHaveTextContent('12');
  });

  it('removes leading zeros before notifying the parent', () => {
    render(<StringNumberHarness />);
    const input = screen.getByLabelText('Número');
    fireEvent.change(input, { target: { value: '012' } });
    expect(input).toHaveValue('12');
    expect(screen.getByTestId('parent-value')).toHaveTextContent(/^12$/);
  });

  it('preserves equivalent drafts and displays an external parent update', () => {
    function Harness() {
      const [value, setValue] = useState(0);
      return (
        <>
          <Input aria-label="Número" type="number" value={value}
            onChange={e => setValue(parseLooseNumber(e.target.value))} />
          <button onClick={() => setValue(42)}>Atualizar</button>
        </>
      );
    }
    render(<Harness />);
    const input = screen.getByLabelText('Número');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '0,' } });
    expect(input).toHaveValue('0,');
    fireEvent.click(screen.getByText('Atualizar'));
    expect(input).toHaveValue('42');
  });

  it('keeps text inputs and uncontrolled numeric values unchanged', () => {
    const onChange = vi.fn();
    render(<><Input aria-label="Texto" type="text" value="0" onChange={e => onChange(e.target.value)} />
      <Input aria-label="Livre" type="number" defaultValue="0" /></>);
    const input = screen.getByLabelText('Texto');
    expect(input).toHaveValue('0');
    expect(input).not.toHaveAttribute('placeholder');
    expect(screen.getByLabelText('Livre')).toHaveValue('0');
    fireEvent.change(input, { target: { value: '012' } });
    expect(onChange).toHaveBeenCalledExactlyOnceWith('012');
  });
});

describe('formatted numeric inputs', () => {
  it('keeps BRL zero empty on focus and emits zero after clearing', () => {
    const onNumericChange = vi.fn();
    function Harness() {
      const [value, setValue] = useState(0);
      return <BRLInput aria-label="Valor" numericValue={value} showPrefix onNumericChange={next => {
        setValue(next);
        onNumericChange(next);
      }} />;
    }
    render(<Harness />);
    const input = screen.getByLabelText('Valor');
    expect(input).toHaveValue('');
    expect(screen.queryByText('R$')).not.toBeInTheDocument();
    fireEvent.focus(input);
    expect(input).toHaveValue('');
    fireEvent.change(input, { target: { value: '12' } });
    expect(input).toHaveValue('12');
    fireEvent.blur(input);
    expect(input).toHaveValue('12,00');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.blur(input);
    expect(input).toHaveValue('');
    expect(onNumericChange).toHaveBeenLastCalledWith(0);
  });

  it.each(['CurrencyInput', 'DecimalInput'] as const)(
    '%s preserves a hidden parent zero when focused and blurred untouched', kind => {
      render(<StringValueHarness kind={kind} />);
      const input = screen.getByLabelText('Valor');
      expect(input).toHaveValue('');
      fireEvent.focus(input);
      expect(input).toHaveValue('');
      fireEvent.blur(input);
      expect(input).toHaveValue('');
      expect(screen.getByTestId('parent-value')).toHaveTextContent(/^0$/);
    },
  );

  it.each(['PercentInput', 'NumericInput', 'MoneyInput'] as const)(
    '%s hides the parent zero but preserves a zero being typed until blur', kind => {
      render(<StringValueHarness kind={kind} />);
      const input = screen.getByLabelText('Valor');
      expect(input).toHaveValue('');
      expect(screen.queryByText('%')).not.toBeInTheDocument();
      expect(screen.queryByText('R$')).not.toBeInTheDocument();
      fireEvent.focus(input);
      fireEvent.change(input, { target: { value: '0,' } });
      expect(input).toHaveValue('0,');
      fireEvent.change(input, { target: { value: '0,5' } });
      expect(input).toHaveValue('0,5');
      fireEvent.change(input, { target: { value: '0' } });
      expect(input).toHaveValue('0');
      fireEvent.blur(input);
      expect(input).toHaveValue('');
    },
  );

  it.each(['CurrencyInput', 'DecimalInput'] as const)(
    '%s emits a formatted zero on blur and preserves explicit deletion', kind => {
      render(<StringValueHarness kind={kind} />);
      const input = screen.getByLabelText('Valor');
      fireEvent.focus(input);
      fireEvent.change(input, { target: { value: '0,0' } });
      expect(input).toHaveValue('0,0');
      fireEvent.blur(input);
      expect(input).toHaveValue('');
      expect(screen.getByTestId('parent-value')).toHaveTextContent(kind === 'CurrencyInput' ? /^0,00$/ : /^0$/);
      fireEvent.focus(input);
      fireEvent.change(input, { target: { value: '12' } });
      fireEvent.change(input, { target: { value: '' } });
      fireEvent.blur(input);
      expect(input).toHaveValue('');
      expect(screen.getByTestId('parent-value')).toBeEmptyDOMElement();
    },
  );

  it.each([
    ['CurrencyInput', '0,00'], ['DecimalInput', '0'], ['PercentInput', '0'],
    ['NumericInput', '0'], ['MoneyInput', '0'],
  ] as const)('%s honors showZero without forwarding it to the DOM', (kind, expected) => {
    render(<StringValueHarness kind={kind} showZero />);
    const input = screen.getByLabelText('Valor');
    expect(input).toHaveValue(expected);
    expect(input).not.toHaveAttribute('showZero');
  });

  it('parses manual balances with commas and negatives, distinguishing zero from automatic', () => {
    function Harness() {
      const [value, setValue] = useState<number | null>(null);
      return (
        <>
          <CurrencyInput aria-label="Saldo manual" showZero placeholder="Automático"
            value={value == null ? '' : String(value)}
            onValueChange={(raw, parsed) => setValue(raw === '' ? null : parsed)} />
          <output data-testid="parent-value">{value == null ? 'null' : String(value)}</output>
        </>
      );
    }
    render(<Harness />);
    const input = screen.getByLabelText('Saldo manual');
    expect(input).toHaveAttribute('placeholder', 'Automático');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '1500,50' } });
    expect(screen.getByTestId('parent-value')).toHaveTextContent(/^1500.5$/);
    fireEvent.change(input, { target: { value: '-' } });
    expect(input).toHaveValue('-');
    expect(screen.getByTestId('parent-value')).toHaveTextContent('null');
    fireEvent.change(input, { target: { value: '-1500,50' } });
    expect(screen.getByTestId('parent-value')).toHaveTextContent(/^-1500.5$/);
    fireEvent.change(input, { target: { value: '0' } });
    fireEvent.blur(input);
    expect(input).toHaveValue('0,00');
    expect(screen.getByTestId('parent-value')).toHaveTextContent(/^0$/);
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.blur(input);
    expect(input).toHaveValue('');
    expect(screen.getByTestId('parent-value')).toHaveTextContent('null');
  });
});
