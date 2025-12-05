import { CalendarEvent, CalendarFeed, Prisma } from "@prisma/client";
import ICAL from "ical.js";

// import { DAVDepth } from "tsdav";
import { newDate, newDateFromYMD } from "@/lib/date-utils";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

// import { CalendarEventWithFeed } from "@/types/calendar";
import { convertVEventToCalendarEvent } from "./caldav-helpers";
import {
  // CalendarEventInput,
  CalendarQueryParams,
  SyncResult,
  WebCalClient,
} from "./webcal-interfaces";

const LOG_SOURCE = "WebCalCalendar";

/**
 * Service for interacting with Webcal data
 */
export class WebCalCalendarService {
  private client: WebCalClient | null = null;

  /**
   * Creates a new Webcal calendar service
   * @param prisma Prisma client instance
   * @param feed The Webcal feed
   */
  constructor(private feed: CalendarFeed) {
    // Initialize client when needed
  }

  /**
   * Creates and initializes the Webcal client
   * @returns Initialized WebCalClient
   */
  private async getClient(): Promise<WebCalClient> {
    if (this.client) {
      return this.client;
    }

    if (!this.feed.url) {
      throw new Error("WebCal URL is required");
    }

    try {
      // Use type assertion to tell TypeScript this is our extended client type
      this.client = {
        url: this.feed.url,
        id: this.feed.id,
      } as unknown as WebCalClient;

      return this.client;
    } catch (error) {
      logger.error(
        "Failed to create Webcal client",
        {
          error: error instanceof Error ? error.message : "Unknown error",
          id: this.feed.id,
        },
        LOG_SOURCE
      );
      throw error;
    }
  }

  private async expandRecurringEvents(
    masterEvents: CalendarEvent[]
  ): Promise<CalendarEvent[]> {
    const instances: CalendarEvent[] = [];
    for (const masterEvent of masterEvents) {
      if (masterEvent.isRecurring) {
        const instanceEvents = await this.expandMasterEvent(masterEvent);
        instances.push(...instanceEvents);
      }
    }
    return instances;
  }

  private async expandMasterEvent(
    masterEvent: CalendarEvent
  ): Promise<CalendarEvent[]> {
    //todo expand master event locally and return all instances
    if (!masterEvent.isRecurring || !masterEvent.recurrenceRule) {
      return [];
    }

    try {
      // Import RRule from the rrule library
      const { RRule } = await import("rrule");

      // Define the time range for expansion (1 year back to 1 year ahead)
      const timeRange = this.getTimeRange();

      // Parse the recurrence rule
      const options = RRule.parseString(masterEvent.recurrenceRule);

      // Set the start date from the master event
      options.dtstart = masterEvent.start;

      // Create the RRule instance
      const rule = new RRule(options);

      // Get all occurrences between the start and end dates
      const occurrences = rule.between(timeRange.start, timeRange.end, true);

      // Create instance events for each occurrence
      const instanceEvents: CalendarEvent[] = occurrences
        .map((date) => {
          // Calculate the duration of the master event
          const duration =
            masterEvent.end.getTime() - masterEvent.start.getTime();

          // Create a new end date for this instance
          const endDate = new Date(date.getTime() + duration);

          // Create the instance event
          return {
            ...masterEvent,
            externalEventId: masterEvent.externalEventId,
            start: date,
            end: endDate,
            isRecurring: true,
            recurrenceRule: masterEvent.recurrenceRule,
            isMaster: false,
            recurringEventId: masterEvent.externalEventId,
          };
        })
        .filter(Boolean) as CalendarEvent[];

      return instanceEvents;
    } catch (error) {
      logger.error(
        "Failed to expand master event",
        {
          error: error instanceof Error ? error.message : "Unknown error",
          eventId: masterEvent.id,
          title: masterEvent.title,
          recurrenceRule: masterEvent.recurrenceRule,
        },
        LOG_SOURCE
      );
      return [];
    }
  }

