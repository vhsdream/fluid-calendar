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
  fetchWebCalInfo: (webCalUrl: string) => Promise<Response>;
}

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
