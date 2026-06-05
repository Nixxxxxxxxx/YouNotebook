import { NextResponse } from "next/server";

function getAllowedOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const appBaseUrl = process.env.APP_BASE_URL?.replace(/\/$/, "");

  if (!origin) {
    return null;
  }

  if (
    origin.startsWith("chrome-extension://") ||
    origin.startsWith("http://localhost:") ||
    origin === appBaseUrl
  ) {
    return origin;
  }

  return null;
}

export function getExtensionCorsHeaders(request: Request) {
  const allowedOrigin = getAllowedOrigin(request);
  const headers = new Headers();

  if (allowedOrigin) {
    headers.set("access-control-allow-origin", allowedOrigin);
    headers.set("access-control-allow-credentials", "true");
    headers.set("vary", "Origin");
  }

  headers.set("access-control-allow-methods", "GET,POST,OPTIONS");
  headers.set("access-control-allow-headers", "authorization, content-type");

  return headers;
}

export function extensionOptionsResponse(request: Request) {
  return new NextResponse(null, {
    headers: getExtensionCorsHeaders(request),
    status: 204,
  });
}

export function withExtensionCors<T>(request: Request, response: NextResponse<T>) {
  getExtensionCorsHeaders(request).forEach((value, key) => {
    response.headers.set(key, value);
  });

  return response;
}
