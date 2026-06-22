import { randomUUID } from 'node:crypto';

import gql from 'graphql-tag';
import { default as request } from 'supertest';
import { createOneOperationFactory } from 'test/integration/graphql/utils/create-one-operation-factory.util';
import { deleteOneOperationFactory } from 'test/integration/graphql/utils/delete-one-operation-factory.util';
import { findManyOperationFactory } from 'test/integration/graphql/utils/find-many-operation-factory.util';
import { findOneOperationFactory } from 'test/integration/graphql/utils/find-one-operation-factory.util';
import { makeGraphqlAPIRequest } from 'test/integration/graphql/utils/make-graphql-api-request.util';
import { searchFactory } from 'test/integration/graphql/utils/search-factory.util';
import { updateOneOperationFactory } from 'test/integration/graphql/utils/update-one-operation-factory.util';
import { updateWorkspaceMemberRole } from 'test/integration/graphql/utils/update-workspace-member-role.util';
import { makeMetadataAPIRequest } from 'test/integration/metadata/suites/utils/make-metadata-api-request.util';

import { WORKSPACE_MEMBER_DATA_SEED_IDS } from 'src/engine/workspace-manager/dev-seeder/data/constants/workspace-member-data-seeds.constant';

// Record-level owner scoping integration coverage.
//
// A and B are two DIFFERENT seeded workspace members that we both assign to a
// custom "Salesperson" role whose `canOnlyAccessOwnedRecords` flag is true and
// which has person CRUD object permission:
//   - A = Jony  (acts via APPLE_JONY_MEMBER_ACCESS_TOKEN)
//   - B = Phil  (acts via APPLE_PHIL_GUEST_ACCESS_TOKEN)
// Their original seeded roles are irrelevant during the test (both get the
// Salesperson role) and are restored in afterAll.
//
// All record setup/inspection runs as admin (Jane) via makeGraphqlAPIRequest,
// which targets person.ownerId directly so we read the *stored* owner, not a
// scoped view.

const MEMBER_A_ID = WORKSPACE_MEMBER_DATA_SEED_IDS.JONY;
const MEMBER_B_ID = WORKSPACE_MEMBER_DATA_SEED_IDS.PHIL;

const OWNER_GQL_FIELDS = `
  id
  jobTitle
  ownerId
`;

