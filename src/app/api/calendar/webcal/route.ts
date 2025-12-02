import { NextRequest, NextResponse } from "next/server";

import { formatISO } from "date-fns";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { newDate } from "@/lib/date-utils";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { WebCalCalendarService } from "@/lib/webcal-calendar";

import { fetchWebCalendar } from "./utils";

const LOG_SOURCE = "WebCalendar";

/**
 * API route for adding a webcal subscription
 * POST /api/calendar/webcal
 * Body: { calendarUrl, name, color }
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request, LOG_SOURCE);
    if ("response" in auth) {
      return auth.response;
    }

    const userId = auth.userId;

    const json = await request.json();
    const { webcalUrl, calendarId } = json;

    // Validate required fields
    if (!webcalUrl) {
      logger.error(
        "Missing required fields for adding Web calendar",
        { webcalUrl: !!webcalUrl },
        LOG_SOURCE
      );
      return NextResponse.json(
        { error: "Web calendar URL is required" },
        { status: 400 }
      );
    }

    logger.info(`Adding WebCal`, {}, LOG_SOURCE);

    try {
      // Fetch calendars to verify the calendar URL exists
      const calendar = await fetchWebCalendar(webcalUrl);

      // const calendar = calendars.find((cal) => cal.url === calendarId);
      if (!calendar.ok) {
        logger.error(
          `Calendar not found at ${webcalUrl}`,
          { webcalUrl },
          LOG_SOURCE
        );
        return NextResponse.json(
          { error: "Calendar not found" },
          { status: 404 }
        );
      }

      const existingCalendar = await prisma.calendarFeed.findFirst({
        where: {
          url: webcalUrl,
          userId,
          id: calendarId,
        },
      });

      if (existingCalendar) {
        logger.info(
          `Calendar already exists: ${calendarId}`,
          { userId, webcalUrl },
          LOG_SOURCE
        );
        return NextResponse.json({
          success: true,
          calendar: {
            id: existingCalendar.id,
            name: existingCalendar.name,
            color: existingCalendar.color,
            url: existingCalendar.url,
          },
        });
      }
      // Add the calendar to the database
      let calendarColor = calendar.color || "#BF616A";
      if (typeof calendarColor !== "string") {
        calendarColor = "#BF616A";
      }
      let calendarName = calendar.displayName || "Unnamed Calendar";
      if (typeof calendarName !== "string") {
        calendarName = "Unnamed Calendar";
      }
      const newCalendar = await prisma.calendarFeed.create({
        data: {
          name: calendarName,
          color: calendarColor,
          type: "WEBCAL",
          url: webcalUrl,
          userId,
          enabled: true,
          lastSync: formatISO(new Date()),
          syncToken: calendar.syncToken ? String(calendar.syncToken) : null,
        },
      });

      logger.info(
        `Successfully added Webcal subscription: ${newCalendar.id}`,
        { name: newCalendar.name, calendarId },
        LOG_SOURCE
      );

      // Perform initial sync of events
      try {
        logger.info(
          `Performing initial sync of Web calendar: ${newCalendar.id}`,
          { calendarId },
          LOG_SOURCE
        );
        const webcalService = new WebCalCalendarService(calendarId);
        await webcalService.syncCalendar(newCalendar.id, webcalUrl, userId);

        // Update the last sync time
        await prisma.calendarFeed.update({
          where: { id: newCalendar.id, userId },
          data: {
            lastSync: newDate(),
          },
        });

        logger.info(
          `Initial sync completed for Web calendar: ${newCalendar.id}`,
          { calendarId },
          LOG_SOURCE
        );
      } catch (syncError) {
        logger.error(
          `Failed to perform initial sync of Web calendar: ${newCalendar.id}`,
          {
            error:
              syncError instanceof Error
                ? syncError.message
                : String(syncError),
            calendarId,
          },
          LOG_SOURCE
        );
        // Don't return an error here, as we've already created the calendar
      }

      return NextResponse.json({
        success: true,
        calendar: {
          id: newCalendar.id,
          name: newCalendar.name,
          color: newCalendar.color,
          url: newCalendar.url,
        },
      });
    } catch (error) {
      logger.error(
        `Error adding WebCal calendar`,
        {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack || null : null,
        },
        LOG_SOURCE
      );
      return NextResponse.json(
        {
          error: "Failed to add CalDAV calendar",
          details: error instanceof Error ? error.message : String(error),
        },
        { status: 500 }
      );
    }
  } catch (error) {
    logger.error(
      "Error in CalDAV calendar route",
      {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack || null : null,
      },
      LOG_SOURCE
    );
    return NextResponse.json(
      {
        error: "An unexpected error occurred",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
