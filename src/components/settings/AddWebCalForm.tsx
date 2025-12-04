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

const LOG_SOURCE = "AddWebCalForm";

interface WebCalFormProps {
  onSuccess?: () => void;
  onCancel?: () => void;
}

/**
 * Form component for adding a new WebCal subscription
 * Collects webcal URL
 */
export function AddWebCalForm({
  onSuccess,
  onCancel,
}: WebCalFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    webcalUrl: "",
  });
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));

    // Clear error when user makes changes
    if (errorMessage) {
      setErrorMessage(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    // Validate form
    if (!formData.webcalUrl) {
      setErrorMessage("Please fill in Web calendar URL");
      return;
    }

    try {
      setIsSubmitting(true);

      // Ensure the webcal URL has the correct format
      let webcalUrl = formData.webcalUrl;
      if (
        !webcalUrl.startsWith("http://") &&
        !webcalUrl.startsWith("https://")
      ) {
        webcalUrl = `https://${webcalUrl}`;
      }

      // Remove trailing slash if present
      if (webcalUrl.endsWith("/")) {
        webcalUrl = webcalUrl.slice(0, -1);
      }

      const response = await fetch("/api/calendar/webcal/add", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          webcalUrl,
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

  return (
    <Card>
      <CardHeader>
        <CardTitle>Subscribe to a Web Calendar</CardTitle>
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
              htmlFor="webcalUrl"
            >
              Webcal URL <span className="text-red-500">*</span>
            </Label>
            <Input
              id="webcalUrl"
              name="webcalUrl"
              placeholder="https://example.com/holidays.ics"
              value={formData.webcalUrl}
              onChange={handleChange}
              required
            />
          </fieldset>

        </CardContent>

        <CardFooter className="flex justify-between">
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Connecting..." : "Subscribe"}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
