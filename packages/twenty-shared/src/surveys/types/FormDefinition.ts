// The whole survey schema lives in one file on purpose: these types only make
// sense together, and the Sales App imports this folder by source path, so a
// single self-contained file keeps that alias trivial.

export type FormLanguage = 'fa' | 'ps' | 'en';

export type LocalizedText = Partial<Record<FormLanguage, string>>;

export type FormAudience = 'PUBLIC' | 'STAFF';

export type QuestionAudience = 'ALL' | 'STAFF_ONLY';

export type QuestionType =
  | 'short_text'
  | 'long_text'
  | 'number'
  | 'email'
  | 'phone'
  | 'website'
  | 'single_choice'
  | 'multi_choice'
  | 'dropdown'
  | 'yes_no'
  | 'date'
  | 'time'
  | 'datetime'
  | 'rating'
  | 'opinion_scale'
  | 'address'
  | 'location'
  | 'file'
  | 'consent'
  | 'crm_company'
  | 'crm_contact'
  | 'crm_lead';

export type ChoiceOption = {
  id: string;
  label: LocalizedText;
};

export type QuestionConfig = {
  choices?: ChoiceOption[];
  allowOther?: boolean;
  otherLabel?: LocalizedText;
  defaultValue?: string | number | boolean | string[];
  // Text length bounds (characters).
  minLength?: number;
  maxLength?: number;
  // Numeric bounds for number questions.
  min?: number;
  max?: number;
  // Multi-choice selection bounds.
  minSelected?: number;
  maxSelected?: number;
  // Rating: 1..scaleMax. Opinion scale: scaleMin..scaleMax.
  scaleMin?: number;
  scaleMax?: number;
  scaleMinLabel?: LocalizedText;
  scaleMaxLabel?: LocalizedText;
  // File upload.
  fileTypes?: FileTypeGroup[];
  maxFileMb?: number;
  maxFiles?: number;
  // Consent text shown next to the checkbox.
  consentText?: LocalizedText;
};

export type FileTypeGroup =
  | 'image'
  | 'pdf'
  | 'document'
  | 'spreadsheet'
  | 'audio';

export type ConditionOperator =
  | 'answered'
  | 'not_answered'
  | 'eq'
  | 'neq'
  | 'includes'
  | 'excludes'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte';

export type Condition = {
  questionId: string;
  op: ConditionOperator;
  // Choice id for choice questions, boolean for yes/no, number or string
  // otherwise. Unused for answered / not_answered.
  value?: string | number | boolean;
};

export type ConditionGroup = {
  mode: 'ALL' | 'ANY';
  conditions: Condition[];
};

export type Question = {
  kind: 'question';
  id: string;
  type: QuestionType;
  label: LocalizedText;
  description?: LocalizedText;
  placeholder?: LocalizedText;
  required: boolean;
  audience: QuestionAudience;
  visibleWhen?: ConditionGroup;
  requiredWhen?: ConditionGroup;
  config: QuestionConfig;
  validationMessage?: LocalizedText;
  print: { answerLines: number };
};

export type SectionBlock = {
  kind: 'section';
  id: string;
  title: LocalizedText;
  description?: LocalizedText;
  visibleWhen?: ConditionGroup;
};

export type DisplayBlock = {
  kind: 'heading' | 'paragraph' | 'image' | 'divider';
  id: string;
  text?: LocalizedText;
  // Image blocks: an https URL. Uploaded images are served through their
  // signed file URL and are resolved by the server for public payloads.
  imageUrl?: string;
  imageAlt?: LocalizedText;
  audience?: QuestionAudience;
};

export type FormItem = Question | SectionBlock | DisplayBlock;

export type PageJumpTarget = { pageId: string } | { endingId: string };

export type PageJump = {
  id: string;
  when: ConditionGroup;
  to: PageJumpTarget;
};

export type FormPage = {
  id: string;
  title: LocalizedText;
  description?: LocalizedText;
  items: FormItem[];
  jumps: PageJump[];
};

export type FormEnding = {
  id: string;
  when?: ConditionGroup;
  title: LocalizedText;
  message: LocalizedText;
};

export type CrmTarget = 'company' | 'person' | 'opportunity';

export type CrmTargetField =
  | 'company.name'
  | 'company.address'
  | 'company.domainName'
  | 'company.businessType'
  | 'company.employees'
  | 'person.name'
  | 'person.phone'
  | 'person.email'
  | 'person.jobTitle'
  | 'opportunity.name'
  | 'opportunity.interest'
  | 'opportunity.followUp';

export type CrmMappingRule = {
  id: string;
  questionId: string;
  field: CrmTargetField;
};

export type AutomationAction = 'CREATE_LEAD' | 'CREATE_TASK' | 'NOTIFY';

export type AutomationRule = {
  id: string;
  enabled: boolean;
  when?: ConditionGroup;
  action: AutomationAction;
  assigneeMemberId?: string;
  taskTitle?: string;
  dueInDays?: number;
};

export type FormAppearance = {
  accent: string;
  logoUrl?: string;
  showProgress: boolean;
  showQuestionNumbers: boolean;
};

export type FormWelcome = {
  enabled: boolean;
  title: LocalizedText;
  body: LocalizedText;
  buttonLabel?: LocalizedText;
};

export type FormPresentation = 'ALL_ON_PAGE' | 'ONE_QUESTION';

export type FormDefinition = {
  schemaVersion: 1;
  // First language is the default; every other language is optional per text.
  languages: FormLanguage[];
  presentation: FormPresentation;
  welcome: FormWelcome;
  pages: FormPage[];
  endings: FormEnding[];
  appearance: FormAppearance;
  print: { instructions: LocalizedText };
  crmMapping: CrmMappingRule[];
  automations: AutomationRule[];
};
