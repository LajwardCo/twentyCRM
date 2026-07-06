import gql from 'graphql-tag';

export const WHATSAPP_TEMPLATES = gql`
  query WhatsappTemplates {
    whatsappTemplates {
      name
      language
      status
      bodyText
      variableCount
    }
  }
`;
