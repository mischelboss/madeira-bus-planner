import type { OperatorId } from "../planner/types.ts";

/** ISO 8601 -> "HH:MM" (already in Madeira offset, so slice is safe). */
export function hhmm(iso: string): string {
  return iso.slice(11, 16);
}

export function durationLabel(seconds: number): string {
  const m = Math.round(seconds / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest ? `${h} h ${rest} min` : `${h} h`;
}

export function transferLabel(count: number): string {
  if (count === 0) return "Direct";
  return count === 1 ? "1 transfer" : `${count} transfers`;
}

export function dayLabel(iso: string, todayIso: string): string {
  const d = iso.slice(0, 10);
  const t = todayIso.slice(0, 10);
  if (d === t) return "";
  const tomorrow = new Date(new Date(t).getTime() + 86_400_000).toISOString().slice(0, 10);
  if (d === tomorrow) return "Tomorrow";
  return new Date(iso).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "short" });
}

export function humanDate(dateYmd: string): string {
  return new Date(dateYmd + "T12:00:00").toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export const OPERATOR_CLASS: Record<OperatorId, string> = {
  HF: "op-hf",
  RODOESTE: "op-rodoeste",
  CAM: "op-cam",
  AEROBUS: "op-aerobus",
};

/** Terse operator code for line badges — keeps the pill small. */
export const OPERATOR_SHORT: Record<OperatorId, string> = {
  HF: "HF",
  RODOESTE: "ROD",
  CAM: "CAM",
  AEROBUS: "AERO",
};

/** Map polyline colour per operator — roughly the flower accent, opaque. */
export const OPERATOR_LINE_COLOR: Record<OperatorId, string> = {
  HF: "#b83f8f",
  RODOESTE: "#c25e00",
  CAM: "#8a7a00",
  AEROBUS: "#7a4fd0",
};
