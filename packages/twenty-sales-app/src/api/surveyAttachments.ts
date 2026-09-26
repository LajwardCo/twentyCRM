import { withFileType } from '../lib/attachmentSchema';
import { getAttachmentMetadata } from './attachments';
import { coreQuery, loadTokens } from './client';

// Files on survey responses: staff uploads for file questions, and scans or
// photos of paper sheets. Same two-step flow as task attachments
// (uploadFilesFieldFile → createAttachment), targeting the response.

export type SurveyAttachment = {
  id: string;
  name: string | null;
  createdAt: string;
};

// Stores the bytes and returns the file id. The file is not visible anywhere
// until an attachment record points at it.
export const uploadSurveyFile = async (file: File): Promise<{ fileId: string }> => {
  const { fileFieldId } = await getAttachmentMetadata();
  const form = new FormData();

  form.append(
    'operations',
    JSON.stringify({
      query: `mutation UploadSurveyFile($file: Upload!, $fieldMetadataId: String!) {
        uploadFilesFieldFile(file: $file, fieldMetadataId: $fieldMetadataId) { id }
      }`,
      variables: { file: null, fieldMetadataId: fileFieldId },
    }),
  );
  form.append('map', JSON.stringify({ '0': ['variables.file'] }));
  form.append('0', file, file.name);

  // File upload resolvers are mounted on /metadata.
  const response = await fetch('/metadata', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${loadTokens()?.accessToken ?? ''}`,
      'apollo-require-preflight': 'true',
    },
    body: form,
  });
  const json = (await response.json().catch(() => ({}))) as {
    data?: { uploadFilesFieldFile: { id: string } };
    errors?: { message: string }[];
  };

  if (json.errors?.length) throw new Error(json.errors[0].message);
  if (!json.data) throw new Error('آپلود ناموفق بود');

  return { fileId: json.data.uploadFilesFieldFile.id };
};

export const attachFileToResponse = async (input: {
  fileId: string;
  name: string;
  responseId: string;
  fileType?: string | null;
}): Promise<{ id: string }> => {
  const schema = await getAttachmentMetadata();
  const data = await coreQuery<{ createAttachment: { id: string } }>(
    `mutation AttachSurveyFile($data: AttachmentCreateInput!) {
      createAttachment(data: $data) { id }
    }`,
    {
      data: withFileType(
        {
          name: input.name,
          file: [{ fileId: input.fileId, label: input.name }],
          targetSurveyResponseId: input.responseId,
        },
        schema,
        input.fileType,
      ),
    },
  );

  return data.createAttachment;
};

export const uploadResponseAttachment = async (input: {
  file: File;
  responseId: string;
  fileType?: string | null;
}): Promise<SurveyAttachment> => {
  const { fileId } = await uploadSurveyFile(input.file);
  const { id } = await attachFileToResponse({
    fileId,
    name: input.file.name,
    responseId: input.responseId,
    fileType: input.fileType,
  });

  return { id, name: input.file.name, createdAt: new Date().toISOString() };
};

export const listResponseAttachments = async (
  responseId: string,
): Promise<SurveyAttachment[]> => {
  const data = await coreQuery<{
    attachments: { edges: { node: SurveyAttachment }[] };
  }>(
    `query SurveyResponseAttachments($responseId: UUID!) {
      attachments(filter: { targetSurveyResponseId: { eq: $responseId } }, first: 100, orderBy: [{ createdAt: AscNullsLast }]) {
        edges { node { id name createdAt } }
      }
    }`,
    { responseId },
  );

  return data.attachments.edges.map((edge) => edge.node);
};
