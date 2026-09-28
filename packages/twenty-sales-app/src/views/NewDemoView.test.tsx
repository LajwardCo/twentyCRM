// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TDATA, TDEMO, TFUEL } from '../lib/strings';

const api = {
  createDemo: vi.fn(),
  checkDemoSubdomain: vi.fn(),
};
vi.mock('../api/demoSystems', () => ({
  createDemo: (...args: unknown[]) => api.createDemo(...args),
  checkDemoSubdomain: (...args: unknown[]) => api.checkDemoSubdomain(...args),
  DemoApiError: class DemoApiError extends Error {},
}));
vi.mock('../lib/router', () => ({ navigate: vi.fn() }));
vi.mock('../lib/workbench', () => ({ announceDockablePage: vi.fn(), clearDockablePage: vi.fn() }));

import { NewDemoView } from './NewDemoView';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

const buttonWithText = (text: string): HTMLButtonElement => {
  const match = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes(text));
  if (!match) throw new Error(`no button containing "${text}"`);
  return match;
};
const click = async (el: HTMLElement) => {
  await act(async () => el.click());
};
const type = async (input: HTMLInputElement, value: string) => {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  await act(async () => {
    setter?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
};

beforeEach(async () => {
  api.createDemo.mockResolvedValue({ id: 7 });
  api.checkDemoSubdomain.mockResolvedValue({ available: true });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root.render(<NewDemoView />));
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.clearAllMocks();
});

describe('NewDemoView', () => {
  it('should offer the oil & gas and station demos', () => {
    expect(buttonWithText(TFUEL.oilGas)).toBeTruthy();
    expect(buttonWithText(TFUEL.station)).toBeTruthy();
  });

  it('should not continue until the agent answers the sample-data question', async () => {
    await type(container.querySelector('#demo-name') as HTMLInputElement, 'Pamir Fuel');
    expect(buttonWithText(TDEMO.next).disabled).toBe(true);

    await click(buttonWithText(TDATA.clean));
    expect(buttonWithText(TDEMO.next).disabled).toBe(false);
  });

  it('should send the chosen fuel type and a clean system to Core', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    await click(buttonWithText(TFUEL.station));
    await type(container.querySelector('#demo-name') as HTMLInputElement, 'Pamir Fuel');
    await click(buttonWithText(TDATA.clean));
    await click(buttonWithText(TDEMO.next));

    // A clean demo has no sample catalog, so the demo-content toggles are hidden.
    expect(container.textContent).not.toContain(TDEMO.demoContentTitle);
    await type(container.querySelector('#demo-sub') as HTMLInputElement, 'pamir-fuel');
    await act(async () => {
      vi.advanceTimersByTime(600);
    });
    await click(buttonWithText(TDEMO.next));
    await click(buttonWithText(TDEMO.next));
    await click(container.querySelector('.demo-agree-check input') as HTMLInputElement);
    expect(container.textContent).toContain(TDATA.no);
    await click(buttonWithText(TDEMO.create));
    vi.useRealTimers();

    expect(api.createDemo).toHaveBeenCalledTimes(1);
    expect(api.createDemo.mock.calls[0][0]).toMatchObject({
      business_type: 'gas_station',
      sample_data: false,
      inventory_enabled: true,
    });
  });

  it('should show the demo-content toggles when the demo gets sample data', async () => {
    await click(buttonWithText(TFUEL.oilGas));
    await type(container.querySelector('#demo-name') as HTMLInputElement, 'Hindukush Oil');
    await click(buttonWithText(TDATA.withData));
    await click(buttonWithText(TDEMO.next));
    expect(container.textContent).toContain(TDEMO.demoContentTitle);
  });
});
