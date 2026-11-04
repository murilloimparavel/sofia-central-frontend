import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@evoapi/design-system';
import { useLanguage } from '@/hooks/useLanguage';
import PipelineClassificationEditor from './PipelineClassificationEditor';

export default function PipelineClassificationModal({ pipelineId, open, onOpenChange }: {
  pipelineId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useLanguage('pipelines');
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>{t('classification.title')}</DialogTitle>
        <DialogDescription>{t('classification.description')}</DialogDescription>
      </DialogHeader>
      {open && <PipelineClassificationEditor key={pipelineId} pipelineId={pipelineId} />}
    </DialogContent>
  </Dialog>;
}
