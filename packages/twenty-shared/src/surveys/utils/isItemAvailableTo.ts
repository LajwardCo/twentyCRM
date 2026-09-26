import { STAFF_ONLY_QUESTION_TYPES } from '../constants/STAFF_ONLY_QUESTION_TYPES';
import { type FormAudience, type FormItem } from '../types/FormDefinition';

// Staff see everything. The public never sees staff-only items or CRM
// pickers, whatever the item's own audience flag says.
export const isItemAvailableTo = (
  item: FormItem,
  audience: FormAudience,
): boolean => {
  if (audience === 'STAFF') {
    return true;
  }

  if (item.kind === 'question') {
    return (
      item.audience !== 'STAFF_ONLY' &&
      !STAFF_ONLY_QUESTION_TYPES.has(item.type)
    );
  }

  if (item.kind === 'section') {
    return true;
  }

  return item.audience !== 'STAFF_ONLY';
};
