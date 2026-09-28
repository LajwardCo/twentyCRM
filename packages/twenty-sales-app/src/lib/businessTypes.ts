import type { DemoBusinessType } from '../api/demoSystems';
import type { SystemBusinessType, SystemUserRole } from '../api/customerSystems';
import { TASM, TDEMO, TFUEL, TSYS } from './strings';

// Assembly (manufacturing) tenants run on one of three product variants; the
// platform treats them alike, the variant only fixes the production style the
// workspace is branded for.
export type AssemblyVariant = 'assembly' | 'assembly_mts' | 'assembly_mto';
export type AssemblyIndustry = 'furniture' | 'carton' | 'doors';

export const ASSEMBLY_VARIANTS: { key: AssemblyVariant; label: string; desc: string }[] = [
  { key: 'assembly', label: TASM.variantGeneral, desc: TASM.variantGeneralDesc },
  { key: 'assembly_mts', label: TASM.variantMts, desc: TASM.variantMtsDesc },
  { key: 'assembly_mto', label: TASM.variantMto, desc: TASM.variantMtoDesc },
];
export const DEFAULT_ASSEMBLY_VARIANT: AssemblyVariant = 'assembly';

// A demo's industry is its business type (each ships its own catalog).
export const ASSEMBLY_INDUSTRIES: { key: AssemblyIndustry; label: string; desc: string }[] = [
  { key: 'furniture', label: TASM.industryFurniture, desc: TASM.industryFurnitureDesc },
  { key: 'carton', label: TASM.industryCarton, desc: TASM.industryCartonDesc },
  { key: 'doors', label: TASM.industryDoors, desc: TASM.industryDoorsDesc },
];

export const assemblyDemoType = (industry: AssemblyIndustry): DemoBusinessType => `assembly_${industry}`;

export const isAssemblyDemoType = (type: string): boolean =>
  ASSEMBLY_INDUSTRIES.some((industry) => assemblyDemoType(industry.key) === type);

export const assemblyIndustryOf = (type: string): AssemblyIndustry | null =>
  ASSEMBLY_INDUSTRIES.find((industry) => assemblyDemoType(industry.key) === type)?.key ?? null;

export const assemblyVariantLabel = (variant: string | null | undefined): string =>
  ASSEMBLY_VARIANTS.find((option) => option.key === variant)?.label ?? TASM.variantGeneral;

const DEMO_LABELS: Record<string, string> = {
  mobile_store: TDEMO.bizMobile,
  home_appliances: TDEMO.bizAppliances,
  snooker_club: TDEMO.bizSnooker,
  car_rental: TDEMO.bizCarRental,
  booking: TDEMO.bizBooking,
  opd: TDEMO.bizOpd,
  oil_and_gas: TFUEL.oilGas,
  gas_station: TFUEL.station,
  other: TDEMO.bizOther,
};

const SYSTEM_LABELS: Record<SystemBusinessType, string> = {
  retail: TSYS.typeRetail,
  services: TSYS.typeServices,
  booking: TSYS.typeBooking,
  assembly: TASM.assembly,
  oil_and_gas: TFUEL.oilGas,
  gas_station: TFUEL.station,
  general: TSYS.typeGeneral,
};

// "Assembly · Furniture · Make-to-order" for an assembly demo, the plain type
// label otherwise.
export const demoBusinessLabel = (type: string, variant?: string | null): string => {
  const industry = ASSEMBLY_INDUSTRIES.find((option) => option.key === assemblyIndustryOf(type));
  if (industry) return [TASM.assembly, industry.label, assemblyVariantLabel(variant)].join(' · ');
  return DEMO_LABELS[type] ?? type;
};

export const systemBusinessLabel = (type: string, variant?: string | null): string => {
  if (type === 'assembly') return `${TASM.assembly} · ${assemblyVariantLabel(variant)}`;
  return SYSTEM_LABELS[type as SystemBusinessType] ?? type;
};

// An assembly tenant's role groups come from its own templates: production and
// purchasing roles exist only there, while manager/cashier have no template.
const ASSEMBLY_ONLY_ROLES: SystemUserRole[] = ['assembly', 'purchaser_person'];
const NON_ASSEMBLY_ROLES: SystemUserRole[] = ['manager', 'cashier'];

export const isRoleAvailableFor = (type: SystemBusinessType, role: SystemUserRole): boolean =>
  type === 'assembly' ? !NON_ASSEMBLY_ROLES.includes(role) : !ASSEMBLY_ONLY_ROLES.includes(role);
