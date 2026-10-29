export function openApiDocument(origin: string) {
  const server = origin.replace(/\/$/, "");
  return {
    openapi: "3.1.0",
    info: {
      title: "Open Scheduler",
      version: "0.1.0",
      summary: "Read open meeting times, hold a slot, and book after a human confirms.",
    },
    servers: [{ url: server }],
    paths: {
      "/api/v1/availability": {
        get: {
          operationId: "getAvailability",
          summary: "List open slots",
          responses: { "200": { description: "Open slots and host constraints." } },
        },
      },
      "/api/v1/holds": {
        post: {
          operationId: "createHold",
          summary: "Hold a slot for five minutes",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["startsAt"],
                  properties: {
                    startsAt: { type: "string", format: "date-time" },
                    agent: {
                      type: "object",
                      properties: {
                        name: { type: "string" },
                        url: { type: "string" },
                      },
                    },
                  },
                },
              },
            },
          },
          responses: {
            "201": { description: "Hold created. Send confirmUrl to the human." },
          },
        },
      },
      "/api/v1/bookings": {
        post: {
          operationId: "createBooking",
          summary: "Book a meeting with a book-scoped agent key",
          parameters: [
            { name: "Idempotency-Key", in: "header", required: true, schema: { type: "string" } },
            { name: "Authorization", in: "header", required: true, schema: { type: "string" } },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["startsAt", "guestName", "guestEmail", "guestConfirmed"],
                  properties: {
                    startsAt: { type: "string", format: "date-time" },
                    guestName: { type: "string" },
                    guestEmail: { type: "string", format: "email" },
                    guestNote: { type: "string" },
                    guestConfirmed: { type: "boolean", const: true },
                    agent: {
                      type: "object",
                      properties: { name: { type: "string" }, url: { type: "string" } },
                    },
                  },
                },
              },
            },
          },
          responses: { "201": { description: "Booking confirmed." } },
        },
      },
      "/api/v1/bookings/{id}": {
        get: {
          operationId: "getBooking",
          summary: "Read one booking",
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "string" } },
            { name: "sig", in: "query", schema: { type: "string" } },
          ],
          responses: { "200": { description: "Booking JSON, or text/calendar when requested." } },
        },
      },
      "/api/v1/bookings/{id}/cancel": {
        post: {
          operationId: "cancelBooking",
          summary: "Cancel a booking",
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "string" } },
            { name: "sig", in: "query", schema: { type: "string" } },
          ],
          responses: { "200": { description: "Cancelled." } },
        },
      },
    },
  };
}
