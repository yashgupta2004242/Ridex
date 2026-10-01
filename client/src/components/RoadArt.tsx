export function RoadArt({ className = '' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 320 520" fill="none" aria-hidden="true">
      <rect width="320" height="520" fill="#0B1512" />
      <path d="M40 0h240v520H40z" fill="#1A2A24" />
      <path d="M118 0h84v520h-84z" fill="#11201A" />
      <path
        className="road-dash"
        d="M160 0v520"
        stroke="#F4F6F2"
        strokeWidth="6"
        strokeDasharray="28 22"
      />
      <g className="km-stone">
        <path d="M214 168h72v88h-72z" fill="#1F6F4A" />
        <path d="M214 168h72l-10 14H224z" fill="#163F2C" />
        <text x="250" y="208" textAnchor="middle" fill="#F4F6F2" fontFamily="Archivo, sans-serif" fontSize="18" fontWeight="700">
          12
        </text>
        <text x="250" y="228" textAnchor="middle" fill="#D7DCD3" fontFamily="IBM Plex Sans, sans-serif" fontSize="9">
          km
        </text>
      </g>
      <g className="car-glide">
        <rect x="142" y="300" width="36" height="58" rx="10" fill="#1F6F4A" />
        <rect x="148" y="308" width="24" height="16" rx="3" fill="#C5E6D4" />
        <rect x="148" y="336" width="24" height="12" rx="2" fill="#0B1512" />
      </g>
    </svg>
  );
}

export const ROAD_PHOTO =
  'https://images.unsplash.com/photo-1449965408869-eaa3f722e40d?auto=format&fit=crop&w=1600&q=80';
