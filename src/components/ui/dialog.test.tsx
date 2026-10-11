// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Dialog } from './dialog';
import { ConfirmDialog } from './confirm-dialog';

afterEach(cleanup);

// Dialog autofocuses on a zero-delay timer.
const settle = () => act(() => new Promise((r) => setTimeout(r, 10)));

describe('Dialog', () => {
  it('mounts on <body>, so a blurred or transformed ancestor can’t trap it', () => {
    render(
      <div data-testid="toolbar" style={{ backdropFilter: 'blur(8px)', transform: 'translateX(0)' }}>
        <Dialog open onClose={() => {}} labelledBy="t">
          <h2 id="t">Resend the sign email?</h2>
        </Dialog>
      </div>,
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog.parentElement).toBe(document.body);
    expect(screen.getByTestId('toolbar').contains(dialog)).toBe(false);
  });

  it('still bubbles React events to the component that rendered it', async () => {
    const onKeyDown = vi.fn();
    const user = userEvent.setup();
    render(
      <div onKeyDown={onKeyDown}>
        <Dialog open onClose={() => {}}>
          <input aria-label="field" />
        </Dialog>
      </div>,
    );
    await user.type(screen.getByLabelText('field'), 'a');
    expect(onKeyDown).toHaveBeenCalled();
  });
});

describe('ConfirmDialog', () => {
  function setup(description?: React.ReactNode, tone: 'danger' | 'default' = 'danger') {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      <ConfirmDialog
        open
        title="Cancel the care plan?"
        confirmLabel="Yes, cancel it"
        tone={tone}
        description={description}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );
    return { onConfirm, onCancel };
  }

  it('a destructive dialog starts on Cancel, and Enter there cancels', async () => {
    const user = userEvent.setup();
    const { onConfirm, onCancel } = setup();
    await settle();
    expect(document.activeElement?.textContent).toBe('Cancel');
    await user.keyboard('{Enter}');
    expect(onCancel).toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('a non-destructive dialog starts on Confirm', async () => {
    setup(undefined, 'default');
    await settle();
    expect(document.activeElement?.textContent).toBe('Yes, cancel it');
  });

  it('Enter confirms from a text field, not from a checkbox', async () => {
    const user = userEvent.setup();
    const { onConfirm } = setup(
      <>
        <input type="text" aria-label="Reason" />
        <input type="checkbox" aria-label="Agree" />
      </>,
    );
    await settle();
    expect(document.activeElement).toBe(screen.getByLabelText('Reason'));
    screen.getByLabelText('Agree').focus();
    await user.keyboard('{Enter}');
    expect(onConfirm).not.toHaveBeenCalled();
    screen.getByLabelText('Reason').focus();
    await user.keyboard('done{Enter}');
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});
