import { randomUUID } from 'node:crypto';

import gql from 'graphql-tag';
import { default as request } from 'supertest';
import { createOneFieldMetadata } from 'test/integration/metadata/suites/field-metadata/utils/create-one-field-metadata.util';
import { deleteOneFieldMetadata } from 'test/integration/metadata/suites/field-metadata/utils/delete-one-field-metadata.util';
import { createOneObjectMetadata } from 'test/integration/metadata/suites/object-metadata/utils/create-one-object-metadata.util';
import { deleteOneObjectMetadata } from 'test/integration/metadata/suites/object-metadata/utils/delete-one-object-metadata.util';
import { updateOneObjectMetadata } from 'test/integration/metadata/suites/object-metadata/utils/update-one-object-metadata.util';
import { createOneOperationFactory } from 'test/integration/graphql/utils/create-one-operation-factory.util';
import { deleteOneOperationFactory } from 'test/integration/graphql/utils/delete-one-operation-factory.util';
import { findManyOperationFactory } from 'test/integration/graphql/utils/find-many-operation-factory.util';
import { makeGraphqlAPIRequest } from 'test/integration/graphql/utils/make-graphql-api-request.util';
import { updateWorkspaceMemberRole } from 'test/integration/graphql/utils/update-workspace-member-role.util';
import { makeMetadataAPIRequest } from 'test/integration/metadata/suites/utils/make-metadata-api-request.util';
import { FieldMetadataType } from 'twenty-shared/types';

import { WORKSPACE_MEMBER_DATA_SEED_IDS } from 'src/engine/workspace-manager/dev-seeder/data/constants/workspace-member-data-seeds.constant';

// Owner scoping THROUGH a partner record -- the case that lets a non-employee
// marketer keep seeing a lead after a seller takes ownership of it.
//
// The scoping rules for opportunity are owner OR marketerPartner OR referrer
// (see OWNER_SCOPED_OBJECTS). Only the first is a plain column; the other two
// resolve a partner row whose `member` points at the current workspace member.
// This suite exercises that subquery against a real database, because the parts
// that can be silently wrong -- schema qualification, the `_` custom-table
// prefix, soft-deleted partners still granting access -- only show up there.
//
//   A = Jony (owns the leads, acts as the seller)
//   B = Phil (the external marketer, owns nothing)
//
// Both hold the same owner-scoped role. The partner object and the
// opportunity.marketerPartner relation are created here because they are
// provisioned by script in real workspaces, not seeded.

const MEMBER_A_ID = WORKSPACE_MEMBER_DATA_SEED_IDS.JONY;
const MEMBER_B_ID = WORKSPACE_MEMBER_DATA_SEED_IDS.PHIL;

const OPPORTUNITY_GQL_FIELDS = `
  id
  name
  ownerId
`;

