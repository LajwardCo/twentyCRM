import { type CrmRecordAnswer, type FileAnswer, type Question } from '@shared/surveys';

import { type CrmRecordKind } from '../../../api/surveyCrm';
import { uploadSurveyFile } from '../../../api/surveyAttachments';
import { uploadRef } from '../../../lib/forms/collect/fileRefs';
import { CrmRecordPicker } from '../CrmRecordPicker';
import { type RendererServices } from '../inputs/inputTypes';

const KIND_BY_TYPE: Partial<Record<Question['type'], CrmRecordKind>> = {
  crm_company: 'company',
  crm_contact: 'person',
  crm_lead: 'opportunity',
};

const asRecord = (value: unknown): CrmRecordAnswer | null =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as CrmRecordAnswer).recordId === 'string'
    ? (value as CrmRecordAnswer)
    : null;

// Renderer hooks for staff screens: CRM pickers and uploads that are stored
// now and attached to the response once it is saved (see fileRefs.ts).
// Contacts and leads are narrowed to the business the collection is about.
export const staffRendererServices = (companyId: string | null): RendererServices => ({
  uploadFile: async (_question: Question, file: File): Promise<FileAnswer> => {
    const { fileId } = await uploadSurveyFile(file);

    return { ref: uploadRef(fileId), name: file.name, mimeType: file.type, sizeBytes: file.size };
  },
  renderCrmPicker: (question, value, onChange) => {
    const kind = KIND_BY_TYPE[question.type];

    if (kind === undefined) return null;

    return (
      <CrmRecordPicker
        kind={kind}
        value={asRecord(value)}
        companyId={kind === 'company' ? null : companyId}
        inputId={`sv-q-${question.id}`}
        onChange={(next) => onChange(next ?? undefined)}
      />
    );
  },
});
