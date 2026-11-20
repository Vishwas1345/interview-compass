// Optimistic preview of a builder operation, so edits and reorders feel immediate
// (app spec). It mirrors the server's applyOp (api/src/kits/ops.js) closely enough
// to draw the change; the server's reply always replaces it. Operations the preview
// cannot predict (adding, changing days) return null and wait for the server.

export function localApply(doc, op) {
  if (!doc?.kit) return null;
  const next = structuredClone(doc);
  const { kit } = next;
  const question = (id) => kit.questions.find((q) => q.id === id);
  const card = (id) => kit.flashcards.find((f) => f.id === id);
  const markEdited = (item) => {
    if ((item.state ?? "generated") === "generated") item.state = "edited";
    else if (item.state === "pinned") item.state_before_pin = "edited";
  };
  const prune = () => {
    const present = new Set(kit.questions.map((q) => q.id));
    kit.schedule.days.forEach((d) => (d.question_ids = d.question_ids.filter((id) => present.has(id))));
  };

  switch (op.type) {
    case "updateQuestion":
    case "updateFlashcard": {
      const item = op.type === "updateQuestion" ? question(op.id) : card(op.id);
      if (!item) return null;
      if (Object.entries(op.fields).some(([k, v]) => JSON.stringify(item[k]) !== JSON.stringify(v))) {
        Object.assign(item, op.fields);
        markEdited(item);
      }
      return next;
    }
    case "updateBrief": {
      const brief = kit.company_brief;
      brief.field_state = { summary: "generated", what_they_do: "generated", ...brief.field_state };
      for (const [field, value] of Object.entries(op.fields)) {
        if (value === brief[field]) continue;
        brief[field] = value;
        if (brief.field_state[field] === "pinned") (brief.field_state_before_pin ??= {})[field] = "edited";
        else brief.field_state[field] = "edited";
      }
      return next;
    }
    case "deleteQuestion":
      kit.questions = kit.questions.filter((q) => q.id !== op.id);
      prune();
      next.scheduleStale = true;
      return next;
    case "deleteFlashcard":
      kit.flashcards = kit.flashcards.filter((f) => f.id !== op.id);
      return next;
    case "setPinned": {
      if (op.target === "brief") {
        const brief = kit.company_brief;
        brief.field_state = { summary: "generated", what_they_do: "generated", ...brief.field_state };
        brief.field_state_before_pin ??= {};
        if (op.pinned && brief.field_state[op.field] !== "pinned") {
          brief.field_state_before_pin[op.field] = brief.field_state[op.field];
          brief.field_state[op.field] = "pinned";
        } else if (!op.pinned && brief.field_state[op.field] === "pinned") {
          brief.field_state[op.field] = brief.field_state_before_pin[op.field] ?? "edited";
        }
        return next;
      }
      const item = op.target === "question" ? question(op.id) : card(op.id);
      if (!item) return null;
      // Same memory as the server: unpinning restores the state from before the pin.
      if (op.pinned && item.state !== "pinned") {
        item.state_before_pin = item.state ?? "generated";
        item.state = "pinned";
      } else if (!op.pinned && item.state === "pinned") {
        item.state = item.state_before_pin ?? "edited";
        delete item.state_before_pin;
      }
      return next;
    }
    case "moveQuestion": {
      const item = question(op.id);
      if (!item) return null;
      item.category = op.category;
      markEdited(item);
      kit.questions = [...kit.questions.filter((q) => q.id !== op.id), item];
      next.scheduleStale = true;
      return next;
    }
    case "reorder": {
      if (op.kind === "flashcards") {
        const byId = new Map(kit.flashcards.map((f) => [f.id, f]));
        kit.flashcards = op.ids.map((id) => byId.get(id)).filter(Boolean);
        return next;
      }
      const byId = new Map(kit.questions.filter((q) => q.category === op.category).map((q) => [q.id, q]));
      const order = op.ids.map((id) => byId.get(id));
      let i = 0;
      kit.questions = kit.questions.map((q) => (q.category === op.category ? order[i++] : q));
      return next;
    }
    default:
      return null;
  }
}

// Move one id up or down within a list of ids; returns the new list, or null at an edge.
export function moveInList(ids, id, delta) {
  const index = ids.indexOf(id);
  const target = index + delta;
  if (index < 0 || target < 0 || target >= ids.length) return null;
  const next = [...ids];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}
