import { CalendarEvent, CalendarFeed, Prisma } from "@prisma/client";
import ICAL from "ical.js";

import { newDate } from "@/lib/date-utils";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

import { convertWebCalEvent } from "./webcal-helpers";
import { SyncResult, WebCalClient } from "./webcal-interfaces";

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

  /**
   * Fetches events from a web calendar for a specific time range
   * @param start Start date
   * @param end End date
   * @param webCalUrl URL of the calendar
   * @returns Array of calendar events
   */
  private async getEvents(webCalUrl: string): Promise<CalendarEvent[]> {
    try {
      const client = await this.getClient();
      if (!client) return [];

      // Fetch master events (without expand)
      const allEvents = await this.fetchWebCalData(client, webCalUrl);
      return await this.processWebcalData(allEvents);
    } catch (error) {
      logger.error(
        "Dammit! Failed to fetch WebCal events",
        {
          error: error instanceof Error ? error.message : "Unknown error",
          id: this.feed.id,
          webCalUrl,
        },
        LOG_SOURCE
      );
      return [];
    }
  }

  /**
   * Fetch Webcal data from URL
   * @param client WebCal client
   * @param webCalUrl The URL
   * @returns Array of calendar events maybe?
   */
  private async fetchWebCalData(
    client: WebCalClient,
    webCalUrl: string
  ): Promise<Response[]> {
    const webCalData = await client.fetchWebCalInfo(webCalUrl);
    return webCalData;
  }

  /**
   * Process calendar data from the ICS data
   * @param webcalData The data
   * @param mode Whether to prioritize master events or instance events
   * @returns Array of calendar events
   */
  private async processWebcalData(
    webCalResponse: Response[]
  ): Promise<CalendarEvent[]> {
    const events: CalendarEvent[] = [];
    // Track UIDs to avoid duplicates
    const processedUids = new Set<string>();

    // Convert Response object to String
    const webCalData = webCalResponse.toString();

    try {
      // Parse the iCalendar data
      const vevents = this.parseICalData(webCalData);
      // if (!vevents || vevents.length === 0) continue;

      // Process each VEVENT component
      for (const vevent of vevents as ICAL.Component[]) {
        // Extract event properties
        const { uid, hasRRule, hasRecurrenceId } =
          this.extractEventProperties(vevent);

        // Convert VEVENT to CalendarEvent
        const event = convertWebCalEvent(vevent);

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
          // url: webCalResponse.url || "unknown",
        },
        LOG_SOURCE
      );
    }
    return events;
  }

  /**
   * Parse iCalendar data and extract VEVENT components
   * @param icalData iCalendar data as string
   * @param url URL of the calendar object (for logging)
   * @returns Array of VEVENT components
   */
  private parseICalData(
    webCalData: string
    // webCalUrl: string
  ): ICAL.Component[] | null {
    try {
      const jcalData = ICAL.parse(webCalData);
      const vcalendar = new ICAL.Component(jcalData);
      const vevents = vcalendar.getAllSubcomponents("vevent");
      return vevents;
    } catch (error) {
      logger.error(
        "Failed to parse iCalendar data",
        {
          error: error instanceof Error ? error.message : "Unknown error",
          // webCalUrl,
        },
        LOG_SOURCE
      );
      throw error;
    }
  }

  /**
   * Synchronizes a Web calendar with the local database
   * @param webCalUrl Calendar URL
   * @returns Sync result with added, updated, and deleted events
   */
  async syncCalendar(
    id: string,
    webCalUrl: string,
    userId: string
  ): Promise<SyncResult> {
    try {
      // Get the calendar feed from the database
      const feed = await prisma.calendarFeed.findFirst({
        where: {
          id,
          url: webCalUrl,
          type: "WEBCAL",
          userId,
        },
      });

      if (!feed) {
        throw new Error(`Calendar feed not found for WebCal: ${webCalUrl}`);
      }
      //delete all events from the database
      await prisma.calendarEvent.deleteMany({
        where: {
          feedId: feed.id,
        },
      });

      // Get existing events for this feed
      // const existingEvents = await this.getExistingEvents(feed.id);

      // Fetch events from webcal
      const events = await this.getEvents(webCalUrl);

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
          webCalUrl: this.feed.url,
          accountId: this.feed.accountId,
        },
        LOG_SOURCE
      );
      throw error;
    }
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
