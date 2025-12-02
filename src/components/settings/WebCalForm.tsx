import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { logger } from "@/lib/logger";

const LOG_SOURCE = "WebCalForm";

// Define types for test results
interface TestStep {
  step: string;
  status: "pending" | "success" | "failed";
  error?: string;
  calendars?: number;
  calendarNames?: string[];
}

interface TestResult {
  steps: TestStep[];
  success: boolean;
  error: string | null;
  details: string | null;
}

interface WebCalFormProps {
  onSuccess?: () => void;
  onCancel?: () => void;
}

/**
 * Form component for adding a new WebCal subscription
 * Collects server URL
 */
export function WebCalForm({
  onSuccess,
  onCancel,
}: WebCalFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [formData, setFormData] = useState({
    serverUrl: "",
  });
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<TestResult | null>(null);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));

    // Clear error when user makes changes
    if (errorMessage) {
      setErrorMessage(null);
    }

    // Clear test results when form changes
    if (testResults) {
      setTestResults(null);
    }
  };

  const handleTest = async () => {
    // Validate form
    if (!formData.serverUrl) {
      setErrorMessage("Please fill in calendar URL");
      return;
    }

    try {
      setIsTesting(true);
      setErrorMessage(null);
      setTestResults(null);

      // Ensure the server URL has the correct format
      let serverUrl = formData.serverUrl;
      if (
        !serverUrl.startsWith("http://") &&
        !serverUrl.startsWith("https://")
      ) {
        serverUrl = `https://${serverUrl}`;
      }

      // Remove trailing slash if present
      if (serverUrl.endsWith("/")) {
        serverUrl = serverUrl.slice(0, -1);
      }

      const response = await fetch("/api/calendar/caldav/test", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          serverUrl,
        }),
      });

      const data = await response.json();
      setTestResults(data as TestResult);

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to connect to Web calendar");
      }

      logger.info(
        "WebCal test connection successful",
        { serverUrl },
        LOG_SOURCE
      );
    } catch (error) {
      logger.error(
        "WebCal test connection failed",
        {
          error: error instanceof Error ? error.message : "Unknown error",
        },
        LOG_SOURCE
      );
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Failed to connect to Web calendar"
      );
    } finally {
      setIsTesting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    // Validate form
    if (!formData.serverUrl) {
      setErrorMessage("Please fill in Web calendar URL");
      return;
    }

    try {
      setIsSubmitting(true);

      // Ensure the server URL has the correct format
      let serverUrl = formData.serverUrl;
      if (
        !serverUrl.startsWith("http://") &&
        !serverUrl.startsWith("https://")
      ) {
        serverUrl = `https://${serverUrl}`;
      }

      const response = await fetch("/api/calendar/caldav/auth", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          serverUrl,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(
          errorData.error || "Failed to connect to Web calendar"
        );
      }

      await response.json();

      alert(`Successfully subscribed to Web calendar`);

      if (onSuccess) {
        onSuccess();
      }
    } catch (error) {
      logger.error(
        "Failed to subscribe to Web calendar",
        {
          error: error instanceof Error ? error.message : "Unknown error",
        },
        LOG_SOURCE
      );
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Failed to subscribe to Web calendar"
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  // Render test results
  const renderTestResults = () => {
    if (!testResults) return null;

    return (
      <div className="mt-4 rounded-md border bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800">
        <h3 className="mb-2 font-medium">Connection Test Results</h3>

        {testResults.steps &&
          testResults.steps.map((step, index) => (
            <div key={index} className="mb-2">
              <div className="flex items-center">
                <span
                  className={`mr-2 ${step.status === "success"
                    ? "text-green-500"
                    : step.status === "failed"
                      ? "text-red-500"
                      : "text-yellow-500"
                    }`}
                >
                  {step.status === "success"
                    ? "✓"
                    : step.status === "failed"
                      ? "✗"
                      : "⟳"}
                </span>
                <span className="font-medium">{step.step}</span>
                {step.status === "success" && step.calendars !== undefined && (
                  <span className="ml-2 text-sm text-gray-600 dark:text-gray-400">
                    ({step.calendars} calendars found)
                  </span>
                )}
              </div>

              {step.error && (
                <div className="ml-6 mt-1 whitespace-pre-wrap text-sm text-red-600 dark:text-red-400">
                  Error: {step.error}
                </div>
              )}

              {step.calendarNames && step.calendarNames.length > 0 && (
                <div className="ml-6 mt-1 text-sm text-gray-600 dark:text-gray-400">
                  Calendars: {step.calendarNames.join(", ")}
                </div>
              )}
            </div>
          ))}

        {testResults.error && !testResults.steps?.some((s) => s.error) && (
          <div className="mt-2 text-red-600 dark:text-red-400">
            <div className="font-medium">Error:</div>
            <div className="whitespace-pre-wrap text-sm">
              {testResults.error}
            </div>
          </div>
        )}

        {testResults.success && (
          <div className="mt-2 font-medium text-green-600 dark:text-green-400">
            Connection successful! You can now connect your account.
          </div>
        )}
      </div>
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Subscribe to Web Calendar</CardTitle>
        <CardDescription>
          Subscribe to publicly available web calendars (.ICS)
        </CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent className="space-y-4">
          {errorMessage && (
            <div className="mb-3 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-900/30 dark:text-red-300">
              {errorMessage}
            </div>
          )}

          <fieldset className="mb-4">
            <Label
              className="mb-2.5 text-[15px] leading-normal"
              htmlFor="serverUrl"
            >
              Server URL <span className="text-red-500">*</span>
            </Label>
            <Input
              id="serverUrl"
              name="serverUrl"
              placeholder="https://example.com/holidays.ics"
              value={formData.serverUrl}
              onChange={handleChange}
              required
            />
          </fieldset>

          <div className="mt-4">
            <Button
              type="button"
              variant="outline"
              onClick={handleTest}
              disabled={isTesting || isSubmitting}
              className="w-full"
            >
              {isTesting ? "Testing Connection..." : "Test Connection"}
            </Button>
          </div>

          {renderTestResults()}
        </CardContent>

        <CardFooter className="flex justify-between">
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={isSubmitting || isTesting}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={isSubmitting || isTesting}>
            {isSubmitting ? "Connecting..." : "Connect"}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
