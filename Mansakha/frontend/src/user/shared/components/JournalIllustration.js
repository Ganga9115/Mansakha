import React from 'react';
import Svg, { Path, Rect, G } from 'react-native-svg';

export default function JournalIllustration({ width = 140, height = 90 }) {
  return (
    <Svg width={width} height={height} viewBox="0 0 160 100" fill="none">
      {/* Background Soft Leaves */}
      <G opacity="0.35">
        <Path d="M125 20 C135 10, 150 25, 140 40 C130 55, 115 40, 125 20 Z" fill="#60A5FA" />
        <Path d="M135 45 C150 35, 160 55, 145 68 C130 80, 120 60, 135 45 Z" fill="#3B82F6" />
        <Path d="M20 50 C10 35, 28 20, 40 38 C50 50, 32 65, 20 50 Z" fill="#93C5FD" />
      </G>

      {/* Notebook Base / Shadow */}
      <Rect x="38" y="28" width="84" height="58" rx="6" fill="#1D4ED8" transform="rotate(-3 80 57)" />
      <Rect x="40" y="26" width="80" height="56" rx="5" fill="#FFFFFF" transform="rotate(-3 80 57)" />

      {/* Book Center Fold & Lines */}
      <Path d="M80 25 L80 81" stroke="#DBEAFE" strokeWidth="2" />
      <Path d="M48 36 H72 M48 44 H72 M48 52 H72 M48 60 H72 M48 68 H72" stroke="#BFDBFE" strokeWidth="1.5" strokeLinecap="round" />
      <Path d="M88 36 H112 M88 44 H112 M88 52 H112 M88 60 H112 M88 68 H112" stroke="#BFDBFE" strokeWidth="1.5" strokeLinecap="round" />

      {/* Pen */}
      <G transform="rotate(8 92 48)">
        <Rect x="90" y="22" width="6" height="48" rx="3" fill="#2563EB" />
        <Path d="M90 70 L93 77 L96 70 Z" fill="#F59E0B" />
        <Rect x="89" y="30" width="8" height="3" rx="1" fill="#93C5FD" />
      </G>
    </Svg>
  );
}