describe('ownerScopedRecordsViaPartner', () => {
  const client = request(`http://localhost:${APP_PORT}`);

  const requestAsB = (operation: { query: unknown; variables?: unknown }) =>
    makeGraphqlAPIRequest(operation as never, APPLE_PHIL_GUEST_ACCESS_TOKEN);

  let scopedRoleId: string;
  let originalMemberRoleId: string;
  let originalGuestRoleId: string;
  let opportunityObjectMetadataId: string;
  let partnerObjectMetadataId: string;
  let partnerMemberFieldId: string;
  let marketerPartnerFieldId: string;

  // Partner record standing for the external marketer B.
  let partnerId: string;

  const creditedOpportunityId = randomUUID();
  const uncreditedOpportunityId = randomUUID();
  const createdOpportunityIds = [creditedOpportunityId, uncreditedOpportunityId];

  const findObjectMetadataIdByName = async (
    nameSingular: string,
  ): Promise<string> => {
    const response = await makeMetadataAPIRequest({
      query: gql`
        query GetObjects {
          objects(paging: { first: 1000 }) {
            edges {
              node {
                id
                nameSingular
              }
            }
          }
        }
      `,
    });

    return response.body.data.objects.edges.find(
      (edge: { node: { nameSingular: string } }) =>
        edge.node.nameSingular === nameSingular,
    )?.node.id;
  };

  const createOpportunityAsAdmin = async (input: Record<string, unknown>) => {
    const operation = createOneOperationFactory({
      objectMetadataSingularName: 'opportunity',
      gqlFields: OPPORTUNITY_GQL_FIELDS,
      data: input,
    });

    const response = await makeGraphqlAPIRequest(operation);

    expect(response.body.errors).toBeUndefined();

    return response.body.data.createOpportunity;
  };

  const visibleOpportunityIdsAsB = async (): Promise<string[]> => {
    const operation = findManyOperationFactory({
      objectMetadataSingularName: 'opportunity',
      objectMetadataPluralName: 'opportunities',
      gqlFields: OPPORTUNITY_GQL_FIELDS,
      filter: { id: { in: createdOpportunityIds } },
    });

    const response = await requestAsB(operation);

    expect(response.body.errors).toBeUndefined();

    return (response.body.data?.opportunities?.edges ?? []).map(
      (edge: { node: { id: string } }) => edge.node.id,
    );
  };

  const setPartnerMemberAsAdmin = async (memberId: string | null) => {
    const operation = {
      query: gql`
        mutation UpdatePartner($id: UUID!, $data: PartnerUpdateInput!) {
          updatePartner(id: $id, data: $data) {
            id
          }
        }
      `,
      variables: { id: partnerId, data: { memberId } },
    };

    const response = await makeGraphqlAPIRequest(operation as never);

    expect(response.body.errors).toBeUndefined();
  };

  beforeAll(async () => {
    const rolesResponse = await makeMetadataAPIRequest({
      query: gql`
        query GetRoles {
          getRoles {
            id
            label
          }
        }
      `,
    });

    const roles = rolesResponse.body.data.getRoles;

    originalMemberRoleId = roles.find(
      (role: { label: string }) => role.label === 'Member',
    ).id;
    originalGuestRoleId = roles.find(
      (role: { label: string }) => role.label === 'Guest',
    ).id;

    // --- metadata: the partner object and the two relations -----------------
    const partnerObject = await createOneObjectMetadata({
      input: {
        labelSingular: 'Partner',
        labelPlural: 'Partners',
        nameSingular: 'partner',
        namePlural: 'partners',
        icon: 'IconUsersGroup',
      },
      gqlFields: 'id nameSingular',
    });

    partnerObjectMetadataId = partnerObject.data.createOneObject.id;

    opportunityObjectMetadataId =
      await findObjectMetadataIdByName('opportunity');

    const workspaceMemberObjectMetadataId =
      await findObjectMetadataIdByName('workspaceMember');

    const memberField = await createOneFieldMetadata({
      input: {
        objectMetadataId: partnerObjectMetadataId,
        name: 'member',
        label: 'Login Account',
        type: FieldMetadataType.RELATION,
        relationCreationPayload: {
          type: 'MANY_TO_ONE',
          targetObjectMetadataId: workspaceMemberObjectMetadataId,
          targetFieldLabel: 'Partner Profile',
          targetFieldIcon: 'IconUsersGroup',
        },
      },
      gqlFields: 'id name',
    });

    partnerMemberFieldId = memberField.data.createOneField.id;

    const marketerField = await createOneFieldMetadata({
      input: {
        objectMetadataId: opportunityObjectMetadataId,
        name: 'marketerPartner',
        label: 'Marketer',
        type: FieldMetadataType.RELATION,
        relationCreationPayload: {
          type: 'MANY_TO_ONE',
          targetObjectMetadataId: partnerObjectMetadataId,
          targetFieldLabel: 'Leads Brought',
          targetFieldIcon: 'IconTargetArrow',
        },
      },
      gqlFields: 'id name',
    });

    marketerPartnerFieldId = marketerField.data.createOneField.id;

    // --- role: owner-scoped, with opportunity + partner access --------------
    const createRoleResponse = await makeMetadataAPIRequest({
      query: gql`
        mutation CreateExternalRole {
          createOneRole(
            createRoleInput: {
              label: "External Marketer ${randomUUID()}"
              description: "Owner-scoped external marketer role"
              canUpdateAllSettings: false
              canReadAllObjectRecords: false
              canUpdateAllObjectRecords: false
              canSoftDeleteAllObjectRecords: false
              canDestroyAllObjectRecords: false
              canOnlyAccessOwnedRecords: true
            }
          ) {
            id
            canOnlyAccessOwnedRecords
          }
        }
      `,
    });

    expect(createRoleResponse.body.errors).toBeUndefined();

    scopedRoleId = createRoleResponse.body.data.createOneRole.id;

    const grantResponse = await makeMetadataAPIRequest({
      query: gql`
        mutation UpsertObjectPermissions(
          $roleId: UUID!
          $objectPermissions: [ObjectPermissionInput!]!
        ) {
          upsertObjectPermissions(
            upsertObjectPermissionsInput: {
              roleId: $roleId
              objectPermissions: $objectPermissions
            }
          ) {
            objectMetadataId
          }
        }
      `,
      variables: {
        roleId: scopedRoleId,
        objectPermissions: [
          {
            objectMetadataId: opportunityObjectMetadataId,
            canReadObjectRecords: true,
            canUpdateObjectRecords: true,
            canSoftDeleteObjectRecords: false,
            canDestroyObjectRecords: false,
          },
          {
            objectMetadataId: partnerObjectMetadataId,
            canReadObjectRecords: true,
            canUpdateObjectRecords: false,
            canSoftDeleteObjectRecords: false,
            canDestroyObjectRecords: false,
          },
        ],
      },
    });

    expect(grantResponse.body.errors).toBeUndefined();

    await updateWorkspaceMemberRole({
      client,
      roleId: scopedRoleId,
      workspaceMemberId: MEMBER_B_ID,
    });

    // --- data: one partner for B, two leads owned by A ----------------------
    const createPartnerOperation = createOneOperationFactory({
      objectMetadataSingularName: 'partner',
      gqlFields: 'id name memberId',
      data: { name: `Marketer ${randomUUID()}`, memberId: MEMBER_B_ID },
    });

    const partnerResponse = await makeGraphqlAPIRequest(createPartnerOperation);

    expect(partnerResponse.body.errors).toBeUndefined();

    partnerId = partnerResponse.body.data.createPartner.id;

    await createOpportunityAsAdmin({
      id: creditedOpportunityId,
      name: 'Lead brought by the marketer',
      ownerId: MEMBER_A_ID,
      marketerPartnerId: partnerId,
    });

    await createOpportunityAsAdmin({
      id: uncreditedOpportunityId,
      name: 'Lead the marketer has nothing to do with',
      ownerId: MEMBER_A_ID,
    });
  }, 120_000);

  afterAll(async () => {
    for (const id of createdOpportunityIds) {
      const operation = deleteOneOperationFactory({
        objectMetadataSingularName: 'opportunity',
        gqlFields: 'id',
        recordId: id,
      });

      await makeGraphqlAPIRequest(operation);
    }

    if (partnerId) {
      const operation = deleteOneOperationFactory({
        objectMetadataSingularName: 'partner',
        gqlFields: 'id',
        recordId: partnerId,
      });

      await makeGraphqlAPIRequest(operation);
    }

    await updateWorkspaceMemberRole({
      client,
      roleId: originalMemberRoleId,
      workspaceMemberId: MEMBER_A_ID,
    });
    await updateWorkspaceMemberRole({
      client,
      roleId: originalGuestRoleId,
      workspaceMemberId: MEMBER_B_ID,
    });

    if (marketerPartnerFieldId) {
      await deleteOneFieldMetadata({
        input: { idToDelete: marketerPartnerFieldId },
      });
    }
    if (partnerMemberFieldId) {
      await deleteOneFieldMetadata({
        input: { idToDelete: partnerMemberFieldId },
      });
    }
    // An object has to be deactivated before it can be deleted.
    if (partnerObjectMetadataId) {
      await updateOneObjectMetadata({
        input: {
          idToUpdate: partnerObjectMetadataId,
          updatePayload: { isActive: false },
        },
      });
      await deleteOneObjectMetadata({
        input: { idToDelete: partnerObjectMetadataId },
      });
    }
  }, 120_000);

  it('shows the external marketer a lead they are credited on but do not own', async () => {
    const visibleIds = await visibleOpportunityIdsAsB();

    expect(visibleIds).toContain(creditedOpportunityId);
  });

  it('still hides a lead the marketer has no involvement with', async () => {
    const visibleIds = await visibleOpportunityIdsAsB();

    expect(visibleIds).not.toContain(uncreditedOpportunityId);
  });

  it('stops granting access once the partner record is detached from the login', async () => {
    await setPartnerMemberAsAdmin(null);

    const visibleIds = await visibleOpportunityIdsAsB();

    expect(visibleIds).not.toContain(creditedOpportunityId);

    await setPartnerMemberAsAdmin(MEMBER_B_ID);

    expect(await visibleOpportunityIdsAsB()).toContain(creditedOpportunityId);
  });

  it('refuses an update to a lead the marketer is not credited on', async () => {
    const operation = {
      query: gql`
        mutation UpdateOpportunity($id: UUID!, $data: OpportunityUpdateInput!) {
          updateOpportunity(id: $id, data: $data) {
            id
            name
          }
        }
      `,
      variables: {
        id: uncreditedOpportunityId,
        data: { name: 'renamed by someone with no claim to it' },
      },
    };

    const response = await requestAsB(operation as never);

    // Either a hard error or a no-op is acceptable; what must never happen is
    // the record coming back renamed.
    expect(response.body.data?.updateOpportunity ?? null).toBeNull();

    const adminCheck = findManyOperationFactory({
      objectMetadataSingularName: 'opportunity',
      objectMetadataPluralName: 'opportunities',
      gqlFields: OPPORTUNITY_GQL_FIELDS,
      filter: { id: { eq: uncreditedOpportunityId } },
    });

    const adminResponse = await makeGraphqlAPIRequest(adminCheck);

    expect(adminResponse.body.data.opportunities.edges[0].node.name).toBe(
      'Lead the marketer has nothing to do with',
    );
  });
});
