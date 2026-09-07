import { metadataQuery } from './client';

// Whether this server actually has person.phoneApps.
//
// Asked of the metadata API rather than inferred from a failed record query:
// the record API answers an unknown SELECTED field with `null` instead of a
// validation error (verified against production), so selecting `phoneApps` on a
// server that lacks it succeeds and reads null for everyone -- indistinguishable
// from "nobody has tagged an app yet". Showing the toggles in that state would
// hand sellers switches whose every change is silently dropped on save.
//
// A field in a mutation's INPUT is validated, so the write path could have used
// a try/catch -- but by then the seller has already ticked the boxes, and the
// same answer is needed to decide whether to render them at all.
//
// Cached for the session: it only changes when someone runs the provisioner,
// and this would otherwise cost a metadata round-trip per contact loaded.
let phoneAppsProvisioned: boolean | null = null;

export const isPhoneAppsFieldProvisioned = async (): Promise<boolean> => {
  if (phoneAppsProvisioned !== null) return phoneAppsProvisioned;

  try {
    const data = await metadataQuery<{
      objects: {
        edges: {
          node: {
            nameSingular: string;
            fields: { edges: { node: { name: string } }[] };
          };
        }[];
      };
    }>(
      `query PhoneAppsFieldProbe {
        objects(paging: { first: 500 }) {
          edges {
            node {
              nameSingular
              fields(paging: { first: 500 }) { edges { node { name } } }
            }
          }
        }
      }`,
    );

    const person = data.objects.edges.find(
      (edge) => edge.node.nameSingular === 'person',
    );

    phoneAppsProvisioned =
      person?.node.fields.edges.some((f) => f.node.name === 'phoneApps') ??
      false;
  } catch {
    // A probe that could not run is not evidence the field is missing, so the
    // answer is not cached -- the next call tries again.
    return false;
  }

  return phoneAppsProvisioned;
};
