import { useId } from "react";
import { searchText } from "./ui";

/** Original vector illustrations, not product photographs. No external asset requests. */
export function DrinkArt({
  name = "Latte",
  scene = false,
}: {
  name?: string;
  scene?: boolean;
}) {
  const id = useId().replace(/:/g, ""),
    normalized = searchText(name);
  const water = normalized.includes("nuoc"),
    tea = normalized.includes("tra"),
    cocoa = normalized.includes("cacao"),
    dark = normalized.includes("den"),
    latte = normalized.includes("latte"),
    white = normalized.includes("bac xiu");
  const top = water
    ? "#b9d6d8"
    : tea
      ? "#f5bc5e"
      : dark
        ? "#5a3024"
        : cocoa
          ? "#86523a"
          : latte
            ? "#b47748"
            : white
              ? "#d4a570"
              : "#a96333";
  const bottom = water
    ? "#dfedf0"
    : tea
      ? "#d98835"
      : dark
        ? "#331b16"
        : cocoa
          ? "#4e3025"
          : white
            ? "#f8e5c6"
            : "#e6bd86";
  const gradient = `drink-${id}`,
    glass = `glass-${id}`;
  return (
    <svg
      className={`drink-art ${scene ? "drink-scene" : ""}`}
      viewBox="0 0 300 300"
      role="img"
      aria-label={`Minh họa ${name}`}
    >
      <defs>
        <linearGradient id={gradient} x1="0" y1="0" x2=".25" y2="1">
          <stop stopColor={top} />
          <stop offset="1" stopColor={bottom} />
        </linearGradient>
        <linearGradient id={glass}>
          <stop stopColor="#fff" stopOpacity=".6" />
          <stop offset=".35" stopColor="#fff" stopOpacity=".04" />
          <stop offset="1" stopColor="#fff" stopOpacity=".28" />
        </linearGradient>
      </defs>
      <circle
        cx="150"
        cy="150"
        r="113"
        fill={tea ? "#eddab9" : water ? "#dce9e7" : "#e7dbc9"}
      />
      <circle
        cx="150"
        cy="150"
        r="99"
        fill="none"
        stroke="#fff"
        strokeOpacity=".55"
      />
      <ellipse cx="152" cy="256" rx="81" ry="12" fill="#3c2b1b" opacity=".12" />
      {latte ? (
        <g>
          <ellipse cx="148" cy="236" rx="83" ry="14" fill="#d4cab6" />
          <path
            d="M207 127h16c37 0 32 66-13 62"
            fill="none"
            stroke="#f8f1e4"
            strokeWidth="18"
          />
          <path d="M72 116h140v65c0 64-140 64-140 0Z" fill="#f8f2e8" />
          <ellipse cx="142" cy="116" rx="70" ry="26" fill="#e6ddca" />
          <ellipse cx="142" cy="116" rx="61" ry="20" fill="#ad703d" />
          <path
            d="M142 130c-58-30-30-47-3-18 25-29 53-12 3 18Z"
            fill="#f8e7c7"
          />
          <path d="M141 128v-28" stroke="#f8e7c7" strokeWidth="3" />
          <path
            d="M114 73c-16-19 14-23 0-43m31 43c-16-19 14-23 0-43m31 43c-16-19 14-23 0-43"
            stroke="#fff"
            strokeOpacity=".6"
            strokeWidth="4"
            fill="none"
          />
        </g>
      ) : (
        <g>
          <path
            d="m187 50-22 160"
            stroke="#5d6b53"
            strokeWidth="8"
            strokeLinecap="round"
          />
          <path
            d="M82 82h136l-18 154c-2 22-98 22-101 0Z"
            fill={`url(#${gradient})`}
          />
          <ellipse cx="150" cy="82" rx="68" ry="18" fill={top} />
          {[
            [-2, 0],
            [36, 6],
            [12, 30],
            [53, 37],
          ].map(([x, y], i) => (
            <rect
              key={i}
              x={108 + x}
              y={71 + y}
              width="31"
              height="26"
              rx="7"
              transform={`rotate(${i % 2 ? 18 : -14} ${123 + x} ${84 + y})`}
              fill="#fff"
              fillOpacity={water ? ".55" : ".3"}
              stroke="#fff"
              strokeOpacity=".3"
            />
          ))}
          {!water && !tea && !dark && (
            <path
              d="M94 167q29-13 56 0t59-2l-9 71c-2 18-98 18-101 0Z"
              fill={bottom}
              opacity=".7"
            />
          )}
          <path
            d="M82 82h136l-18 154c-2 22-98 22-101 0Z"
            fill={`url(#${glass})`}
            stroke="#fff"
            strokeWidth="3"
            strokeOpacity=".7"
          />
          <path
            d="m98 107 13 121"
            stroke="#fff"
            strokeOpacity=".45"
            strokeWidth="7"
            strokeLinecap="round"
          />
          <ellipse
            cx="150"
            cy="82"
            rx="68"
            ry="18"
            fill="none"
            stroke="#fff"
            strokeWidth="4"
            strokeOpacity=".55"
          />
          {tea && (
            <g>
              <circle
                cx="177"
                cy="182"
                r="25"
                fill="#edb44d"
                stroke="#ffe7a7"
                strokeWidth="5"
              />
              <path
                d="m177 159 0 46m-22-23h44m-38-16 32 32m0-32-32 32"
                stroke="#ffe7a7"
                strokeWidth="2"
              />
              <path
                d="M179 71c6-30 26-36 32-31-1 20-14 34-32 31Z"
                fill="#48634a"
              />
            </g>
          )}
          {water && (
            <path
              d="M132 155c-29 34 35 34 15 3l-7-14Z"
              fill="#f2fcff"
              opacity=".7"
            />
          )}
        </g>
      )}
      {!water && !tea && (
        <g fill="#744831" transform="rotate(-30 60 240)">
          <ellipse cx="57" cy="242" rx="9" ry="14" />
          <path d="M57 230v24" stroke="#e4bc8a" strokeWidth="1.5" />
          <ellipse cx="78" cy="254" rx="8" ry="12" />
          <path d="M78 244v21" stroke="#e4bc8a" strokeWidth="1.5" />
        </g>
      )}
    </svg>
  );
}
