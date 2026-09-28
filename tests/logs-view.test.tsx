import { cleanup, fireEvent, render, screen, waitFor, act } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { LogsView } from '../src/features/logs/LogsView';
import { getBridge } from '../src/services/bridge';
import { useApp } from '../src/stores/app';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

it('starts on demand, isolates sessions, and stops on unmount', async () => {
  const bridge = getBridge();
  const start = vi.spyOn(bridge, 'logcatStart').mockResolvedValue('test-session');
  const stop = vi.spyOn(bridge, 'logcatStop').mockResolvedValue();
  const off = vi.fn();
  let receive: (payload: unknown) => void = () => {};
  vi.spyOn(bridge, 'on').mockImplementation((_, cb) => { receive = cb; return off; });
  const t = useApp.getState().t;
  const view = render(<LogsView serial="device" />);
  expect(start).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: t('logs.start') }));
  await waitFor(() => expect(screen.getByRole('button', { name: t('logs.stop') })).toBeEnabled());
  expect(start).toHaveBeenCalledWith('device', undefined);
  act(() => {
    receive({ session: 'other', line: 'unrelated log' });
    receive({ session: 'test-session', line: 'device log\n' });
  });
  expect(screen.getByText('device log')).toBeInTheDocument();
  expect(screen.queryByText('unrelated log')).not.toBeInTheDocument();
  view.unmount();
  expect(off).toHaveBeenCalled();
  expect(stop).toHaveBeenCalledWith('test-session');
});

it('stops a pending start that resolves after unmount', async () => {
  const bridge = getBridge();
  let resolve!: (id: string) => void;
  vi.spyOn(bridge, 'logcatStart').mockReturnValue(new Promise((r) => { resolve = r; }));
  const stop = vi.spyOn(bridge, 'logcatStop').mockResolvedValue();
  vi.spyOn(bridge, 'on').mockReturnValue(() => {});
  const view = render(<LogsView serial="device" />);
  fireEvent.click(screen.getByRole('button', { name: useApp.getState().t('logs.start') }));
  view.unmount();
  await act(async () => { resolve('late-session'); });
  expect(stop).toHaveBeenCalledWith('late-session');
});
