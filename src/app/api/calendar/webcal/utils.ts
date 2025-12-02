// import ICAL from "ical.js";
import { logger } from "@/lib/logger";

const LOG_SOURCE = "WebcalUtils";

/**
 * Helper function to ensure a URL is properly formatted
 * @param baseUrl The base URL (e.g., https://caldav.fastmail.com)
 * @param path The path to append (e.g., /dav/calendars/user/email/)
 * @returns A properly formatted absolute URL
 */
export function formatAbsoluteUrl(baseUrl: string, path?: string): string {
  // If no path, ensure baseUrl is a valid URL
  if (!path) {
    try {
      // Validate that baseUrl is a valid URL
      new URL(baseUrl);
      return baseUrl;
    } catch {
      // If baseUrl is not a valid URL, try to fix it
      if (!baseUrl.startsWith("http")) {
        return `https://${baseUrl}`;
      }
      throw new Error(`Invalid base URL: ${baseUrl}`);
    }
  }

  // If path is already an absolute URL, validate and return it
  if (path.startsWith("http")) {
    try {
      // Validate that path is a valid URL
      new URL(path);
      return path;
    } catch {
      throw new Error(`Invalid URL in path: ${path}`);
    }
  }

  // Ensure baseUrl doesn't end with a slash if path starts with one
  const base =
    baseUrl.endsWith("/") && path.startsWith("/")
      ? baseUrl.slice(0, -1)
      : baseUrl;

  // Ensure path starts with a slash
  const pathWithSlash = path.startsWith("/") ? path : `/${path}`;

  // Construct the full URL
  const fullUrl = `${base}${pathWithSlash}`;

  // Validate the constructed URL
  try {
    new URL(fullUrl);
    return fullUrl;
  } catch {
    // If the URL is invalid, try to fix it
    if (!fullUrl.startsWith("http")) {
      const fixedUrl = `https://${fullUrl}`;
      try {
        new URL(fixedUrl);
        return fixedUrl;
      } catch {
        throw new Error(
          `Could not create valid URL from: ${base} and ${pathWithSlash}`
        );
      }
    }
    throw new Error(
      `Invalid URL constructed from: ${base} and ${pathWithSlash}`
    );
  }
}

/**
 * Fetches ICS from a public server
 * @param webcalUrl the URL
 * @returns A promise that resolves to the list of calendars
 */
export async function fetchWebCalendar(webcalUrl: string) {
  try {
    // Fetch the ICS file
    const calendarResponse = await fetch(webcalUrl);
    return calendarResponse.json();
    // const icsText = await calendar.text();
    // const events = parseWebCal(icsText);
    // return events;
  } catch (error) {
    logger.error(
      "WebCalendar fetch failed",
      {
        error: error instanceof Error ? error.message : String(error),
      },
      LOG_SOURCE
    );
    throw error;
  }
}

// function parseWebCal(icsText: string) {
//   // Parse the ICS text into a jCal object (ical.js format)
//   const jcalData = ICAL.parse(icsText);
//   const comp = new ICAL.Component(jcalData);
//
//   // Extract all VEVENT components (events)
//   const events = comp.getAllSubcomponents("vevent").map((vevent) => {
//     // Convert vevent to an ICAL.Event object for easier access
//     const event = new ICAL.Event(vevent);
//
//     // Map ICS properties to FullCalendar event format
//     return {
//       id: event.uid, // Unique ID (from ICS UID)
//       title: event.summary || "Untitled Event", // Event title
//       color: event.color || "#5E81AC",
//       start: event.startDate.toJSDate(), // Start time (convert to JS Date)
//       end: event.endDate ? event.endDate.toJSDate() : null, // End time (optional)
//       description: event.description || "", // Event description
//       location: event.location || "", // Event location
//       isRecurring: event.isRecurring,
//       isRecurrenceException: event.isRecurrenceException,
//       // Add more fields (e.g., url, color) as needed
//     };
//   });
//   return events;
// }
