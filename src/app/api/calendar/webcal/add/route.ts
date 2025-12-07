import { NextRequest, NextResponse } from "next/server";

import { formatISO } from "date-fns";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { newDate } from "@/lib/date-utils";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { WebCalCalendarService } from "@/lib/webcal-calendar";

import { fetchWebCalInfo } from "../utils";

const LOG_SOURCE = "WebCalAdd";

/**
 * API route for adding a new WebCal
 * POST /api/calendar/webcal/add
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request, LOG_SOURCE);
    if ("response" in auth) {
      return auth.response;
    }

    const userId = auth.userId;

    const json = await request.json();
    const { webCalUrl, calendarId } = json;

    if (!webCalUrl) {
      logger.error(
        "Missing required fields for adding Web calendar",
        { webCalUrl: !!webCalUrl },
        LOG_SOURCE
      );
      return NextResponse.json(
        { error: "Web calendar URL is required" },
        { status: 400 }
      );
    }

    logger.info(`Fetching Webcal from ${webCalUrl}`, {}, LOG_SOURCE);

    try {
      // Fetch WebCal using exported func from utils
      const webCal = await fetchWebCalInfo(webCalUrl);
      const webCalHeaders = webCal.headerInfo;

      if (!webCalHeaders.get("content-type")?.startsWith("text/calendar")) {
        logger.error(
          `WebCal not found at ${webCalUrl}`,
          { webCalUrl },
          LOG_SOURCE
        );
        return NextResponse.json(
          { error: "WebCal not found" },
          { status: 404 }
        );
      }

      // Parse webcal for the Calendar name
      const webCalParsed: string[] = webCal.webCalText.split(/[\r\n:]+/, 8);
      const webCalName: string = webCalParsed[7];

      const existingWebCal = await prisma.calendarFeed.findFirst({
        where: {
          url: webCalUrl,
          userId,
          id: calendarId,
          name: webCalName,
        },
      });

      if (existingWebCal) {
        logger.info(
          `Calendar already exists: ${calendarId}`,
          { userId, webCalUrl, webCalName },
          LOG_SOURCE
        );
        return NextResponse.json({
          success: true,
          webCal: {
            id: existingWebCal.id,
            name: existingWebCal.name,
            color: existingWebCal.color,
            url: existingWebCal.url,
          },
        });
      }

      // Add the webcal to the DB
      const webCalColor = "#BF616A";
      const newWebCalendar = await prisma.calendarFeed.create({
        data: {
          name: webCalName,
          color: webCalColor,
          type: "WEBCAL",
          url: webCalUrl,
          userId,
          enabled: true,
          lastSync: formatISO(new Date()),
        },
      });

      logger.info(
        `Successfully added Webcal subscription: ${newWebCalendar.id}`,
        { name: newWebCalendar.name, id: newWebCalendar.id },
        LOG_SOURCE
      );

      // Perform initial sync
      try {
        logger.info(
          `Performing initial sync of Webcalendar: ${newWebCalendar.name}`,
          { id: newWebCalendar.id },
          LOG_SOURCE
        );

        const feed = await prisma.calendarFeed.findFirst({
          where: {
            id: calendarId,
            url: webCalUrl,
            type: "WEBCAL",
            userId,
          },
        });

        if (!feed) {
          throw new Error(`Calendar feed not found for WebCal: ${webCalUrl}`);
        }

        // Process events and update database - currently BROKEN
        const webCalService = new WebCalCalendarService(feed);
        await webCalService.syncCalendar(newWebCalendar.id, webCalUrl, userId);

        await prisma.calendarFeed.update({
          where: { id: newWebCalendar.id, userId },
          data: {
            lastSync: newDate(),
          },
        });

        logger.info(
          `Initial sync completed for Web calendar: ${newWebCalendar.id}`,
          { id: newWebCalendar.id },
          LOG_SOURCE
        );
      } catch (syncError) {
        logger.error(
          `Failed to perform initial sync of Web calendar: ${newWebCalendar.id}`,
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
        webCal: {
          id: newWebCalendar.id,
          name: newWebCalendar.name,
          color: newWebCalendar.color,
          url: newWebCalendar.url,
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
          error: "Failed to add WebCal calendar",
          details: error instanceof Error ? error.message : String(error),
        },
        { status: 500 }
      );
    }
  } catch (error) {
    logger.error(
      "Error in WebCal calendar route",
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
