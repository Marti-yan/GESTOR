import { ArrowUp, ArrowDown } from "lucide-react";
export function moved<T>(list: T[], index: number, delta: number) {
  const next = [...list];
  if (index + delta < 0 || index + delta >= next.length) return next;
  [next[index], next[index + delta]] = [next[index + delta], next[index]];
  return next;
}
export function Reorder({
  index,
  count,
  label,
  onMove,
  disabled = false,
}: {
  index: number;
  count: number;
  label: string;
  onMove: (delta: number) => void;
  disabled?: boolean;
}) {
  return (
    <span className="reorder-buttons">
      <button
        type="button"
        className="icon-button"
        disabled={disabled || !index}
        aria-label={`Subir ${label}`}
        onClick={() => onMove(-1)}
      >
        <ArrowUp size={16} />
      </button>
      <button
        type="button"
        className="icon-button"
        disabled={disabled || index === count - 1}
        aria-label={`Descer ${label}`}
        onClick={() => onMove(1)}
      >
        <ArrowDown size={16} />
      </button>
    </span>
  );
}
