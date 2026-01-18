import { NextRequest, NextResponse } from "next/server";

/**
 * CORS headers for cross-origin requests from the frontend (Vercel) to backend (Railway/Render)
 */
export function getCorsHeaders(request: NextRequest): HeadersInit {
  // Allow the Vercel frontend origin, or * in development
  const allowedOrigin =
    process.env.WEBAUTHN_ORIGIN || // Production: set to your Vercel app origin
    request.headers.get("origin") || // Development: echo the origin
    "*";

  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400", // Cache preflight for 24 hours
  };
}

/**
 * Handle OPTIONS preflight requests for CORS
 */
export function handleCorsOptions(request: NextRequest): NextResponse {
  return new NextResponse(null, {
    status: 204,
    headers: getCorsHeaders(request),
  });
}

/**
 * Add CORS headers to an existing response
 */
export function withCors(response: NextResponse, request: NextRequest): NextResponse {
  const corsHeaders = getCorsHeaders(request);
  Object.entries(corsHeaders).forEach(([key, value]) => {
    response.headers.set(key, value);
  });
  return response;
}