describe('ownerScopedRecords', () => {
  const client = request(`http://localhost:${APP_PORT}`);

  // Act AS member A (Jony) and member B (Phil) by passing their seeded tokens
  // to the shared request util.
  const requestAsA = (operation: { query: unknown; variables?: unknown }) =>
    makeGraphqlAPIRequest(operation as never, APPLE_JONY_MEMBER_ACCESS_TOKEN);
  const requestAsB = (operation: { query: unknown; variables?: unknown }) =>
    makeGraphqlAPIRequest(operation as never, APPLE_PHIL_GUEST_ACCESS_TOKEN);

  let salespersonRoleId: string;
  let originalMemberRoleId: string;
  let originalGuestRoleId: string;
  let personObjectMetadataId: string;

  const personIdA = randomUUID();
  const personIdB = randomUUID();
  const personIdUnassigned = randomUUID();
  // Tracks every person created during the suite for cleanup as admin.
  const createdPersonIds: string[] = [personIdA, personIdB, personIdUnassigned];

  // A scoped user must never receive a person they don't own via findOne. The
  // API expresses "not visible" as either `data.person === null` OR a
  // RECORD_NOT_FOUND error; both are valid as long as no record is leaked.
  const expectPersonHidden = (
    response: { body: { data?: { person?: { id?: string } | null }; errors?: unknown[] } },
    expectedHiddenId: string,
  ) => {
    const person = response.body.data?.person ?? null;

    if (person !== null) {
      // If a record came back at all, it must not be the hidden one.
      expect(person.id).not.toBe(expectedHiddenId);
    } else {
      // Null data is fine; any error here must be a not-found (no record
      // leak), never a partial record.
      expect(person).toBeNull();
    }
  };

  const findPersonByIdAsAdmin = async (id: string) => {
    const operation = findManyOperationFactory({
      objectMetadataSingularName: 'person',
      objectMetadataPluralName: 'people',
      gqlFields: OWNER_GQL_FIELDS,
      filter: { id: { eq: id } },
    });

    const response = await makeGraphqlAPIRequest(operation);

    const edges = response.body.data?.people?.edges ?? [];

    return edges.length > 0 ? edges[0].node : null;
  };

  beforeAll(async () => {
    // Resolve original roles so we can restore membership in afterAll.
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

    // Create the Salesperson role with the owner-scoping flag turned on.
    const createRoleResponse = await makeMetadataAPIRequest({
      query: gql`
        mutation CreateSalespersonRole {
          createOneRole(
            createRoleInput: {
              label: "Salesperson ${randomUUID()}"
              description: "Owner-scoped salesperson role"
              canUpdateAllSettings: false
              canReadAllObjectRecords: false
              canUpdateAllObjectRecords: false
              canSoftDeleteAllObjectRecords: false
              canDestroyAllObjectRecords: false
              canOnlyAccessOwnedRecords: true
            }
          ) {
            id
            label
            canOnlyAccessOwnedRecords
          }
        }
      `,
    });

    expect(createRoleResponse.body.errors).toBeUndefined();
    expect(
      createRoleResponse.body.data.createOneRole.canOnlyAccessOwnedRecords,
    ).toBe(true);

    salespersonRoleId = createRoleResponse.body.data.createOneRole.id;

    // Resolve the person object metadata id for the object-permission grant.
    const objectsResponse = await makeMetadataAPIRequest({
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

    personObjectMetadataId = objectsResponse.body.data.objects.edges.find(
      (edge: { node: { nameSingular: string } }) =>
        edge.node.nameSingular === 'person',
    ).node.id;

    // Grant person read/update/soft-delete/destroy to the Salesperson role.
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
            canReadObjectRecords
          }
        }
      `,
      variables: {
        roleId: salespersonRoleId,
        objectPermissions: [
          {
            objectMetadataId: personObjectMetadataId,
            canReadObjectRecords: true,
            canUpdateObjectRecords: true,
            canSoftDeleteObjectRecords: true,
            canDestroyObjectRecords: true,
          },
        ],
      },
    });

    expect(grantResponse.body.errors).toBeUndefined();

    // Assign the Salesperson role to BOTH members A and B.
    await updateWorkspaceMemberRole({
      client,
      roleId: salespersonRoleId,
      workspaceMemberId: MEMBER_A_ID,
    });
    await updateWorkspaceMemberRole({
      client,
      roleId: salespersonRoleId,
      workspaceMemberId: MEMBER_B_ID,
    });

    // Seed the three people as admin: P_A (owned by A), P_B (owned by B),
    // P_UNASSIGNED (no owner).
    const createPersonAsAdmin = async (id: string, ownerId: string | null) => {
      const operation = createOneOperationFactory({
        objectMetadataSingularName: 'person',
        gqlFields: OWNER_GQL_FIELDS,
        data: { id, jobTitle: 'Sales', ownerId },
      });

      const response = await makeGraphqlAPIRequest(operation);

      expect(response.body.errors).toBeUndefined();
      expect(response.body.data.createPerson.ownerId).toBe(ownerId);
    };

    await createPersonAsAdmin(personIdA, MEMBER_A_ID);
    await createPersonAsAdmin(personIdB, MEMBER_B_ID);
    await createPersonAsAdmin(personIdUnassigned, null);
  });

  afterAll(async () => {
    // Destroy every person we created (admin) so the suite leaves no residue.
    for (const id of createdPersonIds) {
      const destroyOperation = {
        query: gql`
          mutation DestroyPerson($personId: UUID!) {
            destroyPerson(id: $personId) {
              id
            }
          }
        `,
        variables: { personId: id },
      };

      await makeGraphqlAPIRequest(destroyOperation);
    }

    // Restore the members' original roles.
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

    // Drop the custom role.
    await makeMetadataAPIRequest({
      query: gql`
        mutation DeleteSalespersonRole($roleId: UUID!) {
          deleteOneRole(roleId: $roleId)
        }
      `,
      variables: { roleId: salespersonRoleId },
    });
  });

  it('findMany people as A returns P_A but not P_B nor P_UNASSIGNED', async () => {
    const operation = findManyOperationFactory({
      objectMetadataSingularName: 'person',
      objectMetadataPluralName: 'people',
      gqlFields: OWNER_GQL_FIELDS,
      // Constrain to our three known ids so unrelated seed data can't pollute.
      filter: {
        id: { in: [personIdA, personIdB, personIdUnassigned] },
      },
    });

    const response = await requestAsA(operation);

    expect(response.body.errors).toBeUndefined();

    const ids = response.body.data.people.edges.map(
      (edge: { node: { id: string } }) => edge.node.id,
    );

    expect(ids).toContain(personIdA);
    expect(ids).not.toContain(personIdB);
    expect(ids).not.toContain(personIdUnassigned);
  });

  it('findOne person(P_B) as A does not return the record', async () => {
    const operation = findOneOperationFactory({
      objectMetadataSingularName: 'person',
      gqlFields: OWNER_GQL_FIELDS,
      filter: { id: { eq: personIdB } },
    });

    const response = await requestAsA(operation);

    // The record must be invisible to A. findOne signals "no matching record"
    // either by returning null data or a RECORD_NOT_FOUND error; both are
    // acceptable, but A must NEVER receive B's record.
    expectPersonHidden(response, personIdB);
  });

  it('updateOne person(P_B) as A does not modify P_B', async () => {
    const beforeAsAdmin = await findPersonByIdAsAdmin(personIdB);

    expect(beforeAsAdmin).not.toBeNull();

    const operation = updateOneOperationFactory({
      objectMetadataSingularName: 'person',
      gqlFields: OWNER_GQL_FIELDS,
      recordId: personIdB,
      data: { jobTitle: 'HACKED BY A' },
    });

    const response = await requestAsA(operation);

    // The mutation must not affect P_B. Either it errors / returns null, but it
    // must NOT return a mutated record.
    if (response.body.data?.updatePerson) {
      expect(response.body.data.updatePerson.jobTitle).not.toBe('HACKED BY A');
    }

    // Source of truth: re-read as admin and confirm it is unchanged.
    const afterAsAdmin = await findPersonByIdAsAdmin(personIdB);

    expect(afterAsAdmin).not.toBeNull();
    expect(afterAsAdmin.jobTitle).toBe(beforeAsAdmin.jobTitle);
    expect(afterAsAdmin.jobTitle).not.toBe('HACKED BY A');
    expect(afterAsAdmin.ownerId).toBe(MEMBER_B_ID);
  });

  it('deleteOne person(P_B) as A does not delete P_B', async () => {
    const operation = deleteOneOperationFactory({
      objectMetadataSingularName: 'person',
      gqlFields: 'id',
      recordId: personIdB,
    });

    await requestAsA(operation);

    // Confirm P_B is still present (not soft-deleted) when read as admin.
    const afterAsAdmin = await findPersonByIdAsAdmin(personIdB);

    expect(afterAsAdmin).not.toBeNull();
    expect(afterAsAdmin.id).toBe(personIdB);
    expect(afterAsAdmin.ownerId).toBe(MEMBER_B_ID);
  });

  it('createOne person as A force-assigns ownerId = A', async () => {
    const newPersonId = randomUUID();

    createdPersonIds.push(newPersonId);

    const operation = createOneOperationFactory({
      objectMetadataSingularName: 'person',
      gqlFields: OWNER_GQL_FIELDS,
      data: { id: newPersonId, jobTitle: 'Created by A' },
    });

    const response = await requestAsA(operation);

    expect(response.body.errors).toBeUndefined();
    expect(response.body.data.createPerson.ownerId).toBe(MEMBER_A_ID);

    // Confirm the stored owner is A (admin view).
    const storedRecord = await findPersonByIdAsAdmin(newPersonId);

    expect(storedRecord.ownerId).toBe(MEMBER_A_ID);
  });

  it('createOne person as A with foreign ownerId=B is force-assigned to A; B cannot see it, A can', async () => {
    const newPersonId = randomUUID();

    createdPersonIds.push(newPersonId);

    const operation = createOneOperationFactory({
      objectMetadataSingularName: 'person',
      gqlFields: OWNER_GQL_FIELDS,
      // A maliciously tries to create a record owned by B.
      data: { id: newPersonId, jobTitle: 'Owner spoof attempt', ownerId: MEMBER_B_ID },
    });

    const response = await requestAsA(operation);

    expect(response.body.errors).toBeUndefined();
    // SECURITY: the passed ownerId (B) must be overridden to A.
    expect(response.body.data.createPerson.ownerId).toBe(MEMBER_A_ID);

    // Stored owner is A, not B.
    const storedRecord = await findPersonByIdAsAdmin(newPersonId);

    expect(storedRecord.ownerId).toBe(MEMBER_A_ID);

    // B cannot see A's record.
    const findOneAsB = findOneOperationFactory({
      objectMetadataSingularName: 'person',
      gqlFields: OWNER_GQL_FIELDS,
      filter: { id: { eq: newPersonId } },
    });

    const responseAsB = await requestAsB(findOneAsB);

    // B must not be able to see the record (A owns it).
    expectPersonHidden(responseAsB, newPersonId);

    // A can see their own record.
    const findOneAsA = findOneOperationFactory({
      objectMetadataSingularName: 'person',
      gqlFields: OWNER_GQL_FIELDS,
      filter: { id: { eq: newPersonId } },
    });

    const responseAsA = await requestAsA(findOneAsA);

    expect(responseAsA.body.errors).toBeUndefined();
    expect(responseAsA.body.data.person).not.toBeNull();
    expect(responseAsA.body.data.person.id).toBe(newPersonId);
    expect(responseAsA.body.data.person.ownerId).toBe(MEMBER_A_ID);
  });

  it('admin (flag false) findMany people sees P_A, P_B and P_UNASSIGNED', async () => {
    const operation = findManyOperationFactory({
      objectMetadataSingularName: 'person',
      objectMetadataPluralName: 'people',
      gqlFields: OWNER_GQL_FIELDS,
      filter: {
        id: { in: [personIdA, personIdB, personIdUnassigned] },
      },
    });

    const response = await makeGraphqlAPIRequest(operation);

    expect(response.body.errors).toBeUndefined();

    const ids = response.body.data.people.edges.map(
      (edge: { node: { id: string } }) => edge.node.id,
    );

    expect(ids).toContain(personIdA);
    expect(ids).toContain(personIdB);
    expect(ids).toContain(personIdUnassigned);
  });

  it('search as A surfaces only A-owned people (not B-owned)', async () => {
    // P_A and P_B share the same jobTitle ("Sales"); both carry it in the
    // search vector, so a search must still scope to the owner.
    const operation = searchFactory({
      searchInput: 'Sales',
      includedObjectNameSingulars: ['person'],
      limit: 50,
    } as never);

    const response = await requestAsA(operation);

    expect(response.body.errors).toBeUndefined();

    const recordIds = response.body.data.search.edges.map(
      (edge: { node: { recordId: string } }) => edge.node.recordId,
    );

    // A must never see B's record nor the unassigned one via search.
    expect(recordIds).not.toContain(personIdB);
    expect(recordIds).not.toContain(personIdUnassigned);
  });
});
