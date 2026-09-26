import { type FormDefinition, type Question } from '../types/FormDefinition';

export type ListedQuestion = {
  question: Question;
  pageId: string;
  pageIndex: number;
  itemIndex: number;
  // Nearest preceding section on the same page, if any.
  sectionId: string | null;
};

export const listFormQuestions = (
  definition: FormDefinition,
): ListedQuestion[] => {
  const listed: ListedQuestion[] = [];

  definition.pages.forEach((page, pageIndex) => {
    let sectionId: string | null = null;

    page.items.forEach((item, itemIndex) => {
      if (item.kind === 'section') {
        sectionId = item.id;

        return;
      }

      if (item.kind === 'question') {
        listed.push({
          question: item,
          pageId: page.id,
          pageIndex,
          itemIndex,
          sectionId,
        });
      }
    });
  });

  return listed;
};
