// The profile details form: every field optional, bounded, and links limited to
// http(s) so they are always safe to open.
import { z } from "zod";

const text = (max, label) => z.string().trim().max(max, `${label} can be at most ${max} characters.`);
const link = z
  .string()
  .trim()
  .max(300, "Links can be at most 300 characters.")
  .refine((v) => v === "" || isWebAddress(v), "Enter a full web address starting with http:// or https://.");

export const profileDetailsBody = z
  .object({
    name: text(80, "Name"),
    jobTitle: text(100, "Job title"),
    phone: text(30, "Phone").refine((v) => /^[0-9+().\-\s]*$/.test(v), "Use digits, spaces and + ( ) - . only."),
    location: text(100, "Location"),
    linkedin: link,
    website: link,
    bio: text(500, "Bio"),
  })
  .partial()
  .strict();

function isWebAddress(value) {
  try {
    const url = new URL(value);
    return (url.protocol === "http:" || url.protocol === "https:") && Boolean(url.hostname);
  } catch {
    return false;
  }
}
