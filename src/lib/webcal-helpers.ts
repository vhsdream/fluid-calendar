import { CalendarEvent } from "@prisma/client";
import ICAL from "ical.js";

import { newDate } from "./date-utils";
import { logger } from "./logger";

const LOG_SOURCE = "WebCalHelpers";

/**
 * Converts an ICAL VEVENT component to a CalendarEvent
 * @param vevent VEVENT component
 * @param vcalendar Parent VCALENDAR component
 * @returns Converted calendar event
 */
export function convertWebCalEvent(vevent: ICAL.Component): CalendarEvent {
  try {
    // Extract event properties
    const uidValue = vevent.getFirstPropertyValue("uid");
    const uid = uidValue ? String(uidValue) : crypto.randomUUID();
    const summary = vevent.getFirstPropertyValue("summary");
    const description = vevent.getFirstPropertyValue("description");
    const location = vevent.getFirstPropertyValue("location");

    // Get start and end times
    const dtstart = vevent.getFirstProperty("dtstart");
    const dtend =
      vevent.getFirstProperty("dtend") || vevent.getFirstProperty("duration");

    if (!dtstart) {
      throw new Error("Event is missing start time");
    }

    // Use the helper function to check if this is an all-day event
    const isAllDay = isAllDayEvent(vevent);

    // Handle ICAL.js types properly by using type assertion
    // ICAL.Time objects have toJSDate() but TypeScript doesn't know this
    const dtstartValue = dtstart.getFirstValue();
    const startDate =
      typeof dtstartValue === "object" && dtstartValue !== null
        ? (dtstartValue as unknown as { toJSDate(): Date }).toJSDate()
        : new Date();

    const dtendValue = dtend?.getFirstValue();
    const endDate =
      typeof dtendValue === "object" && dtendValue !== null
        ? (dtendValue as unknown as { toJSDate(): Date }).toJSDate()
        : new Date();

    // Check for recurrence
    const rrule = vevent.getFirstPropertyValue("rrule");
    const isRecurring = !!rrule;

    // Get recurrence-id if this is an exception
    const recurrenceId = vevent.getFirstPropertyValue("recurrence-id");
    const isInstance = !!recurrenceId;

    // Only master events should be marked as recurring
    const isMaster = isRecurring && !isInstance;

    // Create a partial CalendarEvent object
    return {
      id: uid,
      feedId: "", // This would need to be set when saving to the database
      externalEventId: uid,
      title: summary ? String(summary) : "Untitled Event",
      description: description ? String(description) : null,
      start: startDate,
      end: endDate,
      location: location ? String(location) : null,
      isRecurring: isMaster, // Only master events are recurring
      recurrenceRule: isRecurring
        ? vevent.getFirstPropertyValue("rrule")
        : null,
      allDay: isAllDay,
      status: null,
      sequence: null,
      created: null,
      lastModified: null,
      organizer: null,
      attendees: null,
      createdAt: newDate(),
      updatedAt: newDate(),
      isMaster: isMaster,
      masterEventId: isInstance ? uid.split("_")[0] : null,
      recurringEventId: isInstance ? uid : null,
    } as CalendarEvent;
  } catch (error) {
    logger.error(
      "Failed to convert VEVENT to CalendarEvent",
      {
        error: error instanceof Error ? error.message : "Unknown error",
      },
      LOG_SOURCE
    );

    // Return a minimal event as fallback
    return {
      id: crypto.randomUUID(),
      feedId: "",
      title: "Error parsing event",
      start: newDate(),
      end: newDate(),
      createdAt: newDate(),
      updatedAt: newDate(),
      allDay: false,
      isRecurring: false,
      isMaster: false,
    } as CalendarEvent;
  }
}

/**
 * Checks if a VEVENT component represents an all-day event
 * @param vevent VEVENT component to check
 * @returns true if the event is an all-day event
 */
export function isAllDayEvent(vevent: ICAL.Component): boolean {
  try {
    // Get the dtstart property
    const dtstart = vevent.getFirstProperty("dtstart");
    if (!dtstart) return false;

    // Check if the value parameter is "date"
    if (dtstart.getParameter("value") === "date") return true;

    // Check if the jCal type is "date"
    if (dtstart.jCal && dtstart.jCal[2] === "date") return true;

    // Check for a duration of P1D which is common for all-day events
    const duration = vevent.getFirstProperty("duration");
    if (duration) {
      const durationValue = duration.getFirstValue();
      if (typeof durationValue === "string" && durationValue === "P1D") {
        return true;
      }
    }

    return false;
  } catch (error) {
    logger.warn(
      "Error checking if event is all-day",
      {
        error: error instanceof Error ? error.message : "Unknown error",
      },
      LOG_SOURCE
    );
    return false;
  }
}
