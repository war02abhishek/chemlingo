import React from 'react';
import Svg, { Path, Circle, Ellipse, Rect, LinearGradient, Stop, Defs, ClipPath, G } from 'react-native-svg';

export type FlaskyExpression = 'happy' | 'thinking' | 'celebrating';

interface Props {
  size?: number;
  expression?: FlaskyExpression;
}

// Exact replica of Flasky.dc.html SVG — viewBox 0 0 120 150
export default function FlaskyMascot({ size = 80 }: Props) {
  const w = size;
  const h = Math.round(size * 1.25); // 150/120 ratio

  return (
    <Svg width={w} height={h} viewBox="0 0 120 150">
      <Defs>
        <LinearGradient id="flaskyLiquid" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0%" stopColor="#2ee6e0" />
          <Stop offset="55%" stopColor="#36c5e8" />
          <Stop offset="100%" stopColor="#8b5cf6" />
        </LinearGradient>
        <ClipPath id="flaskyBody">
          <Path d="M50 30 L50 50 L22 116 Q19 126 29 126 L91 126 Q101 126 98 116 L70 50 L70 30 Z" />
        </ClipPath>
      </Defs>

      {/* atom stopper */}
      <Circle cx="60" cy="14" r="13" fill="#2ee6e0" opacity="0.22" />
      <Ellipse cx="60" cy="14" rx="12" ry="4.5" fill="none" stroke="#2ad3da" strokeWidth="2" transform="rotate(35, 60, 14)" />
      <Ellipse cx="60" cy="14" rx="12" ry="4.5" fill="none" stroke="#8b5cf6" strokeWidth="2" transform="rotate(-35, 60, 14)" />
      <Circle cx="60" cy="14" r="4" fill="#8b5cf6" stroke="#16204a" strokeWidth="2" />

      {/* legs */}
      <Rect x="44" y="120" width="8" height="14" rx="4" fill="#16204a" />
      <Rect x="68" y="120" width="8" height="14" rx="4" fill="#16204a" />
      <Ellipse cx="46" cy="136" rx="9" ry="5" fill="#16204a" />
      <Ellipse cx="74" cy="136" rx="9" ry="5" fill="#16204a" />

      {/* arms */}
      <Path d="M27 96 Q13 95 11 107" fill="none" stroke="#16204a" strokeWidth="6" strokeLinecap="round" />
      <Circle cx="11" cy="108" r="4.5" fill="#16204a" />
      <Path d="M93 96 Q107 95 109 107" fill="none" stroke="#16204a" strokeWidth="6" strokeLinecap="round" />
      <Circle cx="109" cy="108" r="4.5" fill="#16204a" />

      {/* neck lip */}
      <Rect x="45" y="22" width="30" height="11" rx="5.5" fill="#f3fcff" stroke="#16204a" strokeWidth="4.5" />

      {/* flask body */}
      <Path
        d="M50 30 L50 50 L22 116 Q19 126 29 126 L91 126 Q101 126 98 116 L70 50 L70 30 Z"
        fill="#f3fcff"
        stroke="#16204a"
        strokeWidth="4.5"
        strokeLinejoin="round"
      />

      {/* liquid */}
      <G clipPath="url(#flaskyBody)">
        <Path d="M28 92 C 44 85 76 99 92 92 L100 128 L20 128 Z" fill="url(#flaskyLiquid)" />
        <Circle cx="42" cy="110" r="4" fill="#cffbff" opacity="0.85" />
        <Circle cx="58" cy="116" r="3" fill="#cffbff" opacity="0.8" />
        <Circle cx="72" cy="104" r="5" fill="#cffbff" opacity="0.7" />
        <Circle cx="64" cy="120" r="2.5" fill="#cffbff" opacity="0.8" />
      </G>

      {/* eyebrows */}
      <Path d="M39 53 Q47 49 55 52" fill="none" stroke="#16204a" strokeWidth="5" strokeLinecap="round" />
      <Path d="M65 52 Q73 49 81 53" fill="none" stroke="#16204a" strokeWidth="5" strokeLinecap="round" />

      {/* eyes */}
      <Ellipse cx="48" cy="67" rx="8" ry="10" fill="#ffffff" stroke="#16204a" strokeWidth="2.5" />
      <Ellipse cx="72" cy="67" rx="8" ry="10" fill="#ffffff" stroke="#16204a" strokeWidth="2.5" />
      <Circle cx="49" cy="69" r="4" fill="#16204a" />
      <Circle cx="71" cy="69" r="4" fill="#16204a" />
      <Circle cx="47.4" cy="66.5" r="1.6" fill="#ffffff" />
      <Circle cx="69.4" cy="66.5" r="1.6" fill="#ffffff" />

      {/* cheeks */}
      <Circle cx="37" cy="78" r="4" fill="#ff9bb3" opacity="0.55" />
      <Circle cx="83" cy="78" r="4" fill="#ff9bb3" opacity="0.55" />
    </Svg>
  );
}
