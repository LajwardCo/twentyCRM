import { describe, expect, it } from 'vitest';

import {
  assemblyDemoType,
  assemblyIndustryOf,
  demoBusinessLabel,
  isAssemblyDemoType,
  isRoleAvailableFor,
  systemBusinessLabel,
} from './businessTypes';
import { TASM, TDEMO, TFUEL, TSYS, TTRADE } from './strings';

describe('assembly business types', () => {
  it('should map each industry to its demo business type and back', () => {
    expect(assemblyDemoType('furniture')).toBe('assembly_furniture');
    expect(assemblyIndustryOf('assembly_doors')).toBe('doors');
    expect(assemblyIndustryOf('mobile_store')).toBeNull();
  });

  it('should recognise only the assembly industries as assembly demos', () => {
    expect(isAssemblyDemoType('assembly_carton')).toBe(true);
    expect(isAssemblyDemoType('assembly')).toBe(false);
    expect(isAssemblyDemoType('opd')).toBe(false);
  });

  it('should label an assembly demo with its industry and variant', () => {
    expect(demoBusinessLabel('assembly_carton', 'assembly_mto')).toBe(
      [TASM.assembly, TASM.industryCarton, TASM.variantMto].join(' · '),
    );
    expect(demoBusinessLabel('assembly_furniture', '')).toContain(TASM.variantGeneral);
  });

  it('should keep the plain labels for other types', () => {
    expect(demoBusinessLabel('opd')).toBe(TDEMO.bizOpd);
    expect(demoBusinessLabel('unknown_type')).toBe('unknown_type');
    expect(systemBusinessLabel('retail')).toBe(TSYS.typeRetail);
    expect(systemBusinessLabel('assembly', 'assembly_mts')).toBe(`${TASM.assembly} · ${TASM.variantMts}`);
  });
});

describe('customer-system roles', () => {
  it('should offer production and purchasing roles only on assembly systems', () => {
    expect(isRoleAvailableFor('assembly', 'assembly')).toBe(true);
    expect(isRoleAvailableFor('assembly', 'purchaser_person')).toBe(true);
    expect(isRoleAvailableFor('retail', 'assembly')).toBe(false);
  });

  it('should hide manager and cashier on assembly systems', () => {
    expect(isRoleAvailableFor('assembly', 'manager')).toBe(false);
    expect(isRoleAvailableFor('assembly', 'cashier')).toBe(false);
    expect(isRoleAvailableFor('retail', 'cashier')).toBe(true);
    expect(isRoleAvailableFor('assembly', 'seller')).toBe(true);
  });
});

describe('fuel business types', () => {
  it('should label the oil & gas and station demos', () => {
    expect(demoBusinessLabel('oil_and_gas')).toBe(TFUEL.oilGas);
    expect(demoBusinessLabel('gas_station')).toBe(TFUEL.station);
  });

  it('should label the oil & gas and station customer systems', () => {
    expect(systemBusinessLabel('oil_and_gas')).toBe(TFUEL.oilGas);
    expect(systemBusinessLabel('gas_station')).toBe(TFUEL.station);
  });

  it('should offer the retail roles (not the production ones) on a fuel system', () => {
    expect(isRoleAvailableFor('gas_station', 'cashier')).toBe(true);
    expect(isRoleAvailableFor('oil_and_gas', 'assembly')).toBe(false);
  });
});

describe('import/export business type', () => {
  it('should label the demo and the customer system', () => {
    expect(demoBusinessLabel('import_export')).toBe(TTRADE.importExport);
    expect(systemBusinessLabel('import_export')).toBe(TTRADE.importExport);
  });
});
