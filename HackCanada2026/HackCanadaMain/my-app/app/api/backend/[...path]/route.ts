import { NextRequest, NextResponse } from "next/server";

type BackendRouteContext = {
  params: Promise<{
    path: string[];
  }>;
};

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function resolveBackendBaseUrl() {
  const configuredUrl =
    process.env.BACKEND_URL ??
    process.env.NEXT_PUBLIC_BACKEND_URL ??
    "http://127.0.0.1:8000";

  try {
    return new URL(configuredUrl);
  } catch (error) {
    throw new Error(
      `Invalid BACKEND_URL configuration: ${configuredUrl}`,
      { cause: error },
    );
  }
}

function buildBackendUrl(path: string[], request: NextRequest) {
  const encodedPath = path.map((segment) => encodeURIComponent(segment)).join("/");
  const targetUrl = new URL(`/api/${encodedPath}`, resolveBackendBaseUrl());
  targetUrl.search = request.nextUrl.search;
  return targetUrl;
}

function createUpstreamHeaders(request: NextRequest, includeBody: boolean) {
  const headers = new Headers();
  const accept = request.headers.get("accept");
  const contentType = request.headers.get("content-type");

  if (accept) {
    headers.set("accept", accept);
  }

  if (includeBody && contentType) {
    headers.set("content-type", contentType);
  }

  return headers;
}

async function proxyToBackend(
  method: "GET" | "POST",
  request: NextRequest,
  context: BackendRouteContext,
) {
  const { path } = await context.params;
  const includeBody = method !== "GET";
  const backendUrl = buildBackendUrl(path, request);
  const body = includeBody ? await request.text() : undefined;

  try {
    const upstreamResponse = await fetch(backendUrl, {
      method,
      headers: createUpstreamHeaders(request, includeBody),
      cache: "no-store",
      body: body && body.length > 0 ? body : undefined,
    });

    const responseHeaders = new Headers();
    const contentType = upstreamResponse.headers.get("content-type");

    if (contentType) {
      responseHeaders.set("content-type", contentType);
    }

    return new NextResponse(upstreamResponse.body, {
      status: upstreamResponse.status,
      headers: responseHeaders,
    });
  } catch (error) {
    console.error(
      `Failed to reach backend at ${backendUrl.toString()} from /api/backend.`,
      error,
    );

    return NextResponse.json(
      {
        error:
          "Backend request failed. Start the Python backend and set BACKEND_URL if it is not running on http://127.0.0.1:8000.",
      },
      { status: 502 },
    );
  }
}

export async function GET(
  request: NextRequest,
  context: BackendRouteContext,
) {
  return proxyToBackend("GET", request, context);
}

export async function POST(
  request: NextRequest,
  context: BackendRouteContext,
) {
  return proxyToBackend("POST", request, context);
}
