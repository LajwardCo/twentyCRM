import { CoreObjectNameSingular } from 'twenty-shared/types';
import { isDefined } from 'twenty-shared/utils';

import { HeadlessEngineCommandWrapperEffect } from '@/command-menu-item/engine-command/components/HeadlessEngineCommandWrapperEffect';
import { useHeadlessCommandContextApi } from '@/command-menu-item/engine-command/hooks/useHeadlessCommandContextApi';
import { useFindOneRecord } from '@/object-record/hooks/useFindOneRecord';
import { SendWhatsappModal } from '@/sales-crm/whatsapp/components/SendWhatsappModal';
import { SEND_WHATSAPP_MODAL_ID } from '@/sales-crm/whatsapp/constants/SendWhatsappModalId';
import { useModal } from '@/ui/layout/modal/hooks/useModal';

export const SendWhatsappSingleRecordCommand = () => {
  const { objectMetadataItem, selectedRecords } =
    useHeadlessCommandContextApi();
  const { openModal } = useModal();

  const selectedRecord = selectedRecords[0];
  const isOpportunity =
    objectMetadataItem?.nameSingular === CoreObjectNameSingular.Opportunity;

  // On an opportunity, the message goes to its point of contact person
  const { record: opportunityRecord } = useFindOneRecord({
    objectNameSingular: CoreObjectNameSingular.Opportunity,
    objectRecordId: selectedRecord?.id ?? '',
    recordGqlFields: { id: true, pointOfContactId: true },
    skip: !isOpportunity || !isDefined(selectedRecord?.id),
  });

  const personId = isOpportunity
    ? (opportunityRecord?.pointOfContactId ?? null)
    : (selectedRecord?.id ?? null);
  const opportunityId = isOpportunity ? selectedRecord?.id : undefined;

  const handleExecute = () => {
    openModal(SEND_WHATSAPP_MODAL_ID);
  };

  return (
    <>
      <HeadlessEngineCommandWrapperEffect execute={handleExecute} />
      {isDefined(personId) && (
        <SendWhatsappModal personId={personId} opportunityId={opportunityId} />
      )}
    </>
  );
};
