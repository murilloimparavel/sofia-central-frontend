import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import ComposerFilePickers from './ComposerFilePickers';

const fileUploadRender = vi.fn();
vi.mock('./FileUpload', () => ({
  default: ({
    inputId,
    onFilesSelected,
    disabled,
  }: {
    inputId: string;
    onFilesSelected: (files: File[]) => void;
    disabled: boolean;
  }) => {
    fileUploadRender(inputId);
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={() => onFilesSelected([new File(['data'], 'image.png', { type: 'image/png' })])}
      >
        {inputId}
      </button>
    );
  },
}));

describe('ComposerFilePickers', () => {
  it('routes files by picker and skips unchanged editor renders', () => {
    fileUploadRender.mockClear();
    const onFilesSelected = vi.fn();
    const { rerender } = render(
      <ComposerFilePickers disabled={false} onFilesSelected={onFilesSelected} />,
    );
    expect(fileUploadRender).toHaveBeenCalledTimes(3);

    rerender(<ComposerFilePickers disabled={false} onFilesSelected={onFilesSelected} />);
    expect(fileUploadRender).toHaveBeenCalledTimes(3);

    fireEvent.click(screen.getByRole('button', { name: 'composer-file-input-all' }));
    fireEvent.click(screen.getByRole('button', { name: 'composer-file-input-document' }));
    fireEvent.click(screen.getByRole('button', { name: 'composer-file-input-media' }));

    expect(onFilesSelected.mock.calls.map(call => call[1])).toEqual([true, true, false]);
  });
});
