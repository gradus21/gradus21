import React from 'react';

interface FlowRibbonLogoProps {
  size?: number;
  showWordmark?: boolean;
}

/**
 * BTE NotenFlow Brand Mark: "The Flow Ribbon"
 * Strictly NO knight shields, NO padlocks, NO mortarboards.
 * Three geometric ribbons starting as structured horizontal layers on the left
 * and flowing into a rising wave / stylized 'N' on the right.
 */
export const FlowRibbonLogo: React.FC<FlowRibbonLogoProps> = ({
  size = 38,
  showWordmark = true,
}) => {
  return (
    <div className="inline-flex items-center gap-3 select-none">
      <svg
        width={size}
        height={size}
        viewBox="0 0 48 48"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="shrink-0 drop-shadow-sm"
      >
        <defs>
          <linearGradient id="nfBgGrad" x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="var(--primary-600)" />
            <stop offset="100%" stopColor="#0B292C" />
          </linearGradient>
          <linearGradient id="nfWaveTop" x1="8" y1="12" x2="40" y2="22" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#5EEAD4" />
            <stop offset="100%" stopColor="#2DD4BF" />
          </linearGradient>
          <linearGradient id="nfWaveMid" x1="8" y1="24" x2="40" y2="24" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#2DD4BF" />
            <stop offset="100%" stopColor="#14B8A6" />
          </linearGradient>
          <linearGradient id="nfWaveBot" x1="8" y1="36" x2="40" y2="14" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#99F6E4" />
            <stop offset="100%" stopColor="#38BDF8" />
          </linearGradient>
        </defs>

        {/* Squircle Container (22% border radius) */}
        <rect x="2" y="2" width="44" height="44" rx="12" fill="url(#nfBgGrad)" />

        {/* Structured left category pills morphing into the rising Flow Ribbon */}
        <path
          d="M10 15.5C15.5 15.5 18.5 11.5 24.5 15.5C30.5 19.5 33.5 14 38 11.5"
          stroke="url(#nfWaveTop)"
          strokeWidth="4.2"
          strokeLinecap="round"
        />
        <path
          d="M10 24.5C16.5 24.5 19.5 19.5 25.5 24.5C31.5 29.5 34.5 21 38 18.5"
          stroke="url(#nfWaveMid)"
          strokeWidth="4.2"
          strokeLinecap="round"
        />
        <path
          d="M10 33.5C17.5 33.5 20.5 27.5 26.5 32.5C32.5 37.5 35 28.5 38 25.5"
          stroke="url(#nfWaveBot)"
          strokeWidth="4.2"
          strokeLinecap="round"
        />

        {/* Rising trajectory spark node */}
        <circle cx="38" cy="11.5" r="2.6" fill="#F0FDFA" />
      </svg>

      {showWordmark && (
        <div className="flex flex-col leading-none">
          <div className="flex items-center gap-1.5">
            <span className="text-lg font-extrabold tracking-tight" style={{ color: 'var(--text-primary)' }}>
              Noten<span style={{ color: 'var(--primary-500)' }}>Flow</span>
            </span>
            <span
              className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-md"
              style={{
                backgroundColor: 'var(--primary-soft)',
                color: 'var(--primary-text)',
              }}
            >
              BTE
            </span>
          </div>
          <span className="text-[11px] font-medium mt-0.5" style={{ color: 'var(--text-secondary)' }}>
            Zero-Knowledge Classroom Suite
          </span>
        </div>
      )}
    </div>
  );
};
