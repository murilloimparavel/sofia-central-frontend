import React, { useCallback } from 'react';

import FileUpload from './FileUpload';
import { MAX_ATTACHMENT_SIZE_MB } from './uploadLimits';

interface ComposerFilePickersProps {
  disabled: boolean;
  onFilesSelected: (files: File[], asDocument?: boolean) => void;
}

// Keep the three hidden pickers and their document-level drop listeners out of
// the editor's keystroke render path. Only the "all" picker owns global drops.
const ComposerFilePickers: React.FC<ComposerFilePickersProps> = ({
  disabled,
  onFilesSelected,
}) => {
  const handleAllFilesSelected = useCallback(
    (files: File[]) => {
      const documents = files.every(file =>
        /\.(pdf|docx?|xlsx?|pptx?|txt|csv|rtf)$/i.test(file.name) ||
        file.type.startsWith('image/') || file.type.startsWith('video/') ||
        file.type.startsWith('text/') || file.type === 'application/pdf' ||
        file.type.includes('officedocument') || file.type.includes('msword') ||
        file.type.includes('ms-excel') || file.type.includes('ms-powerpoint'),
      );
      onFilesSelected(files, documents);
    },
    [onFilesSelected],
  );
  const handleDocumentsSelected = useCallback(
    (files: File[]) => onFilesSelected(files, true),
    [onFilesSelected],
  );
  const handleMediaSelected = useCallback(
    (files: File[]) => onFilesSelected(files, false),
    [onFilesSelected],
  );

  return (
    <>
      <FileUpload
        inputId="composer-file-input-all"
        onFilesSelected={handleAllFilesSelected}
        maxFileSize={MAX_ATTACHMENT_SIZE_MB}
        multiple={true}
        category="all"
        disabled={disabled}
      >
        <></>
      </FileUpload>
      <FileUpload
        inputId="composer-file-input-document"
        onFilesSelected={handleDocumentsSelected}
        maxFileSize={MAX_ATTACHMENT_SIZE_MB}
        multiple={true}
        category="document"
        enableGlobalDropZone={false}
        disabled={disabled}
      >
        <></>
      </FileUpload>
      <FileUpload
        inputId="composer-file-input-media"
        onFilesSelected={handleMediaSelected}
        maxFileSize={MAX_ATTACHMENT_SIZE_MB}
        multiple={true}
        category="media"
        enableGlobalDropZone={false}
        disabled={disabled}
      >
        <></>
      </FileUpload>
    </>
  );
};

export default React.memo(ComposerFilePickers);
