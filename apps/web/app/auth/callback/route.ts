import { NextResponse, type NextRequest } from "next/server";

import { createRouteClient } from "../../../lib/supabase/route";

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const error = requestUrl.searchParams.get("error");

  if (error) {
    return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(error)}`, requestUrl.origin));
  }

  const response = NextResponse.redirect(new URL("/", requestUrl.origin));

  if (!code) {
    return response;
  }

  const supabase = createRouteClient(request, response);
  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

  if (exchangeError) {
    return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(exchangeError.message)}`, requestUrl.origin));
  }

  return response;
}
