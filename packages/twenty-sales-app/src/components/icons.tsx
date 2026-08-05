type IconProps = {
  size?: number;
};

const base = (size?: number) => ({
  width: size ?? 22,
  height: size ?? 22,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
});

export const IconToday = ({ size }: IconProps) => (
  <svg {...base(size)}>
    <rect x="3" y="4" width="18" height="18" rx="2" />
    <line x1="16" y1="2" x2="16" y2="6" />
    <line x1="8" y1="2" x2="8" y2="6" />
    <line x1="3" y1="10" x2="21" y2="10" />
    <path d="m9 15 2 2 4-4" />
  </svg>
);

export const IconLeads = ({ size }: IconProps) => (
  <svg {...base(size)}>
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);

export const IconMenu = ({ size }: IconProps) => (
  <svg {...base(size)}>
    <line x1="4" y1="7" x2="20" y2="7" />
    <line x1="4" y1="12" x2="20" y2="12" />
    <line x1="4" y1="17" x2="20" y2="17" />
  </svg>
);

export const IconPlus = ({ size }: IconProps) => (
  <svg {...base(size)}>
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

export const IconPhone = ({ size }: IconProps) => (
  <svg {...base(size)}>
    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
  </svg>
);

export const IconMail = ({ size }: IconProps) => (
  <svg {...base(size)}>
    <rect x="2" y="4" width="20" height="16" rx="2" />
    <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
  </svg>
);

export const IconSms = ({ size }: IconProps) => (
  <svg {...base(size)}>
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    <line x1="8" y1="9" x2="16" y2="9" />
    <line x1="8" y1="13" x2="13" y2="13" />
  </svg>
);

export const IconWhatsApp = ({ size }: IconProps) => (
  <svg {...base(size)}>
    <path d="M3 21l1.65-3.8a9 9 0 1 1 3.4 2.9L3 21" />
    <path d="M9 10a.5.5 0 0 0 1 0V9a.5.5 0 0 0-1 0v1a5 5 0 0 0 5 5h1a.5.5 0 0 0 0-1h-1a.5.5 0 0 0 0 1" />
  </svg>
);

export const IconAI = ({ size }: IconProps) => (
  <svg {...base(size)}>
    <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" />
    <path d="M19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9z" />
  </svg>
);

export const IconBack = ({ size }: IconProps) => (
  <svg {...base(size)}>
    <path d="m15 18-6-6 6-6" />
  </svg>
);

export const IconCheck = ({ size }: IconProps) => (
  <svg {...base(size)}>
    <path d="M20 6 9 17l-5-5" />
  </svg>
);

export const IconNote = ({ size }: IconProps) => (
  <svg {...base(size)}>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <path d="M14 2v6h6" />
    <line x1="8" y1="13" x2="16" y2="13" />
    <line x1="8" y1="17" x2="13" y2="17" />
  </svg>
);

export const IconSend = ({ size }: IconProps) => (
  <svg {...base(size)}>
    <path d="m22 2-7 20-4-9-9-4z" />
    <path d="M22 2 11 13" />
  </svg>
);

export const IconLogout = ({ size }: IconProps) => (
  <svg {...base(size)}>
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <path d="m16 17 5-5-5-5" />
    <line x1="21" y1="12" x2="9" y2="12" />
  </svg>
);

export const IconScript = ({ size }: IconProps) => (
  <svg {...base(size)}>
    <path d="M4 22h14a2 2 0 0 0 2-2V7l-5-5H6a2 2 0 0 0-2 2v4" />
    <path d="M14 2v4a2 2 0 0 0 2 2h4" />
    <path d="m5 12-3 3 3 3" />
    <path d="m9 18 3-3-3-3" />
  </svg>
);

export const IconSummary = ({ size }: IconProps) => (
  <svg {...base(size)}>
    <line x1="21" y1="6" x2="3" y2="6" />
    <line x1="17" y1="12" x2="3" y2="12" />
    <line x1="13" y1="18" x2="3" y2="18" />
  </svg>
);

export const IconDashboard = ({ size }: IconProps) => (
  <svg {...base(size)}>
    <rect x="3" y="3" width="7" height="9" rx="1.5" />
    <rect x="14" y="3" width="7" height="5" rx="1.5" />
    <rect x="14" y="12" width="7" height="9" rx="1.5" />
    <rect x="3" y="16" width="7" height="5" rx="1.5" />
  </svg>
);

export const IconTasks = ({ size }: IconProps) => (
  <svg {...base(size)}>
    <path d="M9 11l3 3 8-8" />
    <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
  </svg>
);

export const IconBell = ({ size }: IconProps) => (
  <svg {...base(size)}>
    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
  </svg>
);

export const IconSearch = ({ size }: IconProps) => (
  <svg {...base(size)}>
    <circle cx="11" cy="11" r="7" />
    <path d="m21 21-4-4" />
  </svg>
);

export const IconTable = ({ size }: IconProps) => (
  <svg {...base(size)}>
    <line x1="3" y1="7" x2="21" y2="7" />
    <line x1="3" y1="12" x2="21" y2="12" />
    <line x1="3" y1="17" x2="21" y2="17" />
  </svg>
);

export const IconKanban = ({ size }: IconProps) => (
  <svg {...base(size)}>
    <rect x="3" y="3" width="5" height="18" rx="1.5" />
    <rect x="10" y="3" width="5" height="12" rx="1.5" />
    <rect x="17" y="3" width="5" height="8" rx="1.5" />
  </svg>
);

export const IconFlame = ({ size }: IconProps) => (
  <svg {...base(size)}>
    <path d="M12 2c1 4-1 5-2 7 2-1 3 0 3 2 0 1.5-1 3-3 3 4 1 8-1 8-6 0-2-1-4-2-5 0 2-1 3-2 3 1-2 0-3-2-4z" />
  </svg>
);

export const IconClock = ({ size }: IconProps) => (
  <svg {...base(size)}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 3" />
  </svg>
);

export const IconMoney = ({ size }: IconProps) => (
  <svg {...base(size)}>
    <line x1="12" y1="1" x2="12" y2="23" />
    <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
  </svg>
);

export const IconPresentation = ({ size }: IconProps) => (
  <svg {...base(size)}>
    <path d="M2 3h20" />
    <path d="M21 3v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V3" />
    <path d="m7 21 5-5 5 5" />
  </svg>
);

export const IconMapPin = ({ size }: IconProps) => (
  <svg {...base(size)}>
    <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z" />
    <circle cx="12" cy="10" r="3" />
  </svg>
);

export const IconMic = ({ size }: IconProps) => (
  <svg {...base(size)}>
    <rect x="9" y="2" width="6" height="12" rx="3" />
    <path d="M5 10a7 7 0 0 0 14 0" />
    <line x1="12" y1="19" x2="12" y2="22" />
  </svg>
);

export const IconMoon = ({ size }: IconProps) => (
  <svg {...base(size)}>
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
  </svg>
);

export const IconSun = ({ size }: IconProps) => (
  <svg {...base(size)}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
  </svg>
);

export const IconEdit = ({ size }: IconProps) => (
  <svg {...base(size)}>
    <path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z" />
  </svg>
);

export const IconChart = ({ size }: IconProps) => (
  <svg {...base(size)}>
    <line x1="18" y1="20" x2="18" y2="10" />
    <line x1="12" y1="20" x2="12" y2="4" />
    <line x1="6" y1="20" x2="6" y2="14" />
    <line x1="3" y1="20" x2="21" y2="20" />
  </svg>
);

export const IconBuilding = ({ size }: IconProps) => (
  <svg {...base(size)}>
    <rect x="4" y="2" width="16" height="20" rx="2" />
    <line x1="9" y1="7" x2="10" y2="7" />
    <line x1="14" y1="7" x2="15" y2="7" />
    <line x1="9" y1="11" x2="10" y2="11" />
    <line x1="14" y1="11" x2="15" y2="11" />
    <path d="M9 22v-4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v4" />
  </svg>
);

export const IconPackage = ({ size }: IconProps) => (
  <svg {...base(size)}>
    <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
    <path d="M3.3 7 12 12l8.7-5" />
    <line x1="12" y1="22" x2="12" y2="12" />
  </svg>
);

export const IconChevronDown = ({ size }: IconProps) => (
  <svg {...base(size)}>
    <path d="m6 9 6 6 6-6" />
  </svg>
);

export const IconChevronLeft = ({ size }: IconProps) => (
  <svg {...base(size)}>
    <path d="m15 18-6-6 6-6" />
  </svg>
);

export const IconChevronRight = ({ size }: IconProps) => (
  <svg {...base(size)}>
    <path d="m9 18 6-6-6-6" />
  </svg>
);

export const IconCalendar = ({ size }: IconProps) => (
  <svg {...base(size)}>
    <rect x="3" y="4" width="18" height="18" rx="2" />
    <line x1="16" y1="2" x2="16" y2="6" />
    <line x1="8" y1="2" x2="8" y2="6" />
    <line x1="3" y1="10" x2="21" y2="10" />
    <line x1="7" y1="14" x2="7.01" y2="14" />
    <line x1="12" y1="14" x2="12.01" y2="14" />
    <line x1="17" y1="14" x2="17.01" y2="14" />
    <line x1="7" y1="18" x2="7.01" y2="18" />
    <line x1="12" y1="18" x2="12.01" y2="18" />
  </svg>
);

export const IconDailyReport = ({ size }: IconProps) => (
  <svg {...base(size)}>
    <rect x="3" y="4" width="18" height="18" rx="2" />
    <line x1="8" y1="2" x2="8" y2="6" />
    <line x1="16" y1="2" x2="16" y2="6" />
    <line x1="3" y1="10" x2="21" y2="10" />
    <line x1="7" y1="14" x2="17" y2="14" />
    <line x1="7" y1="18" x2="13" y2="18" />
  </svg>
);

export const IconX = ({ size }: IconProps) => (
  <svg {...base(size)}>
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

export const IconRefresh = ({ size }: IconProps) => (
  <svg {...base(size)}>
    <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
    <path d="M21 3v5h-5" />
    <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
    <path d="M3 21v-5h5" />
  </svg>
);

export const IconQr = ({ size }: IconProps) => (
  <svg {...base(size)}>
    <rect x="3" y="3" width="7" height="7" rx="1" />
    <rect x="14" y="3" width="7" height="7" rx="1" />
    <rect x="3" y="14" width="7" height="7" rx="1" />
    <line x1="14" y1="14" x2="14" y2="17" />
    <line x1="14" y1="21" x2="17" y2="21" />
    <line x1="21" y1="14" x2="21" y2="21" />
    <line x1="17" y1="17" x2="21" y2="17" />
  </svg>
);

export const IconTrash = ({ size }: IconProps) => (
  <svg {...base(size)}>
    <path d="M3 6h18" />
    <path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
    <line x1="10" y1="11" x2="10" y2="17" />
    <line x1="14" y1="11" x2="14" y2="17" />
  </svg>
);

export const IconFilter = ({ size }: IconProps) => (
  <svg {...base(size)}>
    <path d="M3 5h18l-7 8v6l-4 2v-8Z" />
  </svg>
);

export const IconClose = ({ size }: IconProps) => (
  <svg {...base(size)}>
    <path d="m6 6 12 12M18 6 6 18" />
  </svg>
);

export const IconContacts = ({ size }: IconProps) => (
  <svg {...base(size)}>
    <path d="M16 20v-1.5a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4V20" />
    <circle cx="9.5" cy="7.5" r="3.5" />
    <path d="M17 4.5a3.5 3.5 0 0 1 0 6.8M21 20v-1.5a4 4 0 0 0-3-3.8" />
  </svg>
);
