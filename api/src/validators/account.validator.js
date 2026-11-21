// Request bodies for account actions. Each needs the current password, except that
// deleting a Google account (no password, D22) is confirmed by typing its email.
import { z } from "zod";
import { email, newPassword } from "./auth.validator.js";

const currentPassword = z.string().min(1, "Enter your current password.").max(200);

export const changeEmailBody = z.object({ email, currentPassword });
export const changePasswordBody = z.object({ currentPassword, newPassword });
export const deleteAccountBody = z.object({ password: z.string().max(200).optional(), confirmEmail: z.string().max(254).optional() });
