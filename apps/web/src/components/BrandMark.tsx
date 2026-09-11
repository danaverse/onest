export function BrandMark(props: {
  width?: number;
  height?: number;
  className?: string;
}) {
  const w = props.width ?? 32;
  const h = props.height ?? 32;

  return (
    <svg
      width={w}
      height={h}
      viewBox="0 0 24 24"
      fill="currentColor"
      className={props.className}
      aria-hidden="true"
    >
      {/* Glyph bounds are x 2.5..22.5 / y 2.5..21 in the viewBox: nudge left
          and down so the mark sits optically centered. */}
      <g transform="translate(-0.5 0.25)">
        <circle cx="5" cy="8" r="2.5" />
        <circle cx="10" cy="5" r="2.5" />
        <circle cx="15" cy="5" r="2.5" />
        <circle cx="20" cy="8" r="2.5" />
        <path d="M12 10.5c-3.5 0-6.5 2.2-6.5 5.5 0 2.8 2.5 5 6.5 5s6.5-2.2 6.5-5c0-3.3-3-5.5-6.5-5.5z" />
      </g>
    </svg>
  );
}
