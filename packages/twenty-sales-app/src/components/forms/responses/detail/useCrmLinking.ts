import { useRef, useState } from 'react';

import { type CurrentUser } from '../../../../api/auth';
import { fetchResponse, updateResponse } from '../../../../api/surveys';
import { TSR } from '../../../../lib/forms/responseStrings';
import {
  CRM_LINK_FIELD,
  type CrmLinkKind,
  appendCrmAction,
  crmActionKey,
  hasDoneAction,
} from '../../../../lib/forms/responses/crmActionLog';

const linkedId = (
  response: { company: { id: string } | null; person: { id: string } | null; opportunity: { id: string } | null },
  kind: CrmLinkKind,
): string | null => (kind === 'company' ? response.company?.id : kind === 'person' ? response.person?.id : response.opportunity?.id) ?? null;

// Link/create for the review panel, safe against double clicks, two open
// tabs and two reviewers: the response is re-read right before acting, a
// create never runs when the kind is already linked (or was created before),
// and the link plus its log entry are written together.
export const useCrmLinking = ({
  responseId,
  user,
  onChanged,
}: {
  responseId: string;
  user: CurrentUser;
  onChanged: () => Promise<void> | void;
}) => {
  const inFlight = useRef(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [askActioned, setAskActioned] = useState(false);

  const perform = async (
    kind: CrmLinkKind,
    verb: 'create' | 'link',
    obtainRecordId: () => Promise<string>,
  ): Promise<boolean> => {
    if (inFlight.current) return false;

    const key = crmActionKey(verb, kind);

    inFlight.current = true;
    setBusyKey(key);
    setNotice(null);

    try {
      const fresh = await fetchResponse(responseId);

      if (fresh === null) throw new Error(TSR.notFound);

      if (verb === 'create' && (linkedId(fresh, kind) !== null || hasDoneAction(fresh.crmActions, key))) {
        setNotice(TSR.alreadyLinked);
        await onChanged();

        return false;
      }

      const recordId = await obtainRecordId();

      await updateResponse(responseId, {
        [CRM_LINK_FIELD[kind]]: recordId,
        crmActions: appendCrmAction(fresh.crmActions, {
          key,
          type: verb === 'create' ? 'CREATE' : 'LINK',
          status: 'DONE',
          by: user.workspaceMemberId,
          recordId,
          target: kind,
        }),
      });

      if (kind === 'opportunity' && fresh.reviewStatus !== 'ACTIONED') setAskActioned(true);

      await onChanged();

      return true;
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));

      return false;
    } finally {
      inFlight.current = false;
      setBusyKey(null);
    }
  };

  const markActioned = async () => {
    setAskActioned(false);

    try {
      await updateResponse(responseId, { reviewStatus: 'ACTIONED' });
      await onChanged();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
    }
  };

  return {
    busyKey,
    busy: busyKey !== null,
    notice,
    askActioned,
    dismissActioned: () => setAskActioned(false),
    markActioned,
    link: (kind: CrmLinkKind, recordId: string) => perform(kind, 'link', async () => recordId),
    create: (kind: CrmLinkKind, createRecord: () => Promise<string>) => perform(kind, 'create', createRecord),
  };
};

export type CrmLinking = ReturnType<typeof useCrmLinking>;
