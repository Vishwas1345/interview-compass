// Kits over HTTP: validate the body, call the kit service, send a view.
import { coachBody, createKitBody, operationBody, practiceBody, regenerateBody } from "../validators/kit.validator.js";
import { kitSummary, kitView } from "../views/kit.view.js";

// Errors from the service may carry the kit they are about (error.doc); it leaves
// the server only as a view, never as the raw document.
async function presenting(handler) {
  try {
    return await handler();
  } catch (error) {
    if (error.doc !== undefined) {
      if (error.code === "VERSION_CONFLICT") error.extra = { ...error.extra, kit: kitView(error.doc) };
      else error.extra = { ...error.extra, existing: error.doc ? kitSummary(error.doc) : null };
      delete error.doc;
    }
    throw error;
  }
}

export function createKitController({ kits }) {
  return {
    async list(req, res) {
      res.json({ kits: (await kits.list(req.user._id)).map(kitSummary) });
    },
    create: (req, res) =>
      presenting(async () => {
        const { doc, joined } = await kits.create(req.user._id, createKitBody.parse(req.body ?? {}));
        if (joined) return res.status(200).json({ kit: kitView(doc), joined: true });
        res.status(202).json({ kit: kitView(doc) });
      }),
    async show(req, res) {
      res.json({ kit: kitView(await kits.get(req.user._id, req.params.id)) });
    },
    async remove(req, res) {
      await kits.remove(req.user._id, req.params.id);
      res.status(204).end();
    },
    resume: (req, res) =>
      presenting(async () => {
        const { doc, started } = await kits.resume(req.user._id, req.params.id);
        res.status(started ? 202 : 200).json({ kit: kitView(doc) });
      }),
    applyOperation: (req, res) =>
      presenting(async () => {
        const doc = await kits.applyOperation(req.user._id, req.params.id, operationBody.parse(req.body ?? {}));
        res.json({ kit: kitView(doc) });
      }),
    async regenerate(req, res) {
      const doc = await kits.requestRegeneration(req.user._id, req.params.id, regenerateBody.parse(req.body ?? {}));
      res.status(202).json({ kit: kitView(doc) });
    },
    async practice(req, res) {
      const body = practiceBody.parse(req.body ?? {});
      res.json({ itemId: body.itemId, entry: await kits.recordPractice(req.user._id, req.params.id, body) });
    },
    async coach(req, res) {
      const body = coachBody.parse(req.body ?? {});
      res.json({ itemId: body.itemId, feedback: await kits.coach(req.user._id, req.params.id, body) });
    },
  };
}
