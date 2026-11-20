// The user's photo, or their initials when there is none. ?v= changes whenever the
// photo does, so the browser never shows a stale cached image.
export function Avatar({ user, size = "h-8 w-8", text = "text-xs" }) {
  if (user?.photoVersion) {
    // eslint-disable-next-line @next/next/no-img-element -- a private, session-scoped image the optimizer cannot fetch
    return <img src={`/api/profile/photo?v=${user.photoVersion}`} alt="" className={`${size} shrink-0 rounded-full object-cover`} />;
  }
  return (
    <span aria-hidden="true" className={`${size} ${text} grid shrink-0 place-items-center rounded-full bg-accent-tint font-semibold text-accent`}>
      {initials(user)}
    </span>
  );
}

export function initials(user) {
  const source = user?.name?.trim() || user?.email?.split("@")[0] || "?";
  const parts = source.split(/[\s._-]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "?") + (parts.length > 1 ? parts.at(-1)[0] : "")).toUpperCase();
}
