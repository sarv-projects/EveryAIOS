import { describe, expect, test } from "bun:test";
import {
  calendarEventListArgs,
  type CalendarEventRow,
  type CalendarRow,
} from "./calendar";

describe("calendar bridge native wire contract", () => {
  test("uses the Rust calendar_event_list argument names", () => {
    expect(calendarEventListArgs("work", 100, 200)).toEqual({
      calendar_id: "work",
      start_ts: 100,
      end_ts: 200,
    });
  });

  test("omits absent filters instead of sending undefined values", () => {
    expect(calendarEventListArgs()).toEqual({});
    expect(calendarEventListArgs("work")).toEqual({ calendar_id: "work" });
  });

  test("calendar rows use the SQLCipher calendar schema", () => {
    const calendar: CalendarRow = {
      id: "work",
      name: "Work",
      color: "blue",
      visible: true,
      created_at: 1,
      updated_at: 1,
    };
    expect(calendar).toMatchObject({ color: "blue", visible: true });
  });

  test("event rows use nullable rrule and automation_id fields", () => {
    const event: CalendarEventRow = {
      id: "event-1",
      calendar_id: "work",
      title: "Planning",
      description: "Weekly planning",
      start_time: 100,
      end_time: 200,
      all_day: false,
      rrule: null,
      automation_id: null,
      created_at: 1,
      updated_at: 1,
    };
    expect(event.rrule).toBeNull();
    expect(event.automation_id).toBeNull();
  });
});
