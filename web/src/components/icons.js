// A few inline SVG icons (stroke style, 24px grid). Decorative by default: the
// control that holds an icon carries the accessible name.

function Icon({ children, className = "h-4 w-4", ...props }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className} {...props}>
      {children}
    </svg>
  );
}

export const IconKits = (p) => <Icon {...p}><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></Icon>;
export const IconPlus = (p) => <Icon {...p}><path d="M12 5v14M5 12h14" /></Icon>;
export const IconQuestions = (p) => <Icon {...p}><circle cx="12" cy="12" r="9" /><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .9-1 1.7M12 17h.01" /></Icon>;
export const IconTarget = (p) => <Icon {...p}><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1" /></Icon>;
export const IconCards = (p) => <Icon {...p}><rect x="3" y="6" width="14" height="14" rx="2" /><path d="M7 3h12a2 2 0 0 1 2 2v12" /></Icon>;
export const IconCalendar = (p) => <Icon {...p}><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18" /></Icon>;
export const IconBuilding = (p) => <Icon {...p}><path d="M4 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16M16 9h2a2 2 0 0 1 2 2v10M8 7h4M8 11h4M8 15h4M2 21h20" /></Icon>;
export const IconSearch = (p) => <Icon {...p}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></Icon>;
export const IconPlay = (p) => <Icon {...p}><path d="M7 4v16l13-8z" /></Icon>;
export const IconArrowUp = (p) => <Icon {...p}><path d="M12 19V5M5 12l7-7 7 7" /></Icon>;
export const IconArrowDown = (p) => <Icon {...p}><path d="M12 5v14M19 12l-7 7-7-7" /></Icon>;
export const IconPin = (p) => <Icon {...p}><path d="M12 17v5M9 3h6l-1 6 3 3v2H7v-2l3-3z" /></Icon>;
export const IconTrash = (p) => <Icon {...p}><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></Icon>;
export const IconRefresh = (p) => <Icon {...p}><path d="M20 11a8 8 0 0 0-14.9-3M4 4v4h4M4 13a8 8 0 0 0 14.9 3M20 20v-4h-4" /></Icon>;
export const IconMenu = (p) => <Icon {...p}><path d="M4 6h16M4 12h16M4 18h16" /></Icon>;
export const IconClose = (p) => <Icon {...p}><path d="M6 6l12 12M18 6 6 18" /></Icon>;
export const IconLogOut = (p) => <Icon {...p}><path d="M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M10 17l5-5-5-5M15 12H3" /></Icon>;
export const IconCheck = (p) => <Icon {...p}><path d="m5 12 5 5L20 7" /></Icon>;
export const IconSparkles = (p) => <Icon {...p}><path d="M12 3l1.8 4.6L18 9.5l-4.2 1.9L12 16l-1.8-4.6L6 9.5l4.2-1.9zM19 15l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z" /></Icon>;
export const IconChevronDown = (p) => <Icon {...p}><path d="m6 9 6 6 6-6" /></Icon>;
export const IconFileText = (p) => <Icon {...p}><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5M9 13h6M9 17h6M9 9h2" /></Icon>;
