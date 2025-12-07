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
 * @returns A promise that returns the full text of the ICS file
 */
export async function fetchWebCalInfo(webCalUrl: string) {
  try {
    // Fetch the ICS file
    const webCalData = await fetch(webCalUrl);
    const webCalText = await webCalData.text();
    const headerInfo = webCalData.headers;

    return {
      webCalText,
      headerInfo,
    };
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
