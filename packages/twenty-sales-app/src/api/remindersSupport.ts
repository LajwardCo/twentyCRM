import { useEffect, useState } from 'react';

import { metadataQuery } from './client';

// Whether this server has task.remindAt (i.e. provision-reminders.mjs ran).
//
// Asked of the metadata API rather than inferred from a record query: the
// record API answers an unknown SELECTED field with null, so reading remindAt
// on an unprovisioned server "works" and reads null for everyone. Writes ARE
// validated, so every control that writes a reminder hides behind this probe
// -- otherwise a seller could fill in a reminder that the save then rejects.
//
// Cached for the session: it only changes when someone runs the provisioner.
let remindersProvisioned: boolean | null = null;
let inflight: Promise<boolean> | null = null;

export const isRemindersProvisioned = async (): Promise<boolean> => {
  if (remindersProvisioned !== null) return remindersProvisioned;
  // The shell bell, the Today card and the lead page all ask at mount; one
  // round-trip should answer all of them.
  if (inflight !== null) return inflight;

  inflight = (async () => {
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
        `query RemindersFieldProbe {
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

      const task = data.objects.edges.find((edge) => edge.node.nameSingular === 'task');
      remindersProvisioned =
        task?.node.fields.edges.some((f) => f.node.name === 'remindAt') ?? false;
      return remindersProvisioned;
    } catch {
      // A probe that could not run is not evidence the field is missing, so
      // the answer is not cached -- the next call tries again.
      return false;
    } finally {
      inflight = null;
    }
  })();

  return inflight;
};

// null while the probe is in flight, so callers can render nothing rather
// than flash a control that may disappear.
export const useRemindersProvisioned = (): boolean | null => {
  const [provisioned, setProvisioned] = useState<boolean | null>(remindersProvisioned);

  useEffect(() => {
    if (provisioned !== null) return;
    let cancelled = false;
    void isRemindersProvisioned().then((answer) => {
      if (!cancelled) setProvisioned(answer);
    });
    return () => {
      cancelled = true;
    };
  }, [provisioned]);

  return provisioned;
};
