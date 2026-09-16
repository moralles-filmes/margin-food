import { beforeEach, describe, expect, it } from 'vitest';
import { resolveCompanySelection, readCompanyPreference, writeCompanyPreference } from './companySelection';
import { cacheGet, cacheSet, cacheInvalidate } from '@/components/cmv/cmvCache';
const units = [{ id: 'A', nome: 'Centro' }, { id: 'B', nome: 'Shopping' }];
const client = {};
beforeEach(() => { localStorage.clear(); cacheInvalidate(client); });
describe('seleção autorizada de unidade', () => {
  it('seleciona a única unidade sem exigir escolha', () => expect(resolveCompanySelection([units[0]])).toBe('A'));
  it('exige escolha para várias unidades sem preferência válida', () => {
    expect(resolveCompanySelection(units)).toBeNull();
    expect(resolveCompanySelection(units, 'C')).toBeNull();
  });
  it('restaura preferência por identidade apenas se ainda autorizada', () => {
    writeCompanyPreference('user-1', 'B');
    expect(readCompanyPreference('user-2')).toBeNull();
    expect(resolveCompanySelection(units, readCompanyPreference('user-1'))).toBe('B');
    expect(resolveCompanySelection([units[0]], readCompanyPreference('user-1'))).toBe('A');
    expect(resolveCompanySelection([], readCompanyPreference('user-1'))).toBeNull();
  });
  it('não compartilha o cache de CMV entre lojas ou usuários', () => {
    cacheSet(client, 'cmv', { companyId:'A', userId:'one', month:'2026-09' }, { revenue:10 }, 60);
    expect(cacheGet(client, 'cmv', { companyId:'A', userId:'one', month:'2026-09' })).toEqual({ revenue:10 });
    expect(cacheGet(client, 'cmv', { companyId:'B', userId:'one', month:'2026-09' })).toBeNull();
    expect(cacheGet(client, 'cmv', { companyId:'A', userId:'two', month:'2026-09' })).toBeNull();
    expect(cacheGet({}, 'cmv', { companyId:'A', userId:'one', month:'2026-09' })).toBeNull();
  });
});
