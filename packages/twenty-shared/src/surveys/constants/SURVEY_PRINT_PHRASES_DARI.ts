import { type SurveyPrintPhrases } from '../types/SurveyPrintPhrases';

export const SURVEY_PRINT_PHRASES_DARI: SurveyPrintPhrases = {
  and: ' و ',
  or: ' یا ',
  yes: 'بلی',
  no: 'نخیر',
  answered: (question) => `به ${question} پاسخ داده‌اید`,
  notAnswered: (question) => `به ${question} پاسخ نداده‌اید`,
  equals: (question, value) => `پاسخ ${question} «${value}» است`,
  notEquals: (question, value) => `پاسخ ${question} «${value}» نیست`,
  includes: (question, value) =>
    `در ${question} گزینهٔ «${value}» را انتخاب کرده‌اید`,
  excludes: (question, value) =>
    `در ${question} گزینهٔ «${value}» را انتخاب نکرده‌اید`,
  greaterThan: (question, value) => `پاسخ ${question} بیشتر از ${value} است`,
  atLeast: (question, value) => `پاسخ ${question} ${value} یا بیشتر است`,
  lessThan: (question, value) => `پاسخ ${question} کمتر از ${value} است`,
  atMost: (question, value) => `پاسخ ${question} ${value} یا کمتر است`,
  question: (number) => `سؤال ${number}`,
  answerOnlyIf: (condition) => `فقط در صورتی پاسخ دهید که ${condition}.`,
  requiredIf: (condition) => `اگر ${condition}، پاسخ به این سؤال الزامی است.`,
  goTo: (condition, question) => `اگر ${condition}، به ${question} بروید.`,
  finish: (condition) => `اگر ${condition}، پرسشنامه همین‌جا تمام است.`,
  goToAlways: (question) => `به ${question} بروید.`,
  finishAlways: 'پرسشنامه همین‌جا تمام است.',
  jumpRule: 'قاعدهٔ پرش این صفحه',
  conditionalEndingNote:
    'پیام پایانی متناسب با پاسخ‌ها فقط در نسخهٔ آنلاین نمایش داده می‌شود.',
  staffOnlyOmittedNote: (count) =>
    `${count} سؤال مخصوص کارمندان در این نسخهٔ چاپی نیامده است.`,
  alternativeFile: 'عکس یا سند را ضمیمه کنید و شمارهٔ برگه را پشت آن بنویسید.',
  alternativeLocation: 'نشانی دقیق یا نزدیک‌ترین نشانه را بنویسید.',
  alternativeCompany: 'نام کسب‌وکار را بنویسید.',
  alternativeContact: 'نام و شمارهٔ تماس شخص را بنویسید.',
  alternativeLead: 'توسط کارمند تکمیل می‌شود.',
  alternativeImage: '(تصویر فقط در نسخهٔ آنلاین)',
  unprintableReference: (what) =>
    `${what} به سؤالی وابسته است که در نسخهٔ چاپی نیست؛ دستور کاغذی آن مبهم می‌شود.`,
};
