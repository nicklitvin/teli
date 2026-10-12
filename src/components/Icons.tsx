import type { SVGProps } from 'react';

type P = SVGProps<SVGSVGElement> & { size?: number };

function Svg({ size = 24, children, ...rest }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...rest}>
      {children}
    </svg>
  );
}

export const SparklesIcon = (p: P) => (
  <Svg {...p}>
    <path d="M12 3l1.9 4.6L18.5 9.5l-4.6 1.9L12 16l-1.9-4.6L5.5 9.5l4.6-1.9z" fill="currentColor" stroke="none" />
    <path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z" fill="currentColor" stroke="none" />
  </Svg>
);
export const SearchIcon = (p: P) => (
  <Svg {...p}><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></Svg>
);
export const ListIcon = (p: P) => (
  <Svg {...p}>
    <path d="M9 6h11M9 12h11M9 18h11" />
    <circle cx="4.5" cy="6" r="1.2" fill="currentColor" stroke="none" />
    <circle cx="4.5" cy="12" r="1.2" fill="currentColor" stroke="none" />
    <circle cx="4.5" cy="18" r="1.2" fill="currentColor" stroke="none" />
  </Svg>
);
export const PlusIcon = (p: P) => <Svg {...p}><path d="M12 5v14M5 12h14" /></Svg>;
export const CheckIcon = (p: P) => <Svg {...p}><path d="M5 12.5l4.5 4.5L19 7.5" /></Svg>;
export const XIcon = (p: P) => <Svg {...p}><path d="M6 6l12 12M18 6L6 18" /></Svg>;
export const ChevronLeft = (p: P) => <Svg {...p}><path d="M15 5l-7 7 7 7" /></Svg>;
export const ChevronRight = (p: P) => <Svg {...p}><path d="M9 5l7 7-7 7" /></Svg>;
export const ChevronDown = (p: P) => <Svg {...p}><path d="M5 9l7 7 7-7" /></Svg>;
export const UndoIcon = (p: P) => <Svg {...p}><path d="M9 14L4 9l5-5" /><path d="M4 9h10a6 6 0 010 12h-3" /></Svg>;
export const BookmarkIcon = ({ filled, ...p }: P & { filled?: boolean }) => (
  <Svg {...p}><path d="M6 4h12v17l-6-4-6 4z" fill={filled ? 'currentColor' : 'none'} /></Svg>
);
export const EyeSlashIcon = (p: P) => (
  <Svg {...p}>
    <path d="M3 3l18 18" />
    <path d="M10.6 5.1A10 10 0 0112 5c5 0 9 4.5 10 7a13 13 0 01-2.9 4M6.6 6.6C4.3 8 2.7 10.2 2 12c1 2.5 5 7 10 7a9.8 9.8 0 005.4-1.6" />
    <path d="M9.9 9.9a3 3 0 004.2 4.2" />
  </Svg>
);
export const TrashIcon = (p: P) => (
  <Svg {...p}><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></Svg>
);
export const StarIcon = (p: P) => (
  <Svg {...p}>
    <path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z" fill="currentColor" stroke="none" />
  </Svg>
);
export const ThumbIcon = ({ down, ...p }: P & { down?: boolean }) => (
  <Svg {...p} style={down ? { transform: 'scaleY(-1)' } : undefined}>
    <path d="M7 11v9H4v-9zM7 11l4-8a2.5 2.5 0 012.5 3L13 10h5.5a2 2 0 012 2.3l-1.2 6A2 2 0 0117.3 20H7" />
  </Svg>
);
export const MehIcon = (p: P) => (
  <Svg {...p}><circle cx="12" cy="12" r="9" /><path d="M8 15h8" /><circle cx="9" cy="10" r=".8" fill="currentColor" /><circle cx="15" cy="10" r=".8" fill="currentColor" /></Svg>
);
export const MapIcon = (p: P) => (
  <Svg {...p}>
    <path d="M7.5 7.5l3 8M9 6h6.5M16.5 8l-2.5 7.5" />
    <circle cx="6" cy="6" r="2.5" /><circle cx="18" cy="6.5" r="2" /><circle cx="12" cy="18" r="3" />
  </Svg>
);
export const UserIcon = (p: P) => (
  <Svg {...p}><circle cx="12" cy="8.5" r="3.5" /><path d="M5 20a7 7 0 0114 0" /></Svg>
);
export const DownloadIcon = (p: P) => <Svg {...p}><path d="M12 4v11M7 10.5l5 5 5-5M5 20h14" /></Svg>;
export const UploadIcon = (p: P) => <Svg {...p}><path d="M12 15.5V4M7 9l5-5 5 5M5 20h14" /></Svg>;
export const UsersIcon = (p: P) => (
  <Svg {...p}>
    <circle cx="9" cy="8.5" r="3.2" /><path d="M3 19.5a6 6 0 0112 0" />
    <path d="M15.5 5.6a3.2 3.2 0 010 5.8M17.5 14a6 6 0 013.5 5.5" />
  </Svg>
);
export const RocketIcon = (p: P) => (
  <Svg {...p}>
    <path d="M14.5 4.5c2.6-1.4 5-1.6 6-1.5.1 1 0 3.4-1.5 6l-6.3 6.3-4.5-4.5z" />
    <path d="M8.6 10.4L5 10l2.6-3.1 3.6.4M13.6 15.4l.4 3.6 3.1-2.6-.4-3.6" />
    <path d="M6.5 16.5c-1.2.2-2.4 1.9-2.5 3.5 1.6-.1 3.3-1.3 3.5-2.5" />
    <circle cx="15.8" cy="8.2" r="1.4" />
  </Svg>
);
export const PlanetIcon = (p: P) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="6" />
    <path d="M17.6 8.6c2.9-1.3 4.8-1.5 5.2-.8.7 1.3-3.6 4.9-9.6 8.1s-11.3 4.8-12 3.5c-.4-.7.9-2.2 3.4-4.1" />
  </Svg>
);
export const OrbitIcon = (p: P) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="2.6" fill="currentColor" stroke="none" />
    <ellipse cx="12" cy="12" rx="9.5" ry="4.2" transform="rotate(-30 12 12)" />
    <circle cx="19.6" cy="6.9" r="1.7" fill="currentColor" stroke="none" />
  </Svg>
);
export const BookIcon = (p: P) => (
  <Svg {...p}>
    <path d="M5 18.5V6a2 2 0 012-2h12v13H7.2A2.2 2.2 0 005 19.2 1.8 1.8 0 006.8 21H19" />
    <path d="M9 8.5h6" />
  </Svg>
);
export const GearIcon = (p: P) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z" />
  </Svg>
);
export const FilterIcon = (p: P) => <Svg {...p}><path d="M4 6h16M7 12h10M10 18h4" /></Svg>;
