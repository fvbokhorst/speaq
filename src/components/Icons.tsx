/**
 * SPEAQ Icons - Minimal, professional SVG icons
 * Brand: Voice Gold active, Shield Steel inactive
 * Style: Thin stroke, no fill, clean lines
 */

import React from "react";
import Svg, { Path, Circle, Rect } from "react-native-svg";
import { colors } from "../theme/brand";

interface IconProps {
  size?: number;
  color?: string;
  active?: boolean;
}

function getColor(props: IconProps): string {
  if (props.color) return props.color;
  return props.active ? colors.voice.gold : colors.signal.steel;
}

export function ChatIcon(props: IconProps) {
  const s = props.size || 22;
  const c = getColor(props);
  return (
    <Svg width={s} height={s} viewBox="0 0 24 24" fill="none">
      <Path
        d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"
        stroke={c}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function ContactIcon(props: IconProps) {
  const s = props.size || 22;
  const c = getColor(props);
  return (
    <Svg width={s} height={s} viewBox="0 0 24 24" fill="none">
      <Path
        d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"
        stroke={c}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Circle
        cx={12}
        cy={7}
        r={4}
        stroke={c}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function WalletIcon(props: IconProps) {
  const s = props.size || 22;
  const c = getColor(props);
  return (
    <Svg width={s} height={s} viewBox="0 0 24 24" fill="none">
      <Rect
        x={2}
        y={4}
        width={20}
        height={16}
        rx={2}
        stroke={c}
        strokeWidth={1.5}
      />
      <Path
        d="M22 10H16a2 2 0 0 0 0 4h6"
        stroke={c}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Circle cx={16} cy={12} r={1} fill={c} />
    </Svg>
  );
}

export function MiningIcon(props: IconProps) {
  const s = props.size || 22;
  const c = getColor(props);
  return (
    <Svg width={s} height={s} viewBox="0 0 24 24" fill="none">
      <Path
        d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"
        stroke={c}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path d="M14 2v6h6" stroke={c} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M12 18L12 12" stroke={c} strokeWidth={1.5} strokeLinecap="round" />
      <Path d="M9 15L15 15" stroke={c} strokeWidth={1.5} strokeLinecap="round" />
    </Svg>
  );
}

export function SettingsIcon(props: IconProps) {
  const s = props.size || 22;
  const c = getColor(props);
  return (
    <Svg width={s} height={s} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={3} stroke={c} strokeWidth={1.5} />
      <Path
        d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"
        stroke={c}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

interface ToggleIconProps extends IconProps {
  off?: boolean;
}

export function MicIcon(props: ToggleIconProps) {
  const s = props.size || 24;
  const c = getColor(props);
  return (
    <Svg width={s} height={s} viewBox="0 0 24 24" fill="none">
      <Path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" stroke={c} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M19 11v1a7 7 0 0 1-14 0v-1" stroke={c} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M12 19v3" stroke={c} strokeWidth={1.5} strokeLinecap="round" />
      {props.off && (
        <Path d="M3 3l18 18" stroke={c} strokeWidth={1.8} strokeLinecap="round" />
      )}
    </Svg>
  );
}

export function VideoIcon(props: ToggleIconProps) {
  const s = props.size || 24;
  const c = getColor(props);
  return (
    <Svg width={s} height={s} viewBox="0 0 24 24" fill="none">
      <Rect x="2" y="6" width="14" height="12" rx="2" stroke={c} strokeWidth={1.5} />
      <Path d="M16 10l5-3v10l-5-3z" stroke={c} strokeWidth={1.5} strokeLinejoin="round" />
      {props.off && (
        <Path d="M3 3l18 18" stroke={c} strokeWidth={1.8} strokeLinecap="round" />
      )}
    </Svg>
  );
}

export function FlipCameraIcon(props: IconProps) {
  const s = props.size || 24;
  const c = getColor(props);
  return (
    <Svg width={s} height={s} viewBox="0 0 24 24" fill="none">
      <Path d="M14 7h4a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h2" stroke={c} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M9 7l1.5-2h3L15 7" stroke={c} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M9 13a3 3 0 0 1 5.2-2M15 15a3 3 0 0 1-5.2 2" stroke={c} strokeWidth={1.5} strokeLinecap="round" />
      <Path d="M14 9.5l1.2 1.5h-2.4zM10 16.5l-1.2-1.5h2.4z" fill={c} />
    </Svg>
  );
}

export function ScreenShareIcon(props: IconProps) {
  const s = props.size || 24;
  const c = getColor(props);
  return (
    <Svg width={s} height={s} viewBox="0 0 24 24" fill="none">
      <Rect x="3" y="4" width="18" height="13" rx="2" stroke={c} strokeWidth={1.5} />
      <Path d="M8 21h8M12 17v4" stroke={c} strokeWidth={1.5} strokeLinecap="round" />
      <Path d="M12 13V7M9 10l3-3 3 3" stroke={c} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function PhoneEndIcon(props: IconProps) {
  const s = props.size || 24;
  const c = getColor(props);
  return (
    <Svg width={s} height={s} viewBox="0 0 24 24" fill="none">
      <Path d="M22 16.5a13 13 0 0 0-20 0l1.5 2 3.3-1.2a1 1 0 0 0 .6-.7l.5-2.4a11 11 0 0 1 8.2 0l.5 2.4a1 1 0 0 0 .6.7l3.3 1.2z" stroke={c} strokeWidth={1.5} strokeLinejoin="round" />
    </Svg>
  );
}

export function PhoneIcon(props: IconProps) {
  const s = props.size || 24;
  const c = getColor(props);
  return (
    <Svg width={s} height={s} viewBox="0 0 24 24" fill="none">
      <Path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.37 1.9.72 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.35 1.85.59 2.81.72A2 2 0 0 1 22 16.92z" stroke={c} strokeWidth={1.5} strokeLinejoin="round" />
    </Svg>
  );
}
