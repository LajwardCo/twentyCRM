import { type FormDefinition } from '../types/FormDefinition';
import { isItemAvailableTo } from './isItemAvailableTo';

// What the unauthenticated form endpoint returns. Staff-only questions, CRM
// pickers, CRM mapping and automations are removed here — on the server —
// rather than hidden in the browser. Conditions that still name a removed
// question evaluate it as unanswered, exactly as evaluateForm does for the
// PUBLIC audience, so client and server agree.
export const toPublicDefinition = (
  definition: FormDefinition,
): FormDefinition => ({
  ...definition,
  pages: definition.pages.map((page) => ({
    ...page,
    items: page.items.filter((item) => isItemAvailableTo(item, 'PUBLIC')),
    jumps: page.jumps.map((jump) => ({ ...jump })),
  })),
  endings: definition.endings.map((ending) => ({ ...ending })),
  crmMapping: [],
  automations: [],
});
