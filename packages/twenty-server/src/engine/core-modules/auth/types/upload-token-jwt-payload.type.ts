import { type CommonPropertiesJwtPayload } from 'src/engine/core-modules/auth/types/common-properties-jwt-payload.type';
import { JwtTokenTypeEnum } from 'src/engine/core-modules/auth/types/jwt-token-type.enum';

// Short-lived, upload-only token minted for the QR-to-mobile task upload flow.
// It grants exactly one capability: attaching files to `targetTaskId` in
// `workspaceId` until it expires. `workspaceId` (as `sub`) also lets
// JwtWrapperService resolve the verification key automatically.
export type UploadTokenJwtPayload = CommonPropertiesJwtPayload & {
  type: JwtTokenTypeEnum.UPLOAD;
  workspaceId: string;
  targetTaskId: string;
  workspaceMemberId: string | null;
  targetOpportunityId?: string | null;
};
