import {
  attachmentSelection,
  withFileType,
} from '../lib/attachmentSchema';
import { getAttachmentMetadata, type TaskAttachment } from './attachments';
import { coreQuery } from './client';

// The Files manager: every attachment in the workspace, not just one task's.

export type FileRecord = TaskAttachment & {
  createdBy: { name: string | null } | null;
  targetTask: { id: string; title: string | null } | null;
  targetOpportunity: { id: string; name: string | null } | null;
};

export type FilesPage = {
  items: FileRecord[];
  hasMore: boolean;
  endCursor: string | null;
};

const PAGE_SIZE = 50;

const recordSelection = (selection: string): string => `${selection}
            createdBy { name }
            targetTask { id title }
            targetOpportunity { id name }`;

// Cursor-paged: `first:` is not clamped by the server, so one oversized page
// would silently truncate instead of erroring.
export const fetchFilesPage = async (input: {
  filter?: Record<string, unknown>;
  after?: string | null;
}): Promise<FilesPage> => {
  const schema = await getAttachmentMetadata();
  const data = await coreQuery<{
    attachments: {
      edges: { node: FileRecord }[];
      pageInfo: { hasNextPage: boolean; endCursor: string | null };
    };
  }>(
    `query FilesPage($filter: AttachmentFilterInput, $first: Int, $after: String) {
      attachments(
        filter: $filter
        first: $first
        after: $after
        orderBy: [{ createdAt: DescNullsLast }]
      ) {
        edges {
          node {
            ${recordSelection(attachmentSelection(schema))}
          }
        }
        pageInfo { hasNextPage endCursor }
      }
    }`,
    { filter: input.filter ?? null, first: PAGE_SIZE, after: input.after ?? null },
  );
  return {
    items: data.attachments.edges.map((edge) => edge.node),
    hasMore: data.attachments.pageInfo.hasNextPage,
    endCursor: data.attachments.pageInfo.endCursor,
  };
};

export const fetchFile = async (id: string): Promise<FileRecord | null> => {
  const schema = await getAttachmentMetadata();
  const data = await coreQuery<{ attachment: FileRecord | null }>(
    `query FileById($id: UUID!) {
      attachment(filter: { id: { eq: $id } }) {
        ${recordSelection(attachmentSelection(schema))}
      }
    }`,
    { id },
  );
  return data.attachment ?? null;
};

export const updateFile = async (
  id: string,
  changes: { name?: string; fileType?: string | null },
): Promise<void> => {
  const schema = await getAttachmentMetadata();
  const base: Record<string, unknown> = {};
  if (changes.name !== undefined) base.name = changes.name;
  await coreQuery(
    `mutation UpdateFile($id: UUID!, $data: AttachmentUpdateInput!) {
      updateAttachment(id: $id, data: $data) { id }
    }`,
    { id, data: withFileType(base, schema, changes.fileType) },
  );
};

// Soft delete only: the record and its file stay restorable from Twenty's
// own UI, and `destroy` is denied on prod anyway.
export const deleteFile = async (id: string): Promise<void> => {
  await coreQuery(
    `mutation DeleteFile($id: UUID!) {
      deleteAttachment(id: $id) { id }
    }`,
    { id },
  );
};
