import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./client', () => ({
  coreQuery: vi.fn(),
  metadataQuery: vi.fn(),
  loadTokens: vi.fn(() => null),
}));

import { coreQuery, metadataQuery } from './client';

// The attachment metadata probe is cached per module instance, so each test
// loads a fresh copy of the API to start from an unprobed state.
const loadApi = () => import('./files');

const mockedCoreQuery = vi.mocked(coreQuery);
const mockedMetadataQuery = vi.mocked(metadataQuery);

const metadataWith = (fieldNames: string[]) => ({
  objects: {
    edges: [
      {
        node: {
          nameSingular: 'attachment',
          fields: {
            edges: fieldNames.map((name) => ({ node: { id: `id-${name}`, name } })),
          },
        },
      },
    ],
  },
});

const emptyPage = {
  attachments: { edges: [], pageInfo: { hasNextPage: false, endCursor: null } },
};

describe('files API', () => {
  beforeEach(() => {
    vi.resetModules();
    mockedCoreQuery.mockReset();
    mockedMetadataQuery.mockReset();
  });

  it('pages newest-first through the cursor and reports whether more exist', async () => {
    mockedMetadataQuery.mockResolvedValue(metadataWith(['file', 'fileType']));
    mockedCoreQuery.mockResolvedValue({
      attachments: {
        edges: [{ node: { id: 'a' } }],
        pageInfo: { hasNextPage: true, endCursor: 'cur-1' },
      },
    });

    const { fetchFilesPage } = await loadApi();
    const page = await fetchFilesPage({ after: 'cur-0' });

    expect(page.items.map((row) => row.id)).toEqual(['a']);
    expect(page.hasMore).toBe(true);
    expect(page.endCursor).toBe('cur-1');
    const [query, variables] = mockedCoreQuery.mock.calls[0];
    expect(query).toContain('createdAt: DescNullsLast');
    expect(query).toContain('fileType');
    expect(query).toContain('targetTask { id title }');
    expect(variables).toMatchObject({ after: 'cur-0', first: 50 });
  });

  it('omits fileType everywhere when the workspace has not been provisioned', async () => {
    mockedMetadataQuery.mockResolvedValue(metadataWith(['file']));
    mockedCoreQuery.mockResolvedValue(emptyPage);

    const { fetchFilesPage, updateFile } = await loadApi();
    await fetchFilesPage({});
    expect(mockedCoreQuery.mock.calls[0][0]).not.toContain('fileType');

    mockedCoreQuery.mockResolvedValue({ updateAttachment: { id: 'a' } });
    await updateFile('a', { name: 'renamed', fileType: 'PHOTO' });
    expect(mockedCoreQuery.mock.calls[1][1]).toEqual({
      id: 'a',
      data: { name: 'renamed' },
    });
  });

  it('soft-deletes through deleteAttachment, never destroy', async () => {
    mockedMetadataQuery.mockResolvedValue(metadataWith(['file']));
    mockedCoreQuery.mockResolvedValue({ deleteAttachment: { id: 'a' } });

    const { deleteFile } = await loadApi();
    await deleteFile('a');

    const [query, variables] = mockedCoreQuery.mock.calls[0];
    expect(query).toContain('deleteAttachment');
    expect(query).not.toContain('destroy');
    expect(variables).toEqual({ id: 'a' });
  });
});
