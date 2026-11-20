// Request bodies for account actions; each needs the current password.
import { z } from "zod";
import { email, newPassword } from "./auth.validator.js";

const currentPassword = z.string().min(1, "Enter your current password.").max(200);

export const changeEmailBody = z.object({ email, currentPassword });
export const changePasswordBody = z.object({ currentPassword, newPassword });
export const deleteAccountBody = z.object({ password: currentPassword });
