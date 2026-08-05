import { coreQuery, loadTokens, metadataQuery } from './client';

// Upload flow: uploadFilesFieldFile (multipart, needs the FieldMetadata id of
// attachment.file) -> createAttachment record linked to the task/lead.

export type TaskAttachment = {
  id: string;
  name: string | null;
  createdAt: string;
  file: { fileId: string; label: string; extension: string | null }[] | null;
};

let attachmentFileFieldId: string | null = null;

const getAttachmentFileFieldId = async (): Promise<string> => {
  if (attachmentFileFieldId) return attachmentFileFieldId;
  const data = await metadataQuery<{
    objects: {
      edges: {
        node: {
          nameSingular: string;
          fields: { edges: { node: { id: string; name: string } }[] };
        };
      }[];
    };
  }>(
    `query AttachmentFileField {
      objects(paging: { first: 500 }) {
        edges {
          node {
            nameSingular
            fields(paging: { first: 200 }) { edges { node { id name } } }
          }
        }
      }
    }`,
  );
  const attachment = data.objects.edges
    .map((e) => e.node)
    .find((n) => n.nameSingular === 'attachment');
  const fileField = attachment?.fields.edges.find((e) => e.node.name === 'file');
  if (!fileField) throw new Error('attachment.file field not found');
  attachmentFileFieldId = fileField.node.id;
  return attachmentFileFieldId;
};

// graphql-multipart-request-spec upload
const uploadFile = async (
  file: File,
): Promise<{ id: string; url: string }> => {
  const fieldMetadataId = await getAttachmentFileFieldId();
  const tokens = loadTokens();

  const form = new FormData();
  form.append(
    'operations',
    JSON.stringify({
      query: `mutation UploadFilesFieldFile($file: Upload!, $fieldMetadataId: String!) {
        uploadFilesFieldFile(file: $file, fieldMetadataId: $fieldMetadataId) {
          id
          url
        }
      }`,
      variables: { file: null, fieldMetadataId },
    }),
  );
  form.append('map', JSON.stringify({ '0': ['variables.file'] }));
  form.append('0', file, file.name);

  // core-modules resolvers (incl. file upload) are mounted on /metadata
  const response = await fetch('/metadata', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${tokens?.accessToken ?? ''}`,
      'apollo-require-preflight': 'true',
    },
    body: form,
  });

  const json = (await response.json()) as {
    data?: { uploadFilesFieldFile: { id: string; url: string } };
    errors?: { message: string }[];
  };
  if (json.errors?.length) throw new Error(json.errors[0].message);
  if (!json.data) throw new Error('آپلود ناموفق بود');
  return json.data.uploadFilesFieldFile;
};

export const uploadTaskAttachment = async (input: {
  file: File;
  taskId: string;
  opportunityId?: string | null;
}): Promise<void> => {
  const uploaded = await uploadFile(input.file);
  await coreQuery(
    `mutation CreateAttachment($data: AttachmentCreateInput!) {
      createAttachment(data: $data) { id }
    }`,
    {
      data: {
        name: input.file.name,
        file: [{ fileId: uploaded.id, label: input.file.name }],
        targetTaskId: input.taskId,
        ...(input.opportunityId
          ? { targetOpportunityId: input.opportunityId }
          : {}),
      },
    },
  );
};

export type TaskUploadToken = {
  token: string;
  expiresAt: string;
  taskLabel: string;
};

// Mints a short-lived, upload-only token scoped to this one task (server-signed
// JWT, ~20 min). Authenticated — the seller must be logged in to generate it.
// The token can then be embedded in a QR code for the field/mobile upload page.
export const generateTaskUploadToken = async (
  taskId: string,
): Promise<TaskUploadToken> => {
  const data = await metadataQuery<{
    generateTaskUploadToken: TaskUploadToken;
  }>(
    `mutation GenerateTaskUploadToken($taskId: String!) {
      generateTaskUploadToken(taskId: $taskId) {
        token
        expiresAt
        taskLabel
      }
    }`,
    { taskId },
  );
  return data.generateTaskUploadToken;
};

// Uploads a single file from the PUBLIC (unauthenticated) mobile page using the
// upload token instead of a session. No Authorization header — the token in the
// multipart body is the only credential, and it can only attach to one task for
// the ~20-minute window.
export const uploadViaPublicToken = async (
  file: File,
  token: string,
): Promise<{ taskLabel: string; attachmentId: string }> => {
  const form = new FormData();
  form.append('token', token);
  form.append('file', file, file.name);

  const response = await fetch('/public/task-upload', {
    method: 'POST',
    body: form,
  });

  let json: {
    ok?: boolean;
    taskLabel?: string;
    attachmentId?: string;
    message?: string;
  } = {};
  try {
    json = (await response.json()) as typeof json;
  } catch {
    // non-JSON response falls through to the generic error below
  }
  if (!response.ok || json.ok === false) {
    throw new Error(json.message ?? 'آپلود ناموفق بود');
  }
  return {
    taskLabel: json.taskLabel ?? '',
    attachmentId: json.attachmentId ?? '',
  };
};

// Takes back a file the same public page just uploaded (a blurry photo, a
// wrong document). The server only honours this for attachments created by
// this very token, so it can never remove files that were already on the task.
export const removeViaPublicToken = async (
  attachmentId: string,
  token: string,
): Promise<void> => {
  const response = await fetch('/public/task-upload/remove', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, attachmentId }),
  });

  let json: { ok?: boolean; message?: string } = {};
  try {
    json = (await response.json()) as typeof json;
  } catch {
    // fall through to the generic error
  }
  if (!response.ok || json.ok === false) {
    throw new Error(json.message ?? 'حذف فایل ناموفق بود');
  }
};

export const fetchTaskAttachments = async (
  taskId: string,
): Promise<TaskAttachment[]> => {
  const data = await coreQuery<{
    attachments: { edges: { node: TaskAttachment }[] };
  }>(
    `query TaskAttachments($taskId: UUID) {
      attachments(filter: { targetTaskId: { eq: $taskId } }, first: 30) {
        edges {
          node {
            id
            name
            createdAt
            file { fileId label extension }
          }
        }
      }
    }`,
    { taskId },
  );
  return data.attachments.edges.map((e) => e.node);
};
