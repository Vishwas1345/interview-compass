// Account actions (profile spec): each checks the current password in the service.
import { changeEmailBody, changePasswordBody, deleteAccountBody } from "../validators/account.validator.js";
import { publicUser } from "../views/user.view.js";
import { SESSION_COOKIE } from "../services/session.service.js";
import { sessionCookieOptions } from "../utils/cookies.js";

export function createAccountController({ account, production }) {
  return {
    async changeEmail(req, res) {
      const user = await account.changeEmail(req.user, changeEmailBody.parse(req.body ?? {}));
      res.json({ user: publicUser(user) });
    },
    async changePassword(req, res) {
      await account.changePassword(req.user, req.sessionToken, changePasswordBody.parse(req.body ?? {}));
      res.status(204).end();
    },
    async deleteAccount(req, res) {
      await account.deleteAccount(req.user, deleteAccountBody.parse(req.body ?? {}));
      res.clearCookie(SESSION_COOKIE, sessionCookieOptions({ production }));
      res.status(204).end();
    },
  };
}
