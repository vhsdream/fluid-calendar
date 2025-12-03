import { NextRequest, NextResponse } from "next/server";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

// import { fetchWebCalendar } from "../utils";

const LOG_SOURCE = "WebCalAvailable";

/**
 * API route for discovering and listing available Webcal calendars
 * GET /api/calendar/webcal/available?type=WEBCAL
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request, LOG_SOURCE);
    if ("response" in auth) {
      return auth.response;
    }

    const userId = auth.userId;

    const { searchParams } = new URL(request.url);
    const calendarType = searchParams.get("type");

    if (!calendarType) {
      logger.error("Missing calendarType parameter", {}, LOG_SOURCE);
      return NextResponse.json(
        { error: "Calendar type is required" },
        { status: 400 }
      );
    }
    if (calendarType !== "WEBCAL") {
      logger.error(
        `Calendar is wrong type: ${calendarType}`,
        { type: calendarType },
        LOG_SOURCE
      );
    }

    logger.info(`Fetching available web calendars`, {}, LOG_SOURCE);

    // Get all calendars of type WEBCAL from the database that belong to the current user
    const webCals = await prisma.calendarFeed.findMany({
      where: {
        type: "WEBCAL",
        userId,
        accountId: undefined,
      },
    });

    if (!webCals || !webCals.every((cal) => cal.type === "WEBCAL")) {
      logger.error(
        `No webcalendars found or you don't have permission to access them: ${userId}`,
        {},
        LOG_SOURCE
      );
      return NextResponse.json(
        {
          error:
            "No webcalendars found or you don't have permission to access them",
        },
        { status: 404 }
      );
    }

    // Ensure we have the required Webcal fields
    // const webCalFields = webCals.map((webCal) => ({
    //   url: webCal.url,
    //   name: webCal.name,
    //   id: webCal.id,
    // }));
    // if (!webCalFields. || !webCals.every(cal => cal.name) || !webCals.every(cal => cal.id)) {
    //   logger.error(
    //     `Missing required Webcal fields`,
    //     {
    //       hasUrl: !!webCals.url,
    //       hasName: !!webCal.name,
    //       hasId: !!webCal.id,
    //     },
    //     LOG_SOURCE
    //   );
    //   return NextResponse.json(
    //     { error: "Missing required Webcal fields" },
    //     { status: 400 }
    //   );
    // }

    // const webCalUrls = new Set(webCals.map((cal) => cal.url));

    // const formattedWebCalendars = webCals.map((cal) => ({
    //   id: cal.id,
    //   url: cal.url,
    //   name: cal.name || "Unnamed WebCalendar",
    //   color: cal.color || "#BF616A",
    //   alreadyAdded: webCalUrls.has(cal.url),
    //   // canEdit: false,
    // }));

    // try {
    //   // Get existing calendars for this account
    //   const existingCalendars = await prisma.calendarFeed.findMany({
    //     where: {
    //       accountId: null,
    //       type: "WEBCAL",
    //       userId,
    //     },
    //     select: {
    //       url: true,
    //     },
    //   });
    //
    //   const existingUrls = new Set(existingCalendars.map((cal) => cal.url));
    //
    //   // Format the calendars for the response
    //   const formattedCalendars = processedCalendars.map((cal) => ({
    //     id: cal.url, // Use url as id to match other providers
    //     url: cal.url,
    //     name: cal.displayName || "Unnamed Calendar",
    //     color: cal.calendarColor || "#4285F4",
    //     description: cal.description || "",
    //     alreadyAdded: existingUrls.has(cal.url),
    //     canEdit: true, // Assume all calendars can be edited for consistency with Outlook
    //   }));
    //
    //   logger.info(
    //     `Found ${calendars.length} available calendars for account: ${accountId}`,
    //     { alreadyAdded: existingCalendars.length },
    //     LOG_SOURCE
    //   );
    //
    //   // Return the array directly, consistent with Google and Outlook
    //   return NextResponse.json(
    //     formattedCalendars.filter((cal) => !cal.alreadyAdded)
    //   );
    // } catch (error) {
    //   logger.error(
    //     `Error fetching available calendars for account: ${accountId}`,
    //     {
    //       error: error instanceof Error ? error.message : String(error),
    //       stack: error instanceof Error ? error.stack || null : null,
    //     },
    //     LOG_SOURCE
    //   );
    //   return NextResponse.json(
    //     {
    //       error: "Failed to fetch available calendars",
    //       details: error instanceof Error ? error.message : String(error),
    //     },
    //     { status: 500 }
    //   );
    // }
  } catch (error) {
    logger.error(
      "Error in CalDAV available route",
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
