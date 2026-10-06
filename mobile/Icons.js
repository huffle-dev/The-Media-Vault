// The desktop top bar's icons, drawn from the same SVG paths
// (components/TopBar.jsx) so the two apps use identical glyphs. All share a
// 16x16 viewBox; `color` replaces the desktop's `currentColor`.
import Svg, { Circle, Path, Rect } from "react-native-svg";

const wrap = (children, size, color) => (
  <Svg width={size} height={size} viewBox="0 0 16 16" fill="none" color={color}>{children}</Svg>
);

// Stats — a pie with one slice filled.
export const StatsIcon = ({ size = 22, color = "#fff" }) => wrap(
  <>
    <Circle cx="8" cy="8" r="6.5" stroke={color} strokeWidth="1.3" />
    <Path d="M8 8 L8 1.5 A6.5 6.5 0 0 1 14.5 8 Z" fill={color} />
  </>, size, color,
);

// Discover — a compass.
export const DiscoverIcon = ({ size = 22, color = "#fff" }) => wrap(
  <>
    <Circle cx="8" cy="8" r="6.5" stroke={color} strokeWidth="1.3" />
    <Path d="M10.5 5.5 L9 9 L5.5 10.5 L7 7 Z" fill={color} />
  </>, size, color,
);

// Completed History — a clock.
export const HistoryIcon = ({ size = 22, color = "#fff" }) => wrap(
  <>
    <Path d="M8 3.5 V8 L11 10" stroke={color} strokeWidth="1.3" strokeLinecap="round" />
    <Circle cx="8" cy="8" r="6.5" stroke={color} strokeWidth="1.3" />
  </>, size, color,
);

// Filter — a funnel.
export const FilterIcon = ({ size = 14, color = "#fff" }) => wrap(
  <Path d="M2 3h12l-4.5 5.5v4l-3 1.5v-5.5L2 3z" fill={color} />, size, color,
);

// Sort — up and down arrows.
export const SortIcon = ({ size = 14, color = "#fff" }) => wrap(
  <>
    <Path d="M5 13 V3 M5 3 L2.5 5.5 M5 3 L7.5 5.5" stroke={color} strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    <Path d="M11 3 V13 M11 13 L8.5 10.5 M11 13 L13.5 10.5" stroke={color} strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
  </>, size, color,
);

// Library / tile view — the desktop's ⊞ glyph, as four squares in a frame.
export const GridIcon = ({ size = 22, color = "#fff" }) => wrap(
  <>
    <Rect x="1.75" y="1.75" width="12.5" height="12.5" rx="1.25" stroke={color} strokeWidth="1.3" />
    <Path d="M8 1.75 V14.25 M1.75 8 H14.25" stroke={color} strokeWidth="1.3" />
  </>, size, color,
);
