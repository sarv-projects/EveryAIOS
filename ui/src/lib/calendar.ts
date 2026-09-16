// Calendar & AI Event scheduling client bridge (Open WebUI parity & cowork automations).
// Thin wrappers over Tauri calendar_* commands with vault persistence.

import { invoke } from "./tauri";
import { bridgeCall } from "./runtime";

export interface CalendarRow {
  id: string;
  name: string;
  color?: string;
  provider: string; // "local", "google", "ical", etc.
  sync_token?: string;
  created_at: number;
  updated_at: number;
}

export interface CalendarEventRow {
  id: string;
  calendar_id: string;
  title: string;
  description?: string;
  location?: string;
  start_time: number;
  end_time: number;
  all_day: boolean;
  recurrence_rule?: string;
  metadata?: string;
  created_at: number;
  updated_at: number;
}

const DEMO_CALENDARS: CalendarRow[] = [
  {
    id: "cal-default",
    name: "Personal & AI Work",
    color: "#3B82F6",
    provider: "local",
    created_at: Date.now() - 86400000,
    updated_at: Date.now() - 86400000,
  },
];

const DEMO_EVENTS: CalendarEventRow[] = [
  {
    id: "evt-001",
    calendar_id: "cal-default",
    title: "AI Swarm Codebase Review",
    description: "Multi-agent swarm fleet analysis and test verification.",
    start_time: Math.floor(Date.now() / 1000),
    end_time: Math.floor(Date.now() / 1000) + 3600,
    all_day: false,
    created_at: Date.now() - 3600000,
    updated_at: Date.now() - 3600000,
  },
];

export async function calendarList(): Promise<CalendarRow[]> {
  return bridgeCall({
    operation: "calendar_list",
    live: async () => {
      const out = (await invoke("calendar_list")) as { calendars?: CalendarRow[] };
      return out.calendars ?? [];
    },
    preview: () => Promise.resolve(DEMO_CALENDARS),
  });
}

export async function calendarPut(calendar: CalendarRow): Promise<boolean> {
  return bridgeCall({
    operation: "calendar_put",
    live: async () => {
      return (await invoke("calendar_put", { calendar })) as boolean;
    },
    preview: () => Promise.resolve(true),
  });
}

export async function calendarDelete(id: string): Promise<boolean> {
  return bridgeCall({
    operation: "calendar_delete",
    live: async () => {
      return (await invoke("calendar_delete", { id })) as boolean;
    },
    preview: () => Promise.resolve(true),
  });
}

export async function calendarEventList(calendarId?: string): Promise<CalendarEventRow[]> {
  return bridgeCall({
    operation: "calendar_event_list",
    live: async () => {
      const out = (await invoke("calendar_event_list", { calendarId })) as {
        events?: CalendarEventRow[];
      };
      return out.events ?? [];
    },
    preview: () => Promise.resolve(DEMO_EVENTS),
  });
}

export async function calendarEventPut(event: CalendarEventRow): Promise<boolean> {
  return bridgeCall({
    operation: "calendar_event_put",
    live: async () => {
      return (await invoke("calendar_event_put", { event })) as boolean;
    },
    preview: () => Promise.resolve(true),
  });
}

export async function calendarEventDelete(id: string): Promise<boolean> {
  return bridgeCall({
    operation: "calendar_event_delete",
    live: async () => {
      return (await invoke("calendar_event_delete", { id })) as boolean;
    },
    preview: () => Promise.resolve(true),
  });
}
