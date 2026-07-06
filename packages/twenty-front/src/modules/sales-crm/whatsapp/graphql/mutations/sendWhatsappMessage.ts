import gql from 'graphql-tag';

export const SEND_WHATSAPP_MESSAGE = gql`
  mutation SendWhatsappMessage($input: SendWhatsappMessageInput!) {
    sendWhatsappMessage(input: $input) {
      success
      waMessageId
      error
    }
  }
`;
