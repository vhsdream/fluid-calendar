import { CalendarEvent } from "@prisma/client";
import ICAL from "ical.js";

// Define a type for iCalendar recurrence rules
export interface ICalRRule {
  freq?: string;
  interval?: number;
  count?: number;
  until?: Date | string | ICAL.Time;
  bymonth?: number | number[];
  bymonthday?: number | number[];
  byday?: string | string[];
  byweekno?: number | number[];
  byyearday?: number | number[];
  bysetpos?: number | number[];
  wkst?: string;
  [key: string]: unknown; // Allow for other properties
}

// Futile attempt to create my own client?
export interface WebCalClient {
  fetchWebCalUrl: () => Promise<string>;
  fetchWebCalendar: () => Promise<CalendarEvent>;
  calendarQuery: (params: CalendarQueryParams) => Promise<Response[]>;
}

// Define the structure for calendar query parameters
export interface CalendarQueryParams {
  url: string;
  props: Record<string, unknown>;
  filters: {
    "comp-filter": {
      _attributes: {
        name: string;
      };
      "comp-filter": {
        _attributes: {
          name: string;
        };
        "time-range"?: {
          _attributes: {
            start: string;
            end: string;
          };
        };
      };
    };
  };
  depth: string;
}

/**
 * Interface for Web calendar objects
 */
// export interface WebCalCalendarObject {
//   url: string;
//   etag?: string;
//   data?: string | { _cdata: string } | Record<string, unknown>; // iCalendar data can be a string or an object with _cdata property
// }

/**
 * Interface for sync results
 */
export interface SyncResult {
  added: CalendarEvent[];
  updated: CalendarEvent[];
  deleted: string[];
}

/**
 * Input for creating or updating calendar events
 */
export interface CalendarEventInput {
  id?: string;
  title: string;
  description?: string;
  start: Date;
  end: Date;
  location?: string;
  allDay?: boolean;
  isRecurring?: boolean;
  recurrenceRule?: string;
}
