import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { LogsView } from '../src/features/logs/LogsView';
import { MockBridge } from '../src/services/mock';
import { setBridge } from '../src/services/bridge';

describe('LogsView', () => {
  it('renders initial state with Start button', () => {
    const bridge = new MockBridge();
    setBridge(bridge);
    render(<LogsView serial="23021RAA2Y" />);

    expect(screen.getByRole('button', { name: /iniciar|start/i })).toBeInTheDocument();
  });

  it('starts streaming logs on start button click and stops', async () => {
    const bridge = new MockBridge();
    setBridge(bridge);
    render(<LogsView serial="23021RAA2Y" />);

    const startBtn = screen.getByRole('button', { name: /iniciar|start/i });
    fireEvent.click(startBtn);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /parar|stop/i })).toBeInTheDocument();
    });

    // Wait for mock bridge to emit lines
    await waitFor(
      () => {
        expect(document.querySelectorAll('.log-line').length).toBeGreaterThan(0);
      },
      { timeout: 3000 },
    );

    const stopBtn = screen.getByRole('button', { name: /parar|stop/i });
    fireEvent.click(stopBtn);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /iniciar|start/i })).toBeInTheDocument();
    });
  });

  it('clears log lines when clear is clicked', async () => {
    const bridge = new MockBridge();
    setBridge(bridge);
    render(<LogsView serial="23021RAA2Y" />);

    const startBtn = screen.getByRole('button', { name: /iniciar|start/i });
    fireEvent.click(startBtn);

    await waitFor(
      () => {
        expect(document.querySelectorAll('.log-line').length).toBeGreaterThan(0);
      },
      { timeout: 3000 },
    );

    const clearBtn = screen.getByRole('button', { name: /limpar|clear/i });
    fireEvent.click(clearBtn);

    expect(document.querySelectorAll('.log-line').length).toBe(0);
  });

  it('pauses and resumes log streaming', async () => {
    const bridge = new MockBridge();
    setBridge(bridge);
    render(<LogsView serial="23021RAA2Y" />);

    fireEvent.click(screen.getByRole('button', { name: /iniciar|start/i }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /pausar|pause/i })).toBeInTheDocument();
    });

    const pauseBtn = screen.getByRole('button', { name: /pausar|pause/i });
    fireEvent.click(pauseBtn);

    expect(screen.getByRole('button', { name: /retomar|resume/i })).toBeInTheDocument();

    const resumeBtn = screen.getByRole('button', { name: /retomar|resume/i });
    fireEvent.click(resumeBtn);

    expect(screen.getByRole('button', { name: /pausar|pause/i })).toBeInTheDocument();
  });

  it('opens and closes save modal', async () => {
    const bridge = new MockBridge();
    setBridge(bridge);
    render(<LogsView serial="23021RAA2Y" />);

    fireEvent.click(screen.getByRole('button', { name: /iniciar|start/i }));

    await waitFor(
      () => {
        expect(document.querySelectorAll('.log-line').length).toBeGreaterThan(0);
      },
      { timeout: 3000 },
    );

    const saveBtn = screen.getByRole('button', { name: /salvar|save/i });
    fireEvent.click(saveBtn);

    expect(screen.getByRole('dialog')).toBeInTheDocument();

    const cancelBtn = screen.getByRole('button', { name: /cancelar|cancel/i });
    fireEvent.click(cancelBtn);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
