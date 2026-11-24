"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Check, Loader2, Send, Settings, Share2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface ConnectedAccount {
  id: string;
  provider: string;
  username: string;
  account_name?: string;
}

interface AutoUploadStatus {
  auto_upload_ready: boolean;
  connected_accounts_count: number;
  connected_providers: string[];
  accounts: ConnectedAccount[];
  default_platforms: string[];
}

export function AutoUploadModule({
  taskId,
  clipId,
  className,
  onUploaded,
}: {
  taskId?: string;
  clipId?: string;
  className?: string;
  onUploaded?: () => void;
}) {
  const [status, setStatus] = useState<AutoUploadStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [autoUploadEnabled, setAutoUploadEnabled] = useState(true);

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const res = await fetch("/api/auto-upload/status", { cache: "no-store" });
        if (res.ok) {
          const data = await res.json();
          setStatus(data);
        }
      } catch {
        // Silently skip if offline
      } finally {
        setLoading(false);
      }
    };
    void fetchStatus();
  }, []);

  const handleTriggerAutoUpload = async () => {
    if (!status?.auto_upload_ready) {
      toast.warning("Please connect a social account in Settings before auto-uploading.");
      return;
    }

    setUploading(true);
    try {
      let endpoint = "/api/auto-upload/task";
      let payload: Record<string, unknown> = { task_id: taskId };

      if (clipId && taskId) {
        endpoint = "/api/auto-upload/clip";
        payload = { task_id: taskId, clip_id: clipId };
      }

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Auto-upload request failed");
      }

      const data = await res.json();
      if (data.status === "success" || data.status === "completed") {
        toast.success(
          `🚀 Queued for Publishing! Sent to ${data.uploaded_count || data.total_posts_created || 1} platform(s).`
        );
        onUploaded?.();
      } else {
        toast.info(data.message || "Publishing request queued");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Auto-upload failed");
    } finally {
      setUploading(false);
    }
  };

  if (loading) {
    return null;
  }

  const hasConnections = status && status.connected_accounts_count > 0;

  return (
    <div
      className={cn(
        "rounded-xl border border-border/80 bg-card p-3.5 shadow-2xs space-y-3",
        className
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="flex size-7 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-500">
            <Share2 className="size-3.5" />
          </span>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-foreground">
                Autonomous Social Distribution
              </span>
              {hasConnections ? (
                <Badge className="bg-emerald-500 text-white text-[10px] px-1.5 py-0 h-4 gap-1">
                  <Check className="size-2.5" /> Ready
                </Badge>
              ) : (
                <Badge variant="outline" className="text-amber-500 border-amber-500/30 bg-amber-500/10 text-[10px] px-1.5 py-0 h-4">
                  Needs Connection
                </Badge>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground">
              {hasConnections
                ? "Auto-publishes clips with generated viral captions upon render."
                : "Connect your social channels to enable automatic video distribution."}
            </p>
          </div>
        </div>

        {hasConnections && (
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-[11px] font-medium text-muted-foreground hidden sm:inline">
              Auto-Publish:
            </span>
            <Switch
              checked={autoUploadEnabled}
              onCheckedChange={setAutoUploadEnabled}
              aria-label="Toggle Auto-Publishing"
            />
          </div>
        )}
      </div>

      {/* Connected Accounts Badges */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-border/60 text-xs">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] text-muted-foreground">Channels:</span>
          {hasConnections ? (
            status.accounts.map((acc) => (
              <Badge
                key={acc.id}
                variant="secondary"
                className="text-[10px] py-0.5 px-2 capitalize bg-muted font-medium"
              >
                {acc.provider === "youtube" ? "▶️ YouTube" : acc.provider === "tiktok" ? "🎵 TikTok" : acc.provider === "instagram" ? "📸 Instagram" : acc.provider}
                <span className="text-muted-foreground ml-1">({acc.username})</span>
              </Badge>
            ))
          ) : (
            <Link
              href="/settings"
              className="text-[11px] font-semibold text-primary hover:underline flex items-center gap-1"
            >
              <span>Connect YouTube / TikTok / Instagram</span>
              <Settings className="size-3" />
            </Link>
          )}
        </div>

        {taskId && hasConnections && (
          <Button
            size="sm"
            variant="default"
            disabled={uploading}
            onClick={handleTriggerAutoUpload}
            className="h-7 text-xs gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-medium"
          >
            {uploading ? (
              <Loader2 className="size-3 animate-spin" />
            ) : (
              <Send className="size-3" />
            )}
            <span>{clipId ? "Queue Clip for Publishing" : "Queue All for Publishing"}</span>
          </Button>
        )}
      </div>
    </div>
  );
}

