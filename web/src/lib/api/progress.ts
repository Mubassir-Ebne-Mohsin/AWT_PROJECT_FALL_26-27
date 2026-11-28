import { api } from "@/lib/api/client";
import type { components } from "@/lib/api/phase3-schema";
export type ProgressActivity = components["schemas"]["ProgressActivity"];
export type ProgressDay = components["schemas"]["ProgressActivityDay"];
export type ActivityEvent = ProgressDay["events"][number];
const local = {scope:"local"} as const;
export const fetchProgressActivity = (signal?:AbortSignal) => api<ProgressActivity>("/progress/activity",{...local,signal});
export const fetchProgressDay = (date:string,signal?:AbortSignal) => api<ProgressDay>("/progress/activity/day?date="+encodeURIComponent(date),{...local,signal});
