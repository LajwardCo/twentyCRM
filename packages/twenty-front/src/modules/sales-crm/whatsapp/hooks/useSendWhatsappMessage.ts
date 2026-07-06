import { useMutation } from '@apollo/client/react';
import { useCallback } from 'react';

import { SEND_WHATSAPP_MESSAGE } from '@/sales-crm/whatsapp/graphql/mutations/sendWhatsappMessage';
import { useSnackBar } from '@/ui/feedback/snack-bar-manager/hooks/useSnackBar';
import { t } from '@lingui/core/macro';
import {
  type SendWhatsappMessageMutation,
  type SendWhatsappMessageMutationVariables,
} from '~/generated-metadata/graphql';

export type SendWhatsappMessageParams = {
  personId: string;
  opportunityId?: string;
  text?: string;
  templateName?: string;
  templateLanguage?: string;
  templateBodyParams?: string[];
};

export const useSendWhatsappMessage = () => {
  const [sendWhatsappMessageMutation, { loading }] = useMutation<
    SendWhatsappMessageMutation,
    SendWhatsappMessageMutationVariables
  >(SEND_WHATSAPP_MESSAGE);

  const { enqueueSuccessSnackBar, enqueueErrorSnackBar } = useSnackBar();

  const sendWhatsappMessage = useCallback(
    async (params: SendWhatsappMessageParams): Promise<boolean> => {
      try {
        const result = await sendWhatsappMessageMutation({
          variables: { input: params },
        });

        if (result.data?.sendWhatsappMessage.success) {
          enqueueSuccessSnackBar({
            message: t`WhatsApp message sent`,
          });

          return true;
        }

        enqueueErrorSnackBar({
          message:
            result.data?.sendWhatsappMessage.error ??
            t`Failed to send WhatsApp message`,
        });

        return false;
      } catch {
        enqueueErrorSnackBar({
          message: t`Failed to send WhatsApp message`,
        });

        return false;
      }
    },
    [sendWhatsappMessageMutation, enqueueSuccessSnackBar, enqueueErrorSnackBar],
  );

  return { sendWhatsappMessage, loading };
};