  /**
   * Fetches events from a web calendar for a specific time range
   * @param start Start date
   * @param end End date
   * @param webcalUrl URL of the calendar
   * @returns Array of calendar events
   */
  private async getEvents(
    start: Date,
    end: Date,
    webcalUrl: string
  ): Promise<CalendarEvent[]> {
    try {
      const client = await this.getClient();
      if (!client) return [];

      // Fetch master events (without expand)
      const masterEvents = await this.fetchMasterEvents(
        client,
        start,
        end,
        webcalUrl
      );

      const instanceEvents = await this.expandRecurringEvents(masterEvents);

      const allEvents = [...masterEvents, ...instanceEvents];
      return allEvents;
    } catch (error) {
      logger.error(
        "Failed to fetch WebCal events",
        {
          error: error instanceof Error ? error.message : "Unknown error",
          id: this.feed.id,
          webcalUrl,
        },
        LOG_SOURCE
      );
      return [];
    }
  }

  /**
   * Format a date for CalDAV requests (YYYYMMDDTHHMMSSZ)
   * @param date Date to format
   * @returns Formatted date string
   */
  private formatDateForCalDAV(date: Date): string {
    return date
      .toISOString()
      .replace(/[-:]/g, "")
      .replace(/\.\d{3}/, "");
  }

  /**
   * Fetch master events from the Webcal data
   * @param client Webcal client
   * @param start Start date
   * @param end End date
   * @param webcalUrl The webcal URL
   * @returns Array of master events
   */
  private async fetchMasterEvents(
    client: WebCalClient,
    start: Date,
    end: Date,
    webcalUrl: string
  ): Promise<CalendarEvent[]> {
    // Create query parameters for master events
    const queryParams = this.createWebCalQueryParams(
      webcalUrl,
      start,
      end,
      false // Don't use expand for master events
    );

    // Fetch webcal data
    const webcalData = await client.calendarQuery(queryParams);

    // Process the calendar objects to extract master events
    return await this.processWebcalData(webcalData);
  }

  /**
   * Create Webcal query parameters
   * @param webcalUrl URL of the web calendar
   * @param start Start date
   * @param end End date
   * @param useExpand Whether to use the expand parameter
   * @returns Webcal query parameters
   */
  private createWebCalQueryParams(
    webcalUrl: string,
    start: Date,
    end: Date,
    useExpand: boolean
  ): CalendarQueryParams {
    const props: Record<string, unknown> = {
      "calendar-data": useExpand
        ? {
            expand: {
              _attributes: {
                start: this.formatDateForCalDAV(start),
                end: this.formatDateForCalDAV(end),
              },
            },
          }
        : {}, // No expand for master events
    };

    return {
      url: webcalUrl,
      props,
      filters: {
        "comp-filter": {
          _attributes: {
            name: "VCALENDAR",
          },
          "comp-filter": {
            _attributes: {
              name: "VEVENT",
            },
            "time-range": {
              _attributes: {
                start: this.formatDateForCalDAV(start),
                end: this.formatDateForCalDAV(end),
              },
            },
          },
        },
      },
      depth: "1",
    };
  }

  /**
   * Process calendar data from the ICS data
   * @param webcalData The data
   * @param mode Whether to prioritize master events or instance events
   * @returns Array of calendar events
   */
  private async processWebcalData(
    webcalData: Response[]
  ): Promise<CalendarEvent[]> {
    const events: CalendarEvent[] = [];
    // Track UIDs to avoid duplicates
    const processedUids = new Set<string>();

    // Convert Response objects to CalDAVCalendarObject format
    // const calendarData = this.extractCalendarData(calendarObjects);

    for (const data of webcalData) {
      try {
        // Parse the iCalendar data
        const vevents = this.parseICalData(await data.text(), data.url);
        if (!vevents || vevents.length === 0) continue;

        // Process each VEVENT component
        for (const vevent of vevents) {
          // Extract event properties
          const { uid, hasRRule, hasRecurrenceId } =
            this.extractEventProperties(vevent);

          // Convert VEVENT to CalendarEvent
          const event = convertVEventToCalendarEvent(vevent);

          // Set event properties based on its type
          this.setEventTypeProperties(
            event,
            uid,
            hasRRule,
            hasRecurrenceId,
            processedUids
          );
          events.push(event);
        }
      } catch (error) {
        logger.error(
          "Failed to process webcal data",
          {
            error: error instanceof Error ? error.message : "Unknown error",
            url: data.url || "unknown",
          },
          LOG_SOURCE
        );
      }
    }

    return events;
  }

