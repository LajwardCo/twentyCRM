// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TDATA, TFUEL, TSYS } from '../lib/strings';

const api = {
  createSystem: vi.fn(),
  checkSystemSubdomain: vi.fn(),
};
vi.mock('../api/customerSystems', () => ({
  createSystem: (...args: unknown[]) => api.createSystem(...args),
  checkSystemSubdomain: (...args: unknown[]) => api.checkSystemSubdomain(...args),
  SystemApiError: class SystemApiError extends Error {},
}));
vi.mock('../api/usystems', () => ({ fetchCompanyUsystemsContactId: vi.fn().mockResolvedValue('') }));
vi.mock('../lib/router', () => ({
  navigate: vi.fn(),
  useRoute: () => ({ path: '/systems/new', query: 'leadId=lead-1&leadName=Pamir%20Fuel' }),
}));
vi.mock('../lib/workbench', () => ({ announceDockablePage: vi.fn(), clearDockablePage: vi.fn() }));

import { NewCustomerSystemView } from './NewCustomerSystemView';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

const buttonWithText = (text: string): HTMLButtonElement => {
  const match = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes(text));
  if (!match) throw new Error(`no button containing "${text}"`);
  return match;
};

beforeEach(async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  api.checkSystemSubdomain.mockResolvedValue({ available: true });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root.render(<NewCustomerSystemView />));
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('NewCustomerSystemView', () => {
  it('should offer oil & gas and station systems and require the sample-data answer', async () => {
    await act(async () => buttonWithText(TFUEL.oilGas).click());
    const sub = container.querySelector('#sys-sub') as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    await act(async () => {
      setter?.call(sub, 'pamir-fuel');
      sub.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => {
      vi.advanceTimersByTime(600);
    });
    // Name (prefilled from the lead) and address are there — only the answer is missing.
    expect(buttonWithText(TSYS.next).disabled).toBe(true);

    await act(async () => buttonWithText(TDATA.withData).click());
    expect(buttonWithText(TSYS.next).disabled).toBe(false);
    expect(buttonWithText(TFUEL.station)).toBeTruthy();
  });
});
