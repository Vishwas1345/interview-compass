import Link from "next/link";

// The wordmark: typographic, no logo tile.
export function Brand({ href = "/", className = "" }) {
  return (
    <Link href={href} className={`font-display text-[21px] leading-none text-ink ${className}`} aria-label="InterviewCompass home">
      Interview<span className="italic text-accent">Compass</span>
    </Link>
  );
}