  /**
   * Extract calendar data from DAVResponse objects
   * @param calendarObjects Calendar objects returned by the server
   * @returns Array of calendar objects
   */
  // private extractCalendarData(
  //   webcalData: Response[]
  // ): Response[] {
  //   return webcalData.map((obj: Response) => {
  //     // Get calendar data, which might be in different formats
  //     const webcalDataProp =
  //       obj.props?.["calendar-data"] || obj.props?.calendarData || "";
  //
  //     return {
  //       url: || "",
  //       etag: obj.props?.getetag || "",
  //       data: webcalDataProp,
  //     };
  //   });
  // }

  /**
   * Extract iCalendar data from a calendar object
   * @param obj Calendar object
   * @returns iCalendar data as string, or empty string if extraction fails
   */
  // private extractICalData(obj: WebCalCalendarObject): string {
  //   let icalData = "";
  //   if (typeof obj.data === "string") {
  //     icalData = obj.data;
  //   } else if (typeof obj.data === "object" && obj.data !== null) {
  //     // Try to get _cdata property if it exists
  //     const dataObj = obj.data as Record<string, unknown>;
  //     if ("_cdata" in dataObj && typeof dataObj._cdata === "string") {
  //       icalData = dataObj._cdata;
  //     } else {
  //       // Try to stringify the object as a fallback
  //       try {
  //         icalData = JSON.stringify(obj.data);
  //       } catch (error) {
  //         logger.warn(
  //           "Failed to stringify calendar data",
  //           {
  //             url: obj.url,
  //             error: error instanceof Error ? error.message : "Unknown error",
  //           },
  //           LOG_SOURCE
  //         );
  //         return ""; // Return empty string to indicate failure
  //       }
  //     }
  //   }
  //
  //   if (!icalData) {
  //     logger.warn(
  //       "Empty iCalendar data",
  //       { url: obj.url || "unknown" },
  //       LOG_SOURCE
  //     );
  //   }
  //
  //   return icalData;
  // }

  /**
   * Parse iCalendar data and extract VEVENT components
   * @param icalData iCalendar data as string
   * @param url URL of the calendar object (for logging)
   * @returns Array of VEVENT components
   */
  private parseICalData(
    icalData: string,
    url: string
  ): ICAL.Component[] | null {
    try {
      const jcalData = ICAL.parse(icalData);
      const vcalendar = new ICAL.Component(jcalData);
      const vevents = vcalendar.getAllSubcomponents("vevent");
      return vevents;
    } catch (error) {
      logger.error(
        "Failed to parse iCalendar data",
        {
          error: error instanceof Error ? error.message : "Unknown error",
          url,
        },
        LOG_SOURCE
      );
      throw error;
    }
  }

