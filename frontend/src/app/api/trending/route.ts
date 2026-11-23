import { createProxyResponse, fetchBackend } from "@/server/backend-api";
import { getServerSession } from "@/server/session";

export async function GET(request: Request) {
  const session = await getServerSession();
  const incomingUrl = new URL(request.url);

  // If a forced live refresh is requested, require an active user session to prevent anonymous abuse
  if (incomingUrl.searchParams.get("refresh") === "true" && !session?.user?.id) {
    return new Response(
      JSON.stringify({ error: "Authentication required to trigger trending data refresh" }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    );
  }

  const targetPath = `/trending${incomingUrl.search}`;

  const upstream = await fetchBackend(targetPath, {
    method: "GET",
    userId: session?.user?.id ?? "anonymous",
    cache: "no-store",
  });

  return createProxyResponse(upstream);
}

