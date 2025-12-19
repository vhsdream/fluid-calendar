import { NextRequest, NextResponse } from "next/server";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

const LOG_SOURCE = "WebCalAvailable";

/**
 * API route for discovering and listing available Webcal subscriptions
 * GET /api/calendar/webcal/available?calType=WEBCAL
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request, LOG_SOURCE);
    if ("response" in auth) {
      return auth.response;
    }

    const userId = auth.userId;

    const { calendarId } = await request.json();
    const { searchParams } = new URL(request.url);
    const calType = searchParams.get("type");

    if (!calType) {
      logger.error("Missing calType parameter", {}, LOG_SOURCE);
      return NextResponse.json(
        { error: "Calendar type is required" },
        { status: 400 }
      );
    }

    logger.info(
      `Fetching available webcal subscriptions for user: ${userId}`,
      {},
      LOG_SOURCE
    );

    try {
      // Get all the calendars of type WEBCAL that belong to authenticated user
      const availableWebCals = await prisma.calendarFeed.findMany({
        where: {
          id: calendarId,
          type: calType,
          userId,
        },
      });

      if (!availableWebCals.length) {
        logger.error(
          `No Web calendar subscriptions found, or you don't have permission to access them`,
          {},
          LOG_SOURCE
        );
        return NextResponse.json(
          {
            error:
              "No Web calendar subscriptions found, or you don't have permission to access them",
          },
          { status: 404 }
        );
      }

      logger.info(
        `Found ${availableWebCals.length} webcal subscriptions for user: ${userId}`,
        {},
        LOG_SOURCE
      );

      // Return the array directly, consistent with Google and Outlook
      return NextResponse.json(availableWebCals);
    } catch (error) {
      logger.error(
        `Error fetching webcal subscriptions for user: ${userId}`,
        {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack || null : null,
        },
        LOG_SOURCE
      );
      return NextResponse.json(
        {
          error: "Failed to fetch webcal subscriptions",
          details: error instanceof Error ? error.message : String(error),
        },
        { status: 500 }
      );
    }
  } catch (error) {
    logger.error(
      "Error in WebCal available route",
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