  /**
   * Synchronizes a Web calendar with the local database
   * @param webcalUrl Calendar URL
   * @returns Sync result with added, updated, and deleted events
   */
  async syncCalendar(
    id: string,
    webcalUrl: string,
    userId: string
  ): Promise<SyncResult> {
    try {
      // Get the calendar feed from the database
      const feed = await prisma.calendarFeed.findFirst({
        where: {
          id,
          url: webcalUrl,
          type: "WEBCAL",
          userId,
        },
      });

      if (!feed) {
        throw new Error(`Calendar feed not found for WebCal: ${webcalUrl}`);
      }
      //delete all events from the database
      await prisma.calendarEvent.deleteMany({
        where: {
          feedId: feed.id,
        },
      });

      // Get existing events for this feed
      // const existingEvents = await this.getExistingEvents(feed.id);

      // Define time range for events (1 year back to 1 year ahead)
      const timeRange = this.getTimeRange();

      // Fetch events from CalDAV server
      const events = await this.getEvents(
        timeRange.start,
        timeRange.end,
        webcalUrl
      );

      // Process events and update database
      // const result = await this.processEvents(events, existingEvents, feed.id);

      const result = await this.createAllEvents(events, feed.id);
      // Update the feed's last sync time and sync token
      await prisma.calendarFeed.update({
        where: { id: feed.id, userId },
        data: {
          lastSync: newDate(),
          syncToken: feed.syncToken ? String(feed.syncToken) : null,
        },
      });

      return result;
    } catch (error) {
      logger.error(
        "Failed to sync Webcal calendar",
        {
          error: error instanceof Error ? error.message : "Unknown error",
          webcalUrl,
          accountId: this.feed.accountId,
        },
        LOG_SOURCE
      );
      throw error;
    }
  }

  /**
   * Define time range for events (1 year back to 1 year ahead)
   * @returns Object with start and end dates
   */
  private getTimeRange(): { start: Date; end: Date } {
    const now = newDate();
    return {
      start: newDateFromYMD(now.getFullYear() - 1, 0, 1), // 1 year ago, January 1st
      end: newDateFromYMD(now.getFullYear() + 1, 11, 31), // End of next year
    };
  }

  private async createAllEvents(
    events: CalendarEvent[],
    feedId: string
  ): Promise<SyncResult> {
    try {
      // Separate master events and instances
      const masterEvents = events.filter((e) => e.isMaster);
      const instanceEvents = events.filter((e) => !e.isMaster);

      // Create master events first
      const createdMasterEvents = await this.createMasterEvents(
        masterEvents,
        feedId
      );

      // Create a map of external IDs to database IDs for linking instances
      const masterEventMap = new Map<string, string>();
      for (const event of createdMasterEvents) {
        if (event.externalEventId) {
          masterEventMap.set(event.externalEventId, event.id);
        }
      }

      // Create instance events with proper links to master events
      const createdInstanceEvents = await this.createInstanceEvents(
        instanceEvents,
        masterEventMap,
        feedId
      );

      return {
        added: [...createdMasterEvents, ...createdInstanceEvents],
        updated: [],
        deleted: [],
      };
    } catch (error) {
      logger.error(
        "Failed to create WebCal events",
        {
          error: error instanceof Error ? error.message : "Unknown error",
          feedId,
        },
        LOG_SOURCE
      );
      return { added: [], updated: [], deleted: [] };
    }
  }

  private async createMasterEvents(
    masterEvents: CalendarEvent[],
    feedId: string
  ): Promise<CalendarEvent[]> {
    const createdEvents: CalendarEvent[] = [];

    // Process events in batches to avoid potential issues with large datasets
    for (const event of masterEvents) {
      try {
        // Prepare event data for database
        const eventData = {
          feedId,
          externalEventId: event.externalEventId,
          title: event.title || "Untitled Event",
          description: event.description,
          start: event.start,
          end: event.end,
          location: event.location,
          isRecurring: event.isRecurring || false,
          recurrenceRule: event.recurrenceRule,
          allDay: event.allDay || false,
          status: event.status,
          isMaster: true,
          masterEventId: null,
          recurringEventId: null,
          // Use Prisma.JsonNull for JSON fields
          organizer: Prisma.JsonNull,
          attendees: Prisma.JsonNull,
        };

        // Create the event
        const createdEvent = await prisma.calendarEvent.create({
          data: eventData,
        });

        createdEvents.push(createdEvent);
      } catch (error) {
        logger.error(
          "Failed to create master event",
          {
            error: error instanceof Error ? error.message : "Unknown error",
            eventId: event.id,
            title: event.title,
          },
          LOG_SOURCE
        );
      }
    }

    return createdEvents;
  }

