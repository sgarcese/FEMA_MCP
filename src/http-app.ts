import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express, {
  type NextFunction,
  type Request,
  type Response,
} from "express";

import { createMcpServer } from "./server.js";

interface HttpAppOptions {
  allowedOrigins?: string[];
}

function originsFromEnvironment(): string[] {
  return (process.env.ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

export function createHttpApp(options: HttpAppOptions = {}) {
  const app = express();
  const allowedOrigins = options.allowedOrigins ?? originsFromEnvironment();
  app.disable("x-powered-by");

  app.get("/health", (_request, response) => {
    response.json({ status: "ok", service: "fema-data-mcp", version: "0.1.0" });
  });

  app.use(
    "/mcp",
    (request: Request, response: Response, next: NextFunction) => {
      const origin = request.get("origin");
      if (origin) {
        if (!allowedOrigins.includes(origin)) {
          response.status(403).json({ error: "Origin is not allowed" });
          return;
        }
        response.setHeader("Access-Control-Allow-Origin", origin);
        response.setHeader("Vary", "Origin");
        response.setHeader(
          "Access-Control-Allow-Headers",
          "content-type,mcp-protocol-version,mcp-session-id",
        );
        response.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
      }
      if (request.method === "OPTIONS") {
        response.sendStatus(204);
        return;
      }
      next();
    },
  );

  app.post(
    "/mcp",
    express.json({ limit: "1mb" }),
    async (request, response) => {
      const server = createMcpServer();
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true,
      });

      response.on("close", () => {
        void transport.close();
        void server.close();
      });

      try {
        await server.connect(transport);
        await transport.handleRequest(request, response, request.body);
      } catch {
        if (!response.headersSent) {
          response.status(500).json({
            jsonrpc: "2.0",
            error: {
              code: -32603,
              message: "Internal MCP server error",
            },
            id: null,
          });
        }
      }
    },
  );

  app.all("/mcp", (_request, response) => {
    response.setHeader("Allow", "POST, OPTIONS");
    response.status(405).json({ error: "Method not allowed" });
  });

  app.use(
    (
      error: unknown,
      _request: Request,
      response: Response,
      next: NextFunction,
    ) => {
      if (response.headersSent) {
        next(error);
        return;
      }

      const bodyError = error as { status?: number; type?: string };
      if (
        bodyError.status === 400 &&
        bodyError.type === "entity.parse.failed"
      ) {
        response.status(400).json({
          jsonrpc: "2.0",
          error: { code: -32700, message: "Invalid JSON request body" },
          id: null,
        });
        return;
      }

      response.status(500).json({
        jsonrpc: "2.0",
        error: { code: -32603, message: "Internal MCP server error" },
        id: null,
      });
    },
  );

  return app;
}
