export type IconName =
  | "cup"
  | "table"
  | "bag"
  | "search"
  | "plus"
  | "arrow"
  | "bell"
  | "check"
  | "leaf"
  | "receipt"
  | "grid"
  | "menu"
  | "help";
const paths: Record<IconName, string> = {
  cup: "M5 9h12v7a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4V9Zm12 1h1a3 3 0 0 1 0 6h-1M8 3v3m4-3v3m4-3v3M3 22h17",
  table: "M3 10h18M5 10V6h14v4M6 10l-2 11m14-11 2 11M7 16h10",
  bag: "M5 7h14l1 14H4L5 7Zm3 0V5a4 4 0 0 1 8 0v2",
  search: "m21 21-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z",
  plus: "M12 5v14M5 12h14",
  arrow: "M4 12h16m-6-6 6 6-6 6",
  bell: "M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4",
  check: "m5 12 4 4L19 6",
  leaf: "M20 3C8 2 2 8 5 15c3 7 15 5 15-12ZM4 21 16 9",
  receipt: "M5 3v18l4-2 3 2 3-2 4 2V3l-4 2-3-2-3 2-4-2Zm4 6h6m-6 4h6",
  grid: "M3 3h7v7H3V3Zm11 0h7v7h-7V3ZM3 14h7v7H3v-7Zm11 0h7v7h-7v-7Z",
  menu: "M5 4h14v16H5V4Zm4 5h6m-6 4h6m-6 4h4",
  help: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm-3 6a3 3 0 0 1 6 0c0 2-3 2-3 4m0 3v.01",
};
export function Icon({
  name,
  className = "",
}: {
  name: IconName;
  className?: string;
}) {
  return (
    <svg
      className={`ui-icon ${className}`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={paths[name]} />
    </svg>
  );
}
export function Brand() {
  return (
    <div className="brand">
      <span className="brand-mark">
        <Icon name="cup" />
      </span>
      <span>
        Cafe<span className="brand-light">Link</span>
      </span>
    </div>
  );
}
