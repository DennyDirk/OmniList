import { NextResponse, type NextRequest } from "next/server";

import { createRouteClient } from "../../../../lib/supabase/route";

const upstreamApiBaseUrl =
  process.env.OMNILIST_API_URL ?? process.env.NEXT_PUBLIC_OMNILIST_API_URL ?? "http://localhost:4000";

function buildUpstreamUrl(request: NextRequest, path: string[]) {
  const url = new URL(`${upstreamApiBaseUrl}/${path.join("/")}`);

  request.nextUrl.searchParams.forEach((value, key) => {
    url.searchParams.append(key, value);
  });

  return url;
}

function parseSetCookieHeader(header: string) {
  const parts = header.split(";").map((part) => part.trim());
  const [nameValue, ...attributes] = parts;
  const separatorIndex = nameValue.indexOf("=");

  if (separatorIndex <= 0) {
    return undefined;
  }

  const name = nameValue.slice(0, separatorIndex);
  const value = nameValue.slice(separatorIndex + 1);
  const options: {
    domain?: string;
    expires?: Date;
    httpOnly?: boolean;
    maxAge?: number;
    path?: string;
    sameSite?: "lax" | "none" | "strict";
    secure?: boolean;
  } = {};

  for (const attribute of attributes) {
    const [rawKey, ...rawValueParts] = attribute.split("=");
    const key = rawKey.toLowerCase();
    const rawValue = rawValueParts.join("=");

    if (key === "httponly") {
      options.httpOnly = true;
      continue;
    }

    if (key === "secure") {
      options.secure = true;
      continue;
    }

    if (key === "path") {
      options.path = rawValue || "/";
      continue;
    }

    if (key === "samesite") {
      const normalized = rawValue.toLowerCase();
      if (normalized === "lax" || normalized === "none" || normalized === "strict") {
        options.sameSite = normalized;
      }
      continue;
    }

    if (key === "max-age") {
      const parsed = Number(rawValue);
      if (!Number.isNaN(parsed)) {
        options.maxAge = parsed;
      }
      continue;
    }

    if (key === "expires") {
      const parsed = new Date(rawValue);
      if (!Number.isNaN(parsed.getTime())) {
        options.expires = parsed;
      }
      continue;
    }

    if (key === "domain") {
      options.domain = rawValue;
    }
  }

  return {
    name,
    value,
    options
  };
}

function applySetCookieHeaders(request: NextRequest, response: NextResponse, upstreamResponse: Response) {
  const getSetCookie = (
    upstreamResponse.headers as Headers & {
      getSetCookie?: () => string[];
    }
  ).getSetCookie;
  const cookieHeaders =
    typeof getSetCookie === "function"
      ? getSetCookie.call(upstreamResponse.headers)
      : upstreamResponse.headers.get("set-cookie")
        ? [upstreamResponse.headers.get("set-cookie") as string]
        : [];

  for (const header of cookieHeaders) {
    const parsed = parseSetCookieHeader(header);

    if (!parsed) {
      continue;
    }

    // Re-set the cookie on the web domain so server components and client fetches
    // share the same authenticated session state.
    response.cookies.set({
      name: parsed.name,
      value: parsed.value,
      httpOnly: parsed.options.httpOnly,
      secure: parsed.options.secure ?? request.nextUrl.protocol === "https:",
      sameSite: parsed.options.sameSite ?? "lax",
      expires: parsed.options.expires,
      maxAge: parsed.options.maxAge,
      path: parsed.options.path ?? "/"
    });
  }
}

function applyResponseCookies(from: NextResponse, to: NextResponse) {
  for (const cookie of from.cookies.getAll()) {
    to.cookies.set(cookie);
  }
}

async function proxyRequest(request: NextRequest, path: string[]) {
  const upstreamUrl = buildUpstreamUrl(request, path);
  const requestHeaders = new Headers();
  const supabaseResponse = NextResponse.next();
  const supabase = createRouteClient(request, supabaseResponse);
  const {
    data: { session }
  } = await supabase.auth.getSession();
  const contentType = request.headers.get("content-type");
  const cookieHeader = request.headers.get("cookie");

  if (contentType) {
    requestHeaders.set("content-type", contentType);
  }

  if (cookieHeader) {
    requestHeaders.set("cookie", cookieHeader);
  }

  if (session?.access_token) {
    requestHeaders.set("authorization", `Bearer ${session.access_token}`);
  }

  const upstreamResponse = await fetch(upstreamUrl, {
    method: request.method,
    headers: requestHeaders,
    body:
      request.method === "GET" || request.method === "HEAD"
        ? undefined
        : Buffer.from(await request.arrayBuffer()),
    redirect: "manual",
    cache: "no-store"
  });

  const location = upstreamResponse.headers.get("location");
  const isRedirect = upstreamResponse.status >= 300 && upstreamResponse.status < 400 && location;
  const response = isRedirect
    ? NextResponse.redirect(location, upstreamResponse.status)
    : new NextResponse(upstreamResponse.body, {
        status: upstreamResponse.status
      });

  const responseContentType = upstreamResponse.headers.get("content-type");

  if (responseContentType) {
    response.headers.set("content-type", responseContentType);
  }

  applyResponseCookies(supabaseResponse, response);
  applySetCookieHeaders(request, response, upstreamResponse);

  return response;
}

export async function GET(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  return proxyRequest(request, path);
}

export async function POST(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  return proxyRequest(request, path);
}

export async function PUT(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  return proxyRequest(request, path);
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  return proxyRequest(request, path);
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  return proxyRequest(request, path);
}

export async function OPTIONS(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  return proxyRequest(request, path);
}
