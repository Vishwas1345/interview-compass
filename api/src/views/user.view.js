// What the browser learns about the signed-in user: enough for the sidebar
// (name, job title, whether there is a photo), never the password hash or files.
export function publicUser(user) {
  return {
    id: String(user._id),
    email: user.email,
    createdAt: user.createdAt,
    name: user.profile?.name ?? "",
    jobTitle: user.profile?.jobTitle ?? "",
    photoVersion: user.photo ? new Date(user.photo.updatedAt).getTime() : null, // busts the image cache on change
    signInMethod: user.googleId ? "google" : "password", // the profile page offers what fits (D22)
  };
}

// The profile page's view: every field, plus file metadata (not the bytes).
export function profileView(user) {
  const p = user.profile ?? {};
  return {
    email: user.email,
    name: p.name ?? "",
    jobTitle: p.jobTitle ?? "",
    phone: p.phone ?? "",
    location: p.location ?? "",
    linkedin: p.linkedin ?? "",
    website: p.website ?? "",
    bio: p.bio ?? "",
    photo: user.photo ? { contentType: user.photo.contentType, size: user.photo.size, updatedAt: user.photo.updatedAt } : null,
    resume: user.resume ? { filename: user.resume.filename, size: user.resume.size, uploadedAt: user.resume.uploadedAt } : null,
    user: publicUser(user),
  };
}
