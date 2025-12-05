import { NextRequest, NextResponse } from "next/server";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { newDate } from "@/lib/date-utils";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { WebCalCalendarService } from "@/lib/webcal-calendar";

const LOG_SOURCE = "WebCalUpdateAPI";

/**
 * API route for updating a Web Calendar
 * PUT /api/calendar/webcal/update
 * Body: { feedId }
 */
export async function PUT(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req, LOG_SOURCE);
    if ("response" in auth) {
      return auth.response;
    }

    const userId = auth.userId;

    const body = await req.json();
    const { feedId } = body;

    logger.info(
      "Starting Webcal calendar sync",
      {
        feedId: String(feedId),
        timestamp: new Date().toISOString(),
      },
      LOG_SOURCE
    );

    if (!feedId) {
      return NextResponse.json(
        { error: "Calendar feed ID is required" },
        { status: 400 }
      );
    }

    // Get the calendar feed and account
    const feed = await prisma.calendarFeed.findUnique({
      where: {
        id: feedId,
        userId,
      },
    });

    if (!feed || feed.type !== "WEBCAL") {
      logger.error(
        "Invalid Webcal calendar",
        {
          feed: JSON.stringify(feed),
          timestamp: new Date().toISOString(),
        },
        LOG_SOURCE
      );
      return NextResponse.json(
        { error: "Invalid Webcal calendar" },
        { status: 400 }
      );
    }

    if (!feed.url) {
      logger.error(
        "Missing Webcal URL",
        {
          hasUrl: !!feed.url,
        },
        LOG_SOURCE
      );
      return NextResponse.json(
        { error: "Missing Webcal URL" },
        { status: 400 }
      );
    }

    // Create CalDAV service
    const webcalService = new WebCalCalendarService(feed);

    // Sync calendar
    try {
      await webcalService.syncCalendar(feed.id, feed.url, userId);
    } catch (syncError) {
      logger.error(
        "Failed to sync Webcal calendar",
        {
          error:
            syncError instanceof Error ? syncError.message : String(syncError),
          feedId,
        },
        LOG_SOURCE
      );
      return NextResponse.json(
        {
          error: "Failed to sync Webcal calendar",
          details:
            syncError instanceof Error ? syncError.message : String(syncError),
        },
        { status: 500 }
      );
    }

    // Update the feed's sync status
    await prisma.calendarFeed.update({
      where: { id: feed.id, userId },
      data: {
        lastSync: newDate(),
      },
    });

    logger.info(
      "Completed Webcal calendar sync",
      {
        feedId: String(feedId),
      },
      LOG_SOURCE
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error(
      "Failed to sync Webcal calendar",
      {
        error: error instanceof Error ? error.message : "Unknown error",
      },
      LOG_SOURCE
    );
    return NextResponse.json(
      { error: "Failed to sync calendar" },
      { status: 500 }
    );
  }
}

/**
 * API route for adding a Webcal calendar and performing initial sync
 * POST /api/calendar/webcal/sync
 * Body: { accountId, calendarId, name, color }
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request, LOG_SOURCE);
    if ("response" in auth) {
      return auth.response;
    }

    const userId = auth.userId;

    const body = await request.json();
    const { webcalUrl, calendarId, name, color } = body;

    if (!webcalUrl || !calendarId) {
      return NextResponse.json(
        { error: "URL and Calendar ID are required" },
        { status: 400 }
      );
    }

    // Check if calendar already exists
    const existingFeed = await prisma.calendarFeed.findFirst({
      where: {
        type: "WEBCAL",
        url: webcalUrl,
        id: calendarId,
        userId,
      },
    });

    if (existingFeed) {
      return NextResponse.json(existingFeed);
    }

    // Create calendar feed
    const feed = await prisma.calendarFeed.create({
      data: {
        name,
        type: "WEBCAL",
        url: webcalUrl,
        color: color || "#BF616A",
        enabled: true,
        userId,
      },
    });

    // Sync events for this calendar
    const webcalService = new WebCalCalendarService(feed);

    try {
      await webcalService.syncCalendar(feed.id, calendarId, userId);
    } catch (syncError) {
      logger.error(
        "Failed to perform initial sync of Webcal calendar",
        {
          error:
            syncError instanceof Error ? syncError.message : String(syncError),
          calendarId,
        },
        LOG_SOURCE
      );
      // Don't return an error here, as we've already created the feed
    }

    return NextResponse.json(feed);
  } catch (error) {
    logger.error(
      "Failed to add Webcal calendar",
      {
        error: error instanceof Error ? error.message : "Unknown error",
      },
      LOG_SOURCE
    );
    return NextResponse.json(
      { error: "Failed to add calendar" },
      { status: 500 }
    );
  }
}
