// Request bodies for sign-up and sign-in.
import { z } from "zod";

export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 200; // scrypt cost grows with input; a cap stops oversized inputs

export const email = z.string().trim().toLowerCase().pipe(z.email("Enter a valid email address.").max(254));
export const newPassword = z.string().min(PASSWORD_MIN, `Password must be at least ${PASSWORD_MIN} characters.`).max(PASSWORD_MAX, "Password is too long.");

export const loginBody = z.object({ email, password: z.string().max(PASSWORD_MAX, "Password is too long.") });
export const registerBody = z.object({ email, password: newPassword });
