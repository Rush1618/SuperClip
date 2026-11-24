import { NextResponse } from "next/server";

import { createTextProxyResponse, fetchBackend } from "@/server/backend-api";
import { getServerSession } from "@/server/session";

async function proxyRightsBase(request: Request) {
  const session = await getServerSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const incomingUrl = new URL(request.url);
  const targetPath = `/rights${incomingUrl.search}`;
  const body =
    request.method === "GET" || request.method === "HEAD" ? undefined : await request.text();

  const upstream = await fetchBackend(targetPath, {
    method: request.method,
    userId: session.user.id,
    extraHeaders: {
      ...(body ? { "Content-Type": request.headers.get("content-type") || "application/json" } : {}),
    },
    body,
    cache: "no-store",
  });

  return createTextProxyResponse(upstream);
}

export async function GET(request: Request) {
  return proxyRightsBase(request);
}

export async function POST(request: Request) {
  return proxyRightsBase(request);
}
