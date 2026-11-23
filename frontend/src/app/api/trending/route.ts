import { NextResponse } from "next/server";
import { createProxyResponse, fetchBackend } from "@/server/backend-api";
import { getServerSession } from "@/server/session";

export async function GET(request: Request) {
  const session = await getServerSession();
  const incomingUrl = new URL(request.url);
  const targetPath = `/trending${incomingUrl.search}`;

  const upstream = await fetchBackend(targetPath, {
    method: "GET",
    userId: session?.user?.id ?? "anonymous",
    cache: "no-store",
  });

  return createProxyResponse(upstream);
}

