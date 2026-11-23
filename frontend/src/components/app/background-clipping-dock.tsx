"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Film,
  Layers,
  Loader2,
  Sparkles,
  X,
  Zap,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ActiveTask {
  id: string;
  status: "queued" | "processing" | "ready" | "failed" | "completed";
  progress?: number;
  progress_message?: string;
  source_title?: string;
  video_title?: string;
  title?: string;
  source_url?: string;
  source_type?: string;
  thumbnail_url?: string;
  created_at?: string;
}

export function BackgroundClippingDock() {
  const [activeTasks, setActiveTasks] = useState<ActiveTask[]>([]);
  const [minimized, setMinimized] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let timer: NodeJS.Timeout;

    const checkTasks = async () => {
      try {
        const res = await fetch("/api/tasks", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        const rawTasks = Array.isArray(data) ? data : data.tasks || [];

        // Find tasks currently in flight
        const running = rawTasks.filter(
          (t: ActiveTask) => t.status === "processing" || t.status === "queued"
        );
        setActiveTasks(running);
      } catch {
        // Silently skip if offline
      }
    };

    void checkTasks();
    timer = setInterval(checkTasks, 3000);

    return () => clearInterval(timer);
  }, []);

  if (activeTasks.length === 0 || dismissed) {
    return null;
  }

  const getVideoTitle = (task: ActiveTask): string => {
    if (task.source_title && task.source_title.trim()) return task.source_title.trim();
    if (task.video_title && task.video_title.trim()) return task.video_title.trim();
    if (task.title && task.title.trim()) return task.title.trim();
    if (task.source_url) {
      try {
        const u = new URL(task.source_url);
        const vid = u.searchParams.get("v");
        if (vid) return `YouTube Video (${vid})`;
        const pathPart = u.pathname.split("/").filter(Boolean).pop();
        if (pathPart) return decodeURIComponent(pathPart);
      } catch {
        return task.source_url;
      }
    }
    return `Video Task #${task.id.slice(0, 8)}`;
  };

  const getVideoThumbnail = (task: ActiveTask): string | null => {
    if (task.thumbnail_url && task.thumbnail_url.trim()) return task.thumbnail_url;
    if (task.source_url) {
      const match = task.source_url.match(/(?:v=|\/)([0-9A-Za-z_-]{11})/);
      if (match && (task.source_url.includes("youtube.com") || task.source_url.includes("youtu.be"))) {
        return `https://img.youtube.com/vi/${match[1]}/hqdefault.jpg`;
      }
    }
    return null;
  };

  const primaryTask = activeTasks[0];
  const primaryTitle = getVideoTitle(primaryTask);
  const primaryThumb = getVideoThumbnail(primaryTask);
  const primaryPct = primaryTask.progress ?? (primaryTask.status === "queued" ? 5 : 25);

  return (
    <aside
      aria-label="Background Multitask Clipping Dock"
      className={cn(
        "fixed z-50 transition-all duration-300 ease-in-out",
        // Clean placement: positioned above mobile nav bar & above feedback button (bottom-5 right-5)
        "bottom-20 right-4 sm:right-6 md:bottom-20 md:right-6",
        minimized ? "w-auto" : "w-[calc(100vw-2rem)] sm:w-96 max-w-sm"
      )}
    >
      {/* Minimized Pill Mode */}
      {minimized ? (
        <div className="flex items-center gap-2 rounded-full border border-primary/30 bg-background/95 px-3 py-1.5 shadow-2xl backdrop-blur-md ring-1 ring-border animate-in fade-in slide-in-from-bottom-2">
          <span className="relative flex size-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
            <span className="relative inline-flex size-2 rounded-full bg-primary" />
          </span>

          {primaryThumb ? (
            <img
              src={primaryThumb}
              alt={primaryTitle}
              className="size-6 rounded-full object-cover shrink-0 border border-border"
              onError={(e) => { e.currentTarget.style.display = "none"; }}
            />
          ) : (
            <Film className="size-3.5 text-primary shrink-0" />
          )}

          <p className="max-w-[150px] sm:max-w-[200px] truncate text-xs font-semibold text-foreground">
            {primaryTitle}
          </p>

          <span className="text-[11px] font-mono text-primary font-bold">
            {primaryPct}%
          </span>

          <div className="flex items-center gap-1 border-l pl-2 ml-1 border-border">
            <button
              type="button"
              onClick={() => setMinimized(false)}
              className="flex size-5 items-center justify-center rounded text-muted-foreground hover:text-foreground"
              title="Expand Dock"
            >
              <ChevronUp className="size-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setDismissed(true)}
              className="flex size-5 items-center justify-center rounded text-muted-foreground hover:text-foreground"
              title="Close Dock"
            >
              <X className="size-3" />
            </button>
          </div>
        </div>
      ) : (
        /* Expanded Card Mode */
        <div className="rounded-xl border border-primary/30 bg-background/95 backdrop-blur-md shadow-2xl overflow-hidden ring-1 ring-border animate-in fade-in slide-in-from-bottom-3 duration-200">
          {/* Header */}
          <div className="flex items-center justify-between px-3.5 py-2.5 bg-muted/40 border-b border-border/80">
            <div className="flex items-center gap-2 min-w-0">
              <span className="relative flex size-2 shrink-0">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
                <span className="relative inline-flex size-2 rounded-full bg-primary" />
              </span>
              <span className="text-xs font-semibold text-foreground flex items-center gap-1.5 shrink-0">
                <Layers className="size-3.5 text-primary" />
                <span>Multitask Dock</span>
              </span>
              <Badge variant="secondary" className="text-[10px] py-0 px-1.5 font-mono bg-primary/10 text-primary">
                {activeTasks.length} active
              </Badge>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={() => setMinimized(true)}
                className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                title="Minimize Dock"
              >
                <ChevronDown className="size-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setDismissed(true)}
                className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                title="Dismiss"
              >
                <X className="size-3.5" />
              </button>
            </div>
          </div>

          {/* Body: Active Tasks List */}
          <div className="p-3 space-y-2.5 max-h-72 overflow-y-auto scrollbar-none">
            {activeTasks.map((task) => {
              const progressPct = task.progress ?? (task.status === "queued" ? 5 : 25);
              const message =
                task.progress_message ||
                (task.status === "queued"
                  ? "Queued in background..."
                  : "Streaming chunks & searching viral clips...");
              const title = getVideoTitle(task);
              const thumb = getVideoThumbnail(task);

              return (
                <div
                  key={task.id}
                  className="rounded-lg border bg-card/80 p-2.5 space-y-2 text-xs transition-colors hover:border-foreground/20"
                >
                  <div className="flex items-start gap-2.5">
                    {/* Video Thumbnail */}
                    {thumb ? (
                      <img
                        src={thumb}
                        alt={title}
                        className="aspect-video w-14 h-9 rounded object-cover bg-muted shrink-0 border border-border"
                        onError={(e) => { e.currentTarget.style.display = "none"; }}
                      />
                    ) : (
                      <div className="flex w-14 h-9 items-center justify-center rounded bg-muted/60 shrink-0 border border-border">
                        <Film className="size-4 text-primary" />
                      </div>
                    )}

                    <div className="min-w-0 flex-1">
                      {/* Real Video Name */}
                      <p className="font-semibold text-foreground truncate text-xs" title={title}>
                        {title}
                      </p>
                      {/* Current Pipeline Status */}
                      <p className="text-[11px] text-muted-foreground truncate mt-0.5 flex items-center gap-1">
                        <Loader2 className="size-3 animate-spin text-primary shrink-0" />
                        <span>{message}</span>
                      </p>
                    </div>

                    <Button variant="ghost" size="icon-sm" asChild className="size-6 shrink-0" title="Open Video Task">
                      <Link href={`/tasks/${task.id}`}>
                        <ExternalLink className="size-3 text-muted-foreground hover:text-foreground" />
                      </Link>
                    </Button>
                  </div>

                  {/* Progress Bar with Percentage */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-[10px] text-muted-foreground font-mono">
                      <span className="font-semibold text-primary">{progressPct}%</span>
                      <span className="flex items-center gap-1 text-[9px] text-emerald-600 dark:text-emerald-400 font-medium">
                        <Zap className="size-2.5" />
                        <span>Chunk Pipeline Active</span>
                      </span>
                    </div>
                    <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary transition-all duration-300 rounded-full"
                        style={{ width: `${Math.max(5, progressPct)}%` }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Footer Info */}
          <div className="px-3 py-1.5 bg-muted/30 border-t border-border/60 text-[10px] text-muted-foreground flex items-center justify-between">
            <span className="truncate mr-2">Browse freely while clips process</span>
            <Link href="/list" className="hover:underline text-foreground font-semibold shrink-0">
              All Tasks &rarr;
            </Link>
          </div>
        </div>
      )}
    </aside>
  );
}
