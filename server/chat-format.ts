import { chatCopy } from "../shared/content.js";
import {
  formatDate,
  nextSteps,
  templateById,
  type Deadline,
  type User,
} from "../shared/domain.js";

// Formatting only; editable text and catalog entries live in shared/content.ts.
export function statusText(user: User) {
  return chatCopy.status(
    user.settings.enabled,
    user.settings.hour,
    user.settings.timezone,
    user.settings.privateMessages,
  );
}

export function eventDetails(event: Deadline) {
  const template = templateById[event.templateId];
  return chatCopy.details(
    event.title,
    formatDate(event.dueDate),
    event.completed,
    template.rule,
    nextSteps({ ...event, notes: event.notes.slice(0, 1000) })
      .map((step, i) => `${i + 1}. ${step}`)
      .join("\n"),
    "scope" in template ? template.scope : "",
    "source" in template ? template.source : "",
    template.link,
  );
}
