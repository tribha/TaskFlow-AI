const iconPaths = {
  layoutDashboard: (
    <>
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.3" />
      <rect x="13.5" y="3.5" width="7" height="4" rx="1.3" />
      <rect x="13.5" y="9.5" width="7" height="11" rx="1.3" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.3" />
    </>
  ),
  listChecks: (
    <>
      <path d="m3 6 1.5 1.5L7 5" />
      <path d="M10 6h11" />
      <path d="m3 12 1.5 1.5L7 11" />
      <path d="M10 12h11" />
      <path d="m3 18 1.5 1.5L7 17" />
      <path d="M10 18h11" />
    </>
  ),
  mic: (
    <>
      <rect x="9" y="2.5" width="6" height="12" rx="3" />
      <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0" />
      <path d="M12 18v3.5M8.5 21.5h7" />
    </>
  ),
  calendarDays: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M7.5 2.5v5M16.5 2.5v5M3 9.5h18" />
      <path d="M7.5 13h.01M12 13h.01M16.5 13h.01M7.5 17h.01M12 17h.01" />
    </>
  ),
  chartNoAxesCombined: (
    <>
      <path d="M3 3v18h18" />
      <path d="M7 15v3M12 11v7M17 7v11" />
      <path d="m5.5 11 5-4 4 2 5-5" />
      <path d="M16.5 4H20v3.5" />
    </>
  ),
  settings2: (
    <>
      <path d="M4 6h16M4 18h16M4 12h16" />
      <circle cx="9" cy="6" r="2" fill="currentColor" stroke="none" />
      <circle cx="15" cy="12" r="2" fill="currentColor" stroke="none" />
      <circle cx="11" cy="18" r="2" fill="currentColor" stroke="none" />
    </>
  ),
  logOut: (
    <>
      <path d="M10 17l5-5-5-5M15 12H3" />
      <path d="M12 3h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-6" />
    </>
  ),
  userRound: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M5 21a7 7 0 0 1 14 0" />
    </>
  ),
  menu: (
    <>
      <path d="M4 6h16M4 12h16M4 18h16" />
    </>
  ),
  stop: <rect x="5" y="5" width="14" height="14" rx="2" />,
};

export default function Icon({ name, className, size = 20 }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      focusable="false"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {iconPaths[name]}
    </svg>
  );
}
