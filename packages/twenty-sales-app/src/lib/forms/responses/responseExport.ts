import {
  type FormDefinition,
  type Question,
  answerToText,
  buildQuestionIndex,
  listFormQuestions,
  pickLocalizedText,
} from '@shared/surveys';

import { type SurveyFormVersion, type SurveyResponse } from '../../../api/surveys';
import {
  COMPLETION_LABELS,
  REVIEW_LABELS,
  SOURCE_LABELS,
} from '../surveyStrings';
import { classifyAnswer } from './answerStatus';

export type ExportVersion = Pick<SurveyFormVersion, 'id' | 'formId' | 'versionNumber' | 'definition'>;

export type ExportTable = {
  headers: string[];
  rows: string[][];
};

export type QuestionColumn = {
  key: string;
  formId: string;
  questionId: string;
  header: string;
};

export const EXPORT_SKIPPED = '(رد شده)';

// Spreadsheet apps execute a cell that starts with = + - @ (and some treat a
// leading tab or CR the same way). Respondent text reaches staff machines
// through exports, so every such cell is neutralised with a leading quote.
export const guardCell = (value: string): string =>
  /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;

const METADATA_HEADERS = [
  'شناسه',
  'فرم',
  'نسخه',
  'منبع',
  'وضعیت تکمیل',
  'وضعیت بررسی',
  'تاریخ جمع‌آوری',
  'تاریخ ارسال',
  'تاریخ ورود',
  'جمع‌آوری‌کننده',
  'شهر',
  'ناحیه',
  'شرکت',
  'مخاطب',
  'سرنخ',
  'کمپاین',
  'شمارهٔ برگهٔ کاغذی',
];

const memberName = (member: { name: { firstName: string; lastName: string } } | null): string =>
  member === null ? '' : `${member.name.firstName} ${member.name.lastName}`.trim();

const metadataCells = (response: SurveyResponse): string[] => [
  response.id,
  response.form?.name ?? '',
  String(response.versionNumber ?? ''),
  SOURCE_LABELS[response.source] ?? response.source ?? '',
  COMPLETION_LABELS[response.completionStatus] ?? response.completionStatus ?? '',
  REVIEW_LABELS[response.reviewStatus] ?? response.reviewStatus ?? '',
  response.collectedAt ?? '',
  response.submittedAt ?? '',
  response.enteredAt ?? '',
  memberName(response.collector),
  response.city,
  response.area,
  response.company?.name ?? '',
  response.person === null ? '' : memberName(response.person),
  response.opportunity?.name ?? '',
  response.campaign?.name ?? '',
  response.paperReference,
];

const labelOf = (question: Question, definition: FormDefinition): string =>
  pickLocalizedText(question.label, definition.languages[0] ?? 'fa', definition.languages) ||
  question.id;

// One column per question across every version of the exported forms: ordered
// like the newest version, then questions that only older versions asked. The
// header is the label from the newest version that still has the question, so
// a renamed question keeps one column under its current name.
export const buildQuestionColumns = (
  versions: ExportVersion[],
  formNames: Map<string, string>,
): QuestionColumn[] => {
  const byForm = new Map<string, ExportVersion[]>();

  for (const version of versions) {
    byForm.set(version.formId, [...(byForm.get(version.formId) ?? []), version]);
  }

  const multipleForms = byForm.size > 1;
  const columns: QuestionColumn[] = [];

  for (const [formId, formVersions] of byForm) {
    const newestFirst = [...formVersions].sort((a, b) => b.versionNumber - a.versionNumber);
    const seen = new Set<string>();

    for (const version of newestFirst) {
      for (const { question } of listFormQuestions(version.definition)) {
        if (seen.has(question.id)) continue;
        seen.add(question.id);

        const label = labelOf(question, version.definition);

        columns.push({
          key: `${formId}:${question.id}`,
          formId,
          questionId: question.id,
          header: multipleForms ? `${formNames.get(formId) ?? formId} — ${label}` : label,
        });
      }
    }
  }

  return columns;
};

// Every value is rendered with the response's OWN version (its labels and
// choices), never the newest one.
export const buildExportTable = (
  responses: SurveyResponse[],
  versions: ExportVersion[],
  formNames: Map<string, string>,
): ExportTable => {
  const columns = buildQuestionColumns(versions, formNames);
  const versionsById = new Map(versions.map((version) => [version.id, version]));
  const indexes = new Map<string, Map<string, Question>>();
  const indexOf = (version: ExportVersion) => {
    let index = indexes.get(version.id);

    if (index === undefined) {
      index = buildQuestionIndex(version.definition);
      indexes.set(version.id, index);
    }

    return index;
  };

  const rows = responses.map((response) => {
    const version = versionsById.get(response.formVersionId);
    const questions = version === undefined ? new Map<string, Question>() : indexOf(version);
    const answerCells = columns.map((column) => {
      if (column.formId !== response.formId || version === undefined) return '';

      const question = questions.get(column.questionId);
      const status = classifyAnswer(question, response);

      if (status === 'skipped') return EXPORT_SKIPPED;
      if (status !== 'answered' || question === undefined) return '';

      return answerToText(question, response.answers[question.id], version.definition);
    });

    return [...metadataCells(response), ...answerCells].map(guardCell);
  });

  return {
    headers: [...METADATA_HEADERS, ...columns.map((column) => column.header)].map(guardCell),
    rows,
  };
};

const csvCell = (value: string): string =>
  /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;

// UTF-8 with a byte-order mark: without it Excel opens the file as ANSI and
// every Dari character turns into mojibake.
export const toCsv = (table: ExportTable): string =>
  `﻿${[table.headers, ...table.rows]
    .map((row) => row.map(csvCell).join(','))
    .join('\r\n')}\r\n`;

export const exportFileName = (base: string, extension: 'csv' | 'xlsx', now = new Date()): string => {
  const safe = base.replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'responses';
  const stamp = now.toISOString().slice(0, 10);

  return `${safe}-${stamp}.${extension}`;
};
