import { NextResponse } from "next/server";
import { createProxyResponse, fetchBackend } from "@/server/backend-api";
import { getServerSession } from "@/server/session";
import { getVerifiedActiveTeamId } from "@/server/workspace";
import { buildBackendAuthHeaders } from "@/lib/backend-auth";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const session = await getServerSession();
  const { path } = await params;
  const incomingUrl = new URL(request.url);
  const targetPath = `/trending/${path.join("/")}${incomingUrl.search}`;

  const upstream = await fetchBackend(targetPath, {
    method: "GET",
    userId: session?.user?.id ?? "anonymous",
    cache: "no-store",
  });

  return createProxyResponse(upstream);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const session = await getServerSession();
  const { path } = await params;
  const incomingUrl = new URL(request.url);
  const targetPath = `/trending/${path.join("/")}${incomingUrl.search}`;
  const body = await request.text();

  let authHeaders: Record<string, string> = {};
  if (session?.user?.id) {
    try {
      const teamId = await getVerifiedActiveTeamId(session.user.id);
      authHeaders = buildBackendAuthHeaders(session.user.id, teamId);
    } catch {
      // Fallback to basic headers
    }
  }

  const upstream = await fetchBackend(targetPath, {
    method: "POST",
    userId: session?.user?.id ?? "anonymous",
    extraHeaders: {
      "Content-Type": request.headers.get("content-type") ?? "application/json",
      ...authHeaders,
    },
    body,
    cache: "no-store",
  });

  return createProxyResponse(upstream);
}

