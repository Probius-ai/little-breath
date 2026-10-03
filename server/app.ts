import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { readFile, realpath, stat } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import {
  createWeatherService,
  parseLocation,
  ServiceError,
  type WeatherServiceOptions,
} from "./weather-service.js";

export interface AppOptions extends WeatherServiceOptions {
  staticDirectory?: string;
  requestsPerMinute?: number;
}

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
};

function securityHeaders(response: ServerResponse) {
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("X-Frame-Options", "DENY");
  response.setHeader(
    "Permissions-Policy",
    "geolocation=(self), camera=(), microphone=()",
  );
  response.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; media-src 'self' blob:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'none'",
  );
}

function json(response: ServerResponse, status: number, value: unknown) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(value));
}

/** Native Node HTTP server: same-origin API and optional built frontend. */
export function createAppServer(options: AppOptions = {}) {
  const weather = createWeatherService(options);
  const now = options.now ?? Date.now;
  const limits = new Map<string, { count: number; expiresAt: number }>();
  const maxRequests = options.requestsPerMinute ?? 60;
  const staticDirectory = options.staticDirectory
    ? resolve(options.staticDirectory)
    : undefined;

  function allowed(request: IncomingMessage): boolean {
    // Never trust client-controlled X-Forwarded-For. A reverse proxy needs its own edge limiter.
    const address = request.socket.remoteAddress ?? "unknown";
    const timestamp = now();
    for (const [key, value] of limits)
      if (value.expiresAt <= timestamp) limits.delete(key);
    const entry = limits.get(address);
    if (entry) {
      entry.count += 1;
      return entry.count <= maxRequests;
    }
    if (limits.size >= 5_000) return false;
    limits.set(address, { count: 1, expiresAt: timestamp + 60_000 });
    return true;
  }

  async function handle(request: IncomingMessage, response: ServerResponse) {
    securityHeaders(response);
    if (!request.url || request.url.length > 2_048)
      return json(response, 400, {
        error: { code: "INVALID_REQUEST", message: "Invalid request." },
      });
    let url: URL;
    try {
      url = new URL(request.url, "http://localhost");
    } catch {
      return json(response, 400, {
        error: { code: "INVALID_REQUEST", message: "Invalid request." },
      });
    }
    if (url.pathname.startsWith("/api/")) {
      if (!["GET", "HEAD"].includes(request.method ?? "")) {
        response.setHeader("Allow", "GET, HEAD");
        return json(response, 405, {
          error: {
            code: "METHOD_NOT_ALLOWED",
            message: "Use GET for this endpoint.",
          },
        });
      }
      if (request.headers["sec-fetch-site"] === "cross-site")
        return json(response, 403, {
          error: {
            code: "SAME_ORIGIN_REQUIRED",
            message: "Use the application to request weather.",
          },
        });
      if (!allowed(request)) {
        response.setHeader("Retry-After", "60");
        return json(response, 429, {
          error: {
            code: "RATE_LIMITED",
            message: "Too many requests. Please wait a moment.",
          },
        });
      }
      if (url.pathname === "/api/health")
        return json(response, 200, {
          status: "ok",
          liveWeatherConfigured: Boolean(options.apiKey?.trim()),
        });
      if (url.pathname !== "/api/weather")
        return json(response, 404, {
          error: { code: "NOT_FOUND", message: "Endpoint not found." },
        });
      const location = parseLocation(url.searchParams);
      const snapshot = await weather.get(location);
      return json(response, 200, snapshot);
    }

    if (!["GET", "HEAD"].includes(request.method ?? "")) {
      response.setHeader("Allow", "GET, HEAD");
      return json(response, 405, {
        error: {
          code: "METHOD_NOT_ALLOWED",
          message: "Use GET for this resource.",
        },
      });
    }
    if (!staticDirectory)
      return json(response, 404, {
        error: {
          code: "NOT_FOUND",
          message: "Build the frontend or run the development server.",
        },
      });
    let pathname: string;
    try {
      pathname = decodeURIComponent(url.pathname);
    } catch {
      return json(response, 400, {
        error: { code: "INVALID_REQUEST", message: "Invalid path." },
      });
    }
    // Allow only packaged web assets. No dotfiles, source maps, traversal or secrets.
    if (
      pathname.includes("\0") ||
      pathname.includes("\\") ||
      pathname.split("/").some((part) => part.startsWith("."))
    ) {
      return json(response, 404, {
        error: { code: "NOT_FOUND", message: "Resource not found." },
      });
    }
    const requested = resolve(
      staticDirectory,
      `.${pathname === "/" ? "/index.html" : pathname}`,
    );
    if (!requested.startsWith(staticDirectory + sep))
      return json(response, 404, {
        error: { code: "NOT_FOUND", message: "Resource not found." },
      });
    try {
      const canonicalRoot = await realpath(staticDirectory);
      const canonicalFile = await realpath(requested);
      if (!canonicalFile.startsWith(canonicalRoot + sep))
        throw new Error("Invalid asset");
      const type = MIME[extname(canonicalFile)];
      const info = await stat(canonicalFile);
      if (!type || !info.isFile() || info.size > 20 * 1024 * 1024)
        throw new Error("Invalid asset");
      response.writeHead(200, {
        "Content-Type": type,
        "Content-Length": info.size,
        "Cache-Control": pathname.startsWith("/assets/")
          ? "public, max-age=31536000, immutable"
          : "no-cache",
      });
      response.end(
        request.method === "HEAD" ? undefined : await readFile(canonicalFile),
      );
    } catch {
      json(response, 404, {
        error: { code: "NOT_FOUND", message: "Resource not found." },
      });
    }
  }

  const server = createServer((request, response) => {
    void handle(request, response).catch((error: unknown) => {
      if (response.headersSent) {
        response.destroy();
        return;
      }
      if (error instanceof ServiceError)
        return json(response, error.status, {
          error: { code: error.code, message: error.publicMessage },
        });
      // Upstream errors can contain key-bearing URLs. Never log or serialize them.
      json(response, 500, {
        error: {
          code: "INTERNAL_ERROR",
          message: "Something went wrong. Please try again.",
        },
      });
    });
  });
  server.requestTimeout = 15_000;
  server.headersTimeout = 10_000;
  server.keepAliveTimeout = 5_000;
  server.maxRequestsPerSocket = 100;
  return server;
}