  private async createInstanceEvents(
    instanceEvents: CalendarEvent[],
    masterEventMap: Map<string, string>,
    feedId: string
  ): Promise<CalendarEvent[]> {
    const createdEvents: CalendarEvent[] = [];

    // Process events in batches to avoid potential issues with large datasets
    for (const event of instanceEvents) {
      try {
        // Find the master event ID for this instance
        let masterEventId = null;
        if (
          event.recurringEventId &&
          masterEventMap.has(event.recurringEventId)
        ) {
          masterEventId = masterEventMap.get(event.recurringEventId) || null;
        }

        // Prepare event data for database
        const eventData = {
          feedId,
          externalEventId: event.externalEventId,
          title: event.title || "Untitled Event",
          description: event.description,
          start: event.start,
          end: event.end,
          location: event.location,
          isRecurring: event.isRecurring || false, // Instance events are not recurring themselves
          recurrenceRule: event.recurrenceRule, // Instance events don't have recurrence rules
          allDay: event.allDay || false,
          status: event.status,
          isMaster: false,
          masterEventId,
          recurringEventId: event.recurringEventId,
          // Use Prisma.JsonNull for JSON fields
          organizer: Prisma.JsonNull,
          attendees: Prisma.JsonNull,
        };

        // Create the event
        const createdEvent = await prisma.calendarEvent.create({
          data: eventData,
        });

        createdEvents.push(createdEvent);
      } catch (error) {
        logger.error(
          "Failed to create instance event",
          {
            error: error instanceof Error ? error.message : "Unknown error",
            eventId: event.id,
            title: event.title,
            recurringEventId: event.recurringEventId,
          },
          LOG_SOURCE
        );
      }
    }

    return createdEvents;
  }

  /**
   * Extract key properties from a VEVENT component
   * @param vevent VEVENT component
   * @returns Object with extracted properties
   */
  private extractEventProperties(vevent: ICAL.Component): {
    uid: string;
    hasRRule: boolean;
    hasRecurrenceId: boolean;
    summary: string | null;
  } {
    const hasRRule = vevent.hasProperty("rrule");
    const hasRecurrenceId = vevent.hasProperty("recurrence-id");
    const uidValue = vevent.getFirstPropertyValue("uid");
    const uid = uidValue ? String(uidValue) : crypto.randomUUID();
    const summary = vevent.getFirstPropertyValue("summary");

    return {
      uid,
      hasRRule,
      hasRecurrenceId,
      summary: summary ? String(summary) : null,
    };
  }

  /**
   * Set event properties based on its type (master, instance, or standalone)
   * @param event The event to update
   * @param uid The event's UID
   * @param hasRRule Whether the event has a recurrence rule
   * @param hasRecurrenceId Whether the event has a recurrence ID
   * @param processedUids Set of already processed UIDs
   */
  private setEventTypeProperties(
    event: CalendarEvent,
    uid: string,
    hasRRule: boolean,
    hasRecurrenceId: boolean,
    processedUids: Set<string>
  ): void {
    // Set event properties based on its type
    if (hasRRule && !hasRecurrenceId) {
      // Master event
      event.isMaster = true;
      event.isRecurring = true;
      event.masterEventId = null;
      event.externalEventId = uid;
      processedUids.add(uid);
    } else if (hasRecurrenceId) {
      // Instance event
      event.isMaster = false;
      event.isRecurring = false;
      // For instance events, we need to link to the master event
      // The master event's UID is the base part of the instance's UID (before any _date suffix)
      const masterUid = uid.split("_")[0];
      event.masterEventId = masterUid;
      // For instance events, we append the date to make the ID unique
      const instanceDate = event.start.toISOString().split("T")[0];
      event.externalEventId = `${masterUid}_${instanceDate}`;
      processedUids.add(event.externalEventId);
    } else {
      // Standalone event
      event.isMaster = false;
      event.isRecurring = false;
      event.masterEventId = null;
      event.externalEventId = uid;
      processedUids.add(uid);
    }
  }
}
