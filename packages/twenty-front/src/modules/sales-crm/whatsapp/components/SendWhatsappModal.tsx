import { useQuery } from '@apollo/client/react';
import { styled } from '@linaria/react';
import { t } from '@lingui/core/macro';
import { useState } from 'react';
import { Button } from 'twenty-ui/input';
import { themeCssVariables } from 'twenty-ui/theme-constants';

import { SEND_WHATSAPP_MODAL_ID } from '@/sales-crm/whatsapp/constants/SendWhatsappModalId';
import { WHATSAPP_TEMPLATES } from '@/sales-crm/whatsapp/graphql/queries/whatsappTemplates';
import { useSendWhatsappMessage } from '@/sales-crm/whatsapp/hooks/useSendWhatsappMessage';
import { Select } from '@/ui/input/components/Select';
import { TextArea } from '@/ui/input/components/TextArea';
import { TextInput } from '@/ui/input/components/TextInput';
import { ModalStatefulWrapper } from '@/ui/layout/modal/components/ModalStatefulWrapper';
import { useModal } from '@/ui/layout/modal/hooks/useModal';
import { type WhatsappTemplatesQuery } from '~/generated-metadata/graphql';

const StyledContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[4]};
`;

const StyledTitle = styled.div`
  color: ${themeCssVariables.font.color.primary};
  font-size: ${themeCssVariables.font.size.lg};
  font-weight: ${themeCssVariables.font.weight.semiBold};
`;

const StyledModeToggle = styled.div`
  display: flex;
  gap: ${themeCssVariables.spacing[2]};
`;

const StyledPreview = styled.div`
  background: ${themeCssVariables.background.secondary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: ${themeCssVariables.border.radius.md};
  color: ${themeCssVariables.font.color.secondary};
  font-size: ${themeCssVariables.font.size.md};
  padding: ${themeCssVariables.spacing[3]};
  white-space: pre-wrap;
`;

const StyledHint = styled.div`
  color: ${themeCssVariables.font.color.light};
  font-size: ${themeCssVariables.font.size.sm};
`;

const StyledFooter = styled.div`
  display: flex;
  gap: ${themeCssVariables.spacing[2]};
  justify-content: flex-end;
`;

type SendWhatsappModalProps = {
  personId: string;
  opportunityId?: string;
};

export const SendWhatsappModal = ({
  personId,
  opportunityId,
}: SendWhatsappModalProps) => {
  const { closeModal } = useModal();
  const { sendWhatsappMessage, loading: sending } = useSendWhatsappMessage();
  const { data, loading, error, refetch } =
    useQuery<WhatsappTemplatesQuery>(WHATSAPP_TEMPLATES);

  const [mode, setMode] = useState<'template' | 'text'>('template');
  const [selectedTemplateName, setSelectedTemplateName] = useState<
    string | null
  >(null);
  const [templateParams, setTemplateParams] = useState<string[]>([]);
  const [freeText, setFreeText] = useState('');

  const templates = data?.whatsappTemplates ?? [];
  const selectedTemplate = templates.find(
    (template) => template.name === selectedTemplateName,
  );

  const previewText = selectedTemplate
    ? selectedTemplate.bodyText.replace(
        /\{\{(\d+)\}\}/g,
        (placeholder, index) =>
          templateParams[Number(index) - 1] || placeholder,
      )
    : '';

  const isSendDisabled =
    sending ||
    (mode === 'template'
      ? !selectedTemplate ||
        templateParams.length !== (selectedTemplate?.variableCount ?? 0) ||
        templateParams.some((parameter) => parameter.trim() === '')
      : freeText.trim() === '');

  const handleSelectTemplate = (templateName: string) => {
    setSelectedTemplateName(templateName);
    const template = templates.find((item) => item.name === templateName);
    setTemplateParams(new Array(template?.variableCount ?? 0).fill(''));
  };

  const handleSend = async () => {
    const succeeded =
      mode === 'template' && selectedTemplate
        ? await sendWhatsappMessage({
            personId,
            opportunityId,
            templateName: selectedTemplate.name,
            templateLanguage: selectedTemplate.language,
            templateBodyParams: templateParams,
          })
        : await sendWhatsappMessage({
            personId,
            opportunityId,
            text: freeText,
          });

    if (succeeded) {
      closeModal(SEND_WHATSAPP_MODAL_ID);
    }
  };

  return (
    <ModalStatefulWrapper
      modalInstanceId={SEND_WHATSAPP_MODAL_ID}
      isClosable
      autoHeight
    >
      <StyledContainer>
        <StyledTitle>{t`Send WhatsApp message`}</StyledTitle>
        <StyledModeToggle>
          <Button
            title={t`Template`}
            variant={mode === 'template' ? 'primary' : 'secondary'}
            onClick={() => setMode('template')}
          />
          <Button
            title={t`Free text`}
            variant={mode === 'text' ? 'primary' : 'secondary'}
            onClick={() => setMode('text')}
          />
        </StyledModeToggle>
        {mode === 'template' && (
          <>
            {error ? (
              <>
                <StyledHint>{t`Could not load templates. Check the WhatsApp configuration.`}</StyledHint>
                <Button title={t`Retry`} onClick={() => refetch()} />
              </>
            ) : (
              <Select
                dropdownId="send-whatsapp-template-select"
                label={t`Template`}
                fullWidth
                disabled={loading}
                options={templates.map((template) => ({
                  value: template.name,
                  label: `${template.name} (${template.language})`,
                }))}
                value={selectedTemplateName ?? undefined}
                onChange={(value) => handleSelectTemplate(value as string)}
              />
            )}
            {selectedTemplate &&
              templateParams.map((parameter, index) => (
                <TextInput
                  key={`${selectedTemplate.name}-param-${index}`}
                  label={t`Variable ${index + 1}`}
                  value={parameter}
                  fullWidth
                  onChange={(value) =>
                    setTemplateParams((previous) =>
                      previous.map((item, itemIndex) =>
                        itemIndex === index ? value : item,
                      ),
                    )
                  }
                />
              ))}
            {selectedTemplate && <StyledPreview>{previewText}</StyledPreview>}
          </>
        )}
        {mode === 'text' && (
          <>
            <TextArea
              textAreaId="send-whatsapp-free-text"
              placeholder={t`Type your message`}
              value={freeText}
              onChange={setFreeText}
              minRows={4}
            />
            <StyledHint>
              {t`Free-form messages only deliver if the contact messaged you within the last 24 hours. Otherwise use a template.`}
            </StyledHint>
          </>
        )}
        <StyledFooter>
          <Button
            title={t`Cancel`}
            variant="secondary"
            onClick={() => closeModal(SEND_WHATSAPP_MODAL_ID)}
          />
          <Button
            title={sending ? t`Sending…` : t`Send`}
            accent="blue"
            disabled={isSendDisabled}
            onClick={handleSend}
          />
        </StyledFooter>
      </StyledContainer>
    </ModalStatefulWrapper>
  );
};
