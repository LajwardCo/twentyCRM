import { type SurveyPrintPhrases } from '../types/SurveyPrintPhrases';

export const SURVEY_PRINT_PHRASES_ENGLISH: SurveyPrintPhrases = {
  and: ' and ',
  or: ' or ',
  yes: 'Yes',
  no: 'No',
  answered: (question) => `you answered ${question}`,
  notAnswered: (question) => `you did not answer ${question}`,
  equals: (question, value) => `your answer to ${question} is "${value}"`,
  notEquals: (question, value) =>
    `your answer to ${question} is not "${value}"`,
  includes: (question, value) => `you ticked "${value}" in ${question}`,
  excludes: (question, value) => `you did not tick "${value}" in ${question}`,
  greaterThan: (question, value) =>
    `your answer to ${question} is more than ${value}`,
  atLeast: (question, value) =>
    `your answer to ${question} is ${value} or more`,
  lessThan: (question, value) =>
    `your answer to ${question} is less than ${value}`,
  atMost: (question, value) => `your answer to ${question} is ${value} or less`,
  question: (number) => `question ${number}`,
  answerOnlyIf: (condition) => `Answer only if ${condition}.`,
  requiredIf: (condition) => `If ${condition}, this question is required.`,
  goTo: (condition, question) => `If ${condition}, go to ${question}.`,
  finish: (condition) =>
    `If ${condition}, you have finished the questionnaire.`,
  goToAlways: (question) => `Go to ${question}.`,
  finishAlways: 'You have finished the questionnaire.',
  jumpRule: 'The skip rule on this page',
  conditionalEndingNote:
    'Answer-specific closing messages are shown in the online version only.',
  staffOnlyOmittedNote: (count) =>
    `${count} staff-only question(s) are not included in this printed copy.`,
  alternativeFile:
    'Attach the photo or document and write the sheet reference on it.',
  alternativeLocation: 'Write the exact address or nearest landmark.',
  alternativeCompany: 'Write the business name.',
  alternativeContact: "Write the person's name and phone number.",
  alternativeLead: 'Completed by staff.',
  alternativeImage: '(image shown online only)',
  unprintableReference: (what) =>
    `${what} depends on a question that is not on paper, so its paper instruction would be ambiguous.`,
};
