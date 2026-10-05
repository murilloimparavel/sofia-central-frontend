export const MAX_ATTACHMENT_SIZE_MB = 90;
export const MAX_TOTAL_ATTACHMENT_SIZE_BYTES = MAX_ATTACHMENT_SIZE_MB * 1024 * 1024;

type SizedFile = Pick<File, 'size'>;

export const isAttachmentBatchWithinLimit = (
  existingFiles: readonly SizedFile[],
  incomingFiles: readonly SizedFile[],
): boolean =>
  [...existingFiles, ...incomingFiles].reduce((total, file) => total + file.size, 0) <=
  MAX_TOTAL_ATTACHMENT_SIZE_BYTES;
