// Destructive confirmation: the exact word must be typed (spec §22, §53).

import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { DestructiveConfirmDialog } from '../src/components/ConfirmDialog';
import ptBR from '../src/i18n/pt-BR';
import { useApp } from '../src/stores/app';

function renderDialog() {
  const onSpy = vi.fn();
  render(
    <DestructiveConfirmDialog
      cfg={{
        title: 'Teste',
        body: 'Corpo de aviso',
        word: 'APAGAR',
        onConfirm: onSpy,
        onCancel: () => {},
      }}
    />,
  );
  return onSpy;
}

function typeExact(input: HTMLInputElement, value: string) {
  fireEvent.change(input, { target: { value } });
}

describe('DestructiveConfirmDialog', () => {
  it('is blocked until the exact word is typed', async () => {
    const onConfirm = renderDialog();
    const input = screen.getByPlaceholderText(/APAGAR/i) as HTMLInputElement;
    const confirm = screen.getByRole('button', { name: /confirmar|confirm/i });
    expect(confirm).toBeDisabled();

    typeExact(input, 'apagar'); // lowercase → still blocked
    expect(confirm).toBeDisabled();

    typeExact(input, 'APAGA'); // missing letter → blocked
    expect(confirm).toBeDisabled();

    typeExact(input, 'APAGAR'); // exact → enabled
    expect(confirm).toBeEnabled();

    fireEvent.click(confirm);
    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
  });

  it('renders the translated instruction with the word substituted', () => {
    useApp.getState().applySettings({
      ...useApp.getState().settings,
      language: 'pt-BR',
      theme: 'dark',
      performanceMode: 'normal',
    });
    render(
      <DestructiveConfirmDialog
        cfg={{
          body: 'x',
          word: 'REMOVER',
          onConfirm: () => {},
          onCancel: () => {},
        }}
      />,
    );
    expect(
      screen.getByText(ptBR['common.confirmDestructive.body'].replace('{word}', 'REMOVER')),
    ).toBeInTheDocument();
  });
});
