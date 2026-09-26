import { type FormDefinition } from '../types/FormDefinition';
import { isItemAvailableTo } from './isItemAvailableTo';

// What the unauthenticated form endpoint returns. Staff-only questions, CRM
// pickers, CRM mapping and automations are removed here — on the server —
// rather than hidden in the browser. The result is rebuilt from the known
// schema fields only, so anything else stored in a definition never reaches
// a respondent. Publishing refuses public logic that depends on staff-only
// questions, so no remaining condition refers to a removed one.
export const toPublicDefinition = (
  definition: FormDefinition,
): FormDefinition => ({
  schemaVersion: definition.schemaVersion,
  languages: definition.languages,
  presentation: definition.presentation,
  welcome: definition.welcome,
  pages: definition.pages.map((page) => ({
    id: page.id,
    title: page.title,
    description: page.description,
    items: page.items.filter((item) => isItemAvailableTo(item, 'PUBLIC')),
    jumps: page.jumps.map((jump) => ({
      id: jump.id,
      when: jump.when,
      to: jump.to,
    })),
  })),
  endings: definition.endings.map((ending) => ({
    id: ending.id,
    when: ending.when,
    title: ending.title,
    message: ending.message,
  })),
  appearance: definition.appearance,
  print: definition.print,
  crmMapping: [],
  automations: [],
});
