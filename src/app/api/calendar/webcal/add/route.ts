import { NextRequest, NextResponse } from "next/server";

import { formatISO } from "date-fns";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { newDate } from "@/lib/date-utils";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { WebCalCalendarService } from "@/lib/webcal-calendar";

import { fetchWebCalendar, parseWebCal } from "../utils";

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
    const { webcalUrl, calendarId } = json;

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

    logger.info(`Fetching Webcal from ${webcalUrl}`, {}, LOG_SOURCE);

    try {
      // Fetch WebCal using exported func from utils
      const webCal = await fetchWebCalendar(webcalUrl);
      const webcalHeaders = webCal.headers;

      if (!webcalHeaders.get("content-type")?.startsWith("text/calendar")) {
        logger.error(
          `WebCal not found at ${webcalUrl}`,
          { webcalUrl },
          LOG_SOURCE
        );
        return NextResponse.json(
          { error: "WebCal not found" },
          { status: 404 }
        );
      }

      const existingWebCal = await prisma.calendarFeed.findFirst({
        where: {
          url: webcalUrl,
          userId,
          id: calendarId,
        },
      });

      if (existingWebCal) {
        logger.info(
          `Calendar already exists: ${calendarId}`,
          { userId, webcalUrl },
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

      // Parse webcal for some info
      const webCalText = parseWebCal(await webCal.text());

      // Add the webcal to the DB
      const webcalName = webCalText.webCalName;
      const webcalColor = "#BF616A";
      const newWebCalendar = await prisma.calendarFeed.create({
        data: {
          name: webcalName,
          color: webcalColor,
          type: "WEBCAL",
          url: webcalUrl,
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
            url: webcalUrl,
            type: "WEBCAL",
            userId,
          },
        });

        if (!feed) {
          throw new Error(`Calendar feed not found for WebCal: ${webcalUrl}`);
        }

        // Process events and update database
        const webCalService = new WebCalCalendarService(feed);
        await webCalService.syncCalendar(newWebCalendar.id, webcalUrl, userId);

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
