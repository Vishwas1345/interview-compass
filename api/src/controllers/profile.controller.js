// Profile details and files. Every handler acts on req.user, so there is no id to
// guess: a user can only ever reach their own files (D16).
import { profileDetailsBody } from "../validators/profile.validator.js";
import { profileView } from "../views/user.view.js";

// How each file is sent back: always with the detected type and nosniff; the
// résumé as a download, sandboxed if opened anyway.
const DOWNLOAD_HEADERS = {
  photo: () => ({}),
  resume: (file) => ({
    "Content-Disposition": `attachment; filename="resume.pdf"; filename*=UTF-8''${encodeRfc5987(file.filename)}`,
    "Content-Security-Policy": "sandbox",
  }),
};

// encodeURIComponent leaves ' ( ) * unencoded; RFC 5987 (filename*) needs them
// encoded, or strict browsers ignore the name (review C9).
function encodeRfc5987(value) {
  return encodeURIComponent(value).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

export function createProfileController({ profile }) {
  return {
    show(req, res) {
      res.json({ profile: profileView(req.user) });
    },
    async update(req, res) {
      const user = await profile.updateDetails(req.user._id, profileDetailsBody.parse(req.body ?? {}));
      res.json({ profile: profileView(user) });
    },
    upload: (field) => async (req, res) => {
      const user = await profile.uploadFile(req.user._id, field, req.body, { filename: req.headers["x-filename"] });
      res.json({ profile: profileView(user) });
    },
    download: (field) => async (req, res) => {
      const file = await profile.readFile(req.user._id, field);
      res.set({
        "Content-Type": file.contentType,
        "Content-Length": String(file.bytes.length),
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-cache",
        ...DOWNLOAD_HEADERS[field](file),
      });
      res.end(file.bytes);
    },
    remove: (field) => async (req, res) => {
      const user = await profile.removeFile(req.user._id, field);
      res.json({ profile: profileView(user) });
    },
  };
}
