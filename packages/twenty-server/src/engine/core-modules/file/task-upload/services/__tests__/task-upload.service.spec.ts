import { JwtTokenTypeEnum } from 'src/engine/core-modules/auth/types/jwt-token-type.enum';
import { TASK_UPLOAD_MAX_FILE_SIZE_BYTES } from 'src/engine/core-modules/file/task-upload/constants/task-upload.constants';
import { TaskUploadException } from 'src/engine/core-modules/file/task-upload/task-upload.exception';
import { TaskUploadService } from 'src/engine/core-modules/file/task-upload/services/task-upload.service';

// Minimal typed mocks — we only exercise the security-critical branches
// (token-type check, file validation) plus a happy path, all without a DB.
const buildService = (overrides: {
  verifyJwtToken?: jest.Mock;
  uploadFile?: jest.Mock;
  createRecord?: jest.Mock;
  taskFindOne?: jest.Mock;
  fieldFindOne?: jest.Mock;
  objectFindOne?: jest.Mock;
}) => {
  const jwtWrapperService = {
    verifyJwtToken:
      overrides.verifyJwtToken ??
      jest.fn().mockResolvedValue({
        type: JwtTokenTypeEnum.UPLOAD,
        workspaceId: 'ws-1',
        targetTaskId: 'task-1',
        workspaceMemberId: 'member-1',
      }),
    signAsyncOrThrow: jest.fn(),
    decode: jest.fn(),
  };
  const twentyConfigService = { get: jest.fn().mockReturnValue('20m') };
  const filesFieldService = {
    uploadFile:
      overrides.uploadFile ?? jest.fn().mockResolvedValue({ id: 'file-1' }),
  };
  const createRecordService = {
    execute:
      overrides.createRecord ?? jest.fn().mockResolvedValue({ success: true }),
  };
  const taskRepository = {
    findOne:
      overrides.taskFindOne ??
      jest.fn().mockResolvedValue({ id: 'task-1', title: 'Demo' }),
  };
  const globalWorkspaceOrmManager = {
    // run the callback immediately, handing it the mocked task repository
    executeInWorkspaceContext: jest.fn((fn: () => unknown) => fn()),
    getRepository: jest.fn().mockResolvedValue(taskRepository),
  };
  const throttlerService = {
    tokenBucketThrottleOrThrow: jest.fn().mockResolvedValue(1),
  };
  const fieldMetadataRepository = {
    findOne:
      overrides.fieldFindOne ?? jest.fn().mockResolvedValue({ id: 'fm-file' }),
  };
  const objectMetadataRepository = {
    findOne:
      overrides.objectFindOne ??
      jest.fn().mockResolvedValue({ id: 'om-attachment' }),
  };

  const service = new TaskUploadService(
    jwtWrapperService as never,
    twentyConfigService as never,
    filesFieldService as never,
    createRecordService as never,
    globalWorkspaceOrmManager as never,
    throttlerService as never,
    fieldMetadataRepository as never,
    objectMetadataRepository as never,
  );

  return { service, createRecordService, filesFieldService };
};

const okFile = {
  buffer: Buffer.from('hello'),
  filename: 'photo.jpg',
  mimetype: 'image/jpeg',
};

describe('TaskUploadService.handlePublicUpload', () => {
  it('rejects a non-UPLOAD token type (token confusion)', async () => {
    const { service } = buildService({
      verifyJwtToken: jest.fn().mockResolvedValue({
        type: JwtTokenTypeEnum.ACCESS,
        workspaceId: 'ws-1',
        targetTaskId: 'task-1',
      }),
    });

    await expect(
      service.handlePublicUpload({ token: 't', ...okFile }),
    ).rejects.toMatchObject({
      constructor: TaskUploadException,
      code: 'INVALID_TOKEN',
    });
  });

  it('rejects an invalid/expired token (verify throws)', async () => {
    const { service } = buildService({
      verifyJwtToken: jest.fn().mockRejectedValue(new Error('jwt expired')),
    });

    await expect(
      service.handlePublicUpload({ token: 't', ...okFile }),
    ).rejects.toMatchObject({ code: 'INVALID_TOKEN' });
  });

  it('rejects a disallowed MIME type', async () => {
    const { service } = buildService({});

    await expect(
      service.handlePublicUpload({
        token: 't',
        buffer: Buffer.from('MZ'),
        filename: 'evil.exe',
        mimetype: 'application/x-msdownload',
      }),
    ).rejects.toMatchObject({ code: 'UNSUPPORTED_FILE_TYPE' });
  });

  it('rejects a file over the size ceiling', async () => {
    const { service } = buildService({});

    await expect(
      service.handlePublicUpload({
        token: 't',
        buffer: Buffer.alloc(TASK_UPLOAD_MAX_FILE_SIZE_BYTES + 1),
        filename: 'big.pdf',
        mimetype: 'application/pdf',
      }),
    ).rejects.toMatchObject({ code: 'FILE_TOO_LARGE' });
  });

  it('rejects an empty file', async () => {
    const { service } = buildService({});

    await expect(
      service.handlePublicUpload({
        token: 't',
        buffer: Buffer.alloc(0),
        filename: 'empty.pdf',
        mimetype: 'application/pdf',
      }),
    ).rejects.toMatchObject({ code: 'INVALID_FILE' });
  });

  it('uploads and creates a task-scoped attachment on the happy path', async () => {
    const { service, createRecordService, filesFieldService } = buildService(
      {},
    );

    const result = await service.handlePublicUpload({ token: 't', ...okFile });

    expect(result).toEqual({ taskLabel: 'Demo' });
    expect(filesFieldService.uploadFile).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'ws-1',
        fieldMetadataId: 'fm-file',
        filename: 'photo.jpg',
      }),
    );
    expect(createRecordService.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        objectName: 'attachment',
        objectRecord: expect.objectContaining({
          targetTaskId: 'task-1',
          file: [{ fileId: 'file-1', label: 'photo.jpg', extension: 'jpg' }],
        }),
      }),
    );
  });

  it('surfaces a failure when attachment creation fails', async () => {
    const { service } = buildService({
      createRecord: jest.fn().mockResolvedValue({
        success: false,
        error: 'boom',
      }),
    });

    await expect(
      service.handlePublicUpload({ token: 't', ...okFile }),
    ).rejects.toMatchObject({ code: 'ATTACHMENT_CREATION_FAILED' });
  });
});
