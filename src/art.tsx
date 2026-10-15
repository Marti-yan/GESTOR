import { useId } from "react";

export function FoodArt({
  kind = "burger",
  hero = false,
}: {
  kind?: string;
  hero?: boolean;
}) {
  const uid = useId().replace(/:/g, "");
  const drink = ["soda", "lemonade", "water"].includes(kind),
    fries = kind.includes("fries");
  return (
    <svg
      viewBox="0 0 320 230"
      role="img"
      aria-label={
        drink ? "Bebida" : fries ? "Porção de batatas" : "Hambúrguer artesanal"
      }
      className={`food-art ${hero ? "hero-food" : ""}`}
    >
      <defs>
        <linearGradient id={`${uid}bun`} x2="0" y2="1">
          <stop stopColor="#f4ba63" />
          <stop offset="1" stopColor="#bf692d" />
        </linearGradient>
        <linearGradient id={`${uid}patty`} x2="0" y2="1">
          <stop stopColor="#603d29" />
          <stop offset="1" stopColor="#30261f" />
        </linearGradient>
        <filter
          id={`${uid}shadow`}
          x="-40%"
          y="-40%"
          width="180%"
          height="200%"
        >
          <feDropShadow
            dx="0"
            dy="12"
            stdDeviation="9"
            floodColor="#3d2118"
            floodOpacity=".19"
          />
        </filter>
      </defs>
      <ellipse
        cx="160"
        cy="206"
        rx={drink ? 60 : 109}
        ry="11"
        fill="#433527"
        opacity=".09"
      />
      {drink ? (
        kind === "soda" ? (
          <g filter={`url(#${uid}shadow)`}>
            <rect
              x="113"
              y="37"
              width="94"
              height="166"
              rx="22"
              fill="#dc4c38"
            />
            <ellipse cx="160" cy="41" rx="45" ry="9" fill="#d9d9d4" />
            <ellipse cx="160" cy="41" rx="20" ry="5" fill="#aaa9a1" />
            <rect
              x="125"
              y="66"
              width="8"
              height="100"
              rx="4"
              fill="#ff8870"
              opacity=".6"
            />
            <text
              x="158"
              y="132"
              fill="#fff4db"
              textAnchor="middle"
              fontSize="28"
              fontWeight="900"
              transform="rotate(-10 158 132)"
            >
              COLA
            </text>
            <path
              d="M136 155q25-20 50-8"
              stroke="#fff4db"
              strokeWidth="5"
              fill="none"
            />
          </g>
        ) : kind === "water" ? (
          <g filter={`url(#${uid}shadow)`}>
            <rect x="142" y="25" width="36" height="20" rx="5" fill="#4389a1" />
            <path
              d="M141 45h38v22q26 15 26 42v79q0 15-15 15h-60q-15 0-15-15v-79q0-27 26-42z"
              fill="#b0d7dd"
            />
            <path d="M123 112h74v58h-74z" fill="#e5f1ee" />
            <text
              x="160"
              y="146"
              textAnchor="middle"
              fill="#367482"
              fontSize="18"
              fontWeight="800"
            >
              ÁGUA
            </text>
            <path
              d="M130 82v15m0 82v9"
              stroke="white"
              strokeWidth="6"
              strokeLinecap="round"
              opacity=".6"
            />
          </g>
        ) : (
          <g filter={`url(#${uid}shadow)`}>
            <path d="M108 57h104l-13 143h-78z" fill="#c1d294" />
            <path d="M114 81h92l-11 114h-70z" fill="#e6df7b" />
            <ellipse cx="160" cy="59" rx="52" ry="9" fill="#f5f1c8" />
            <path d="M179 68l17-47" stroke="#f3e8d3" strokeWidth="9" />
            <rect
              x="131"
              y="92"
              width="22"
              height="22"
              rx="5"
              fill="#fff"
              opacity=".5"
              transform="rotate(15 142 103)"
            />
            <rect
              x="166"
              y="124"
              width="24"
              height="24"
              rx="5"
              fill="#fff"
              opacity=".4"
              transform="rotate(-10 178 136)"
            />
            <circle cx="111" cy="96" r="26" fill="#75a849" />
            <circle cx="111" cy="96" r="20" fill="#c8d76b" />
            <path d="M111 77v38m-18-19h36" stroke="#f1edbd" strokeWidth="2" />
          </g>
        )
      ) : fries ? (
        <g filter={`url(#${uid}shadow)`}>
          {[
            [-48, -8, -15],
            [-28, -22, -6],
            [-10, -13, 5],
            [10, -29, 8],
            [30, -14, 15],
            [48, 2, 22],
          ].map(([x, y, r], i) => (
            <rect
              key={i}
              x={150 + x}
              y={50 + y}
              width="17"
              height="133"
              rx="4"
              fill={i % 2 ? "#e5a847" : "#f4c966"}
              transform={`rotate(${r} ${158 + x} 150)`}
            />
          ))}
          <path
            d="M91 121l18 82h103l18-82z"
            fill={kind === "loaded-fries" ? "#eec56d" : "#e96641"}
          />
          <path
            d="M108 126l13 68"
            stroke="#ff9471"
            strokeWidth="7"
            opacity=".65"
          />
          <text
            x="160"
            y="173"
            fontWeight="900"
            fontSize="25"
            fill="#fff5df"
            textAnchor="middle"
          >
            pronto.
          </text>
          {kind === "loaded-fries" && (
            <>
              <path
                d="M102 110q20-16 45-2t63-3"
                stroke="#efb93c"
                strokeWidth="15"
                fill="none"
                strokeLinecap="round"
              />
              <path
                d="M121 105l14 7m29-9 12 10m16-13 9 9"
                stroke="#a2482b"
                strokeWidth="8"
              />
            </>
          )}
        </g>
      ) : (
        <g filter={`url(#${uid}shadow)`}>
          <path
            d="M57 174q0-15 21-15h164q21 0 21 15v8q-6 22-32 22H89q-25-1-32-22z"
            fill={`url(#${uid}bun)`}
          />
          <path
            d="M64 163q18-14 35-2t33-1 35 1 38 0 47 2"
            fill="none"
            stroke="#73933d"
            strokeWidth="13"
            strokeLinecap="round"
          />
          <path
            d="M63 143q-7-12 7-19 91-17 181 0 14 7 7 19l-12 11H77z"
            fill={`url(#${uid}patty)`}
          />
          <path
            d="M77 131l48 5 42-5 36 6 43-6-13 14-32-2-34 13-29-12-31 2z"
            fill="#f4c74a"
          />
          {kind === "double" && (
            <>
              <path
                d="M64 119q-3-16 15-18h160q22 4 17 20l-8 7H75z"
                fill={`url(#${uid}patty)`}
              />
              <path
                d="M78 105l59 8 54-5 48-1-18 18-38-9-33 15-29-14-32 7z"
                fill="#f4c74a"
              />
            </>
          )}
          {kind === "bacon" && (
            <path
              d="M77 111q18-15 35-3t35-3 35 2 36-3 27 1"
              fill="none"
              stroke="#ae5030"
              strokeWidth="12"
              strokeLinecap="round"
            />
          )}
          {kind === "veggie" && (
            <>
              <path
                d="M72 120q18-22 38-3t35-6 37 5 34-7 31 4"
                stroke="#679749"
                strokeWidth="13"
                fill="none"
              />
              <path d="M86 124h140" stroke="#d96344" strokeWidth="10" />
            </>
          )}
          <path
            d="M64 106q7-57 96-60 91 2 98 60-1 13-21 14H85q-20-1-21-14z"
            fill={`url(#${uid}bun)`}
            transform={kind === "double" ? "translate(0 -18)" : ""}
          />
          <path
            d="M85 94q13-29 52-33"
            stroke="#ffda8b"
            strokeWidth="7"
            strokeLinecap="round"
            fill="none"
            opacity=".6"
            transform={kind === "double" ? "translate(0 -18)" : ""}
          />
          {[
            [115, 76, -20],
            [147, 66, 16],
            [184, 70, -18],
            [211, 86, 30],
            [145, 94, 8],
            [183, 95, -20],
            [99, 92, 35],
          ].map(([x, y, r], i) => (
            <ellipse
              key={i}
              cx={x}
              cy={y - (kind === "double" ? 18 : 0)}
              rx="5"
              ry="2"
              fill="#fce9ba"
              transform={`rotate(${r} ${x} ${y - (kind === "double" ? 18 : 0)})`}
            />
          ))}
        </g>
      )}
    </svg>
  );
}
