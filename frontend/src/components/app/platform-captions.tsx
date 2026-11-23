"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, Copy, ExternalLink, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { WallClip } from "@/components/app/clip-wall";

const PLATFORMS = [
  { id: "tiktok", label: "TikTok", icon: "🎵" },
  { id: "instagram", label: "Instagram", icon: "📸" },
  { id: "youtube", label: "YouTube Shorts", icon: "▶️" },
  { id: "linkedin", label: "LinkedIn", icon: "💼" },
  { id: "twitter", label: "X / Twitter", icon: "🐦" },
] as const;

type PlatformId = typeof PLATFORMS[number]["id"];

interface PlatformCopy {
  title?: string;
  caption?: string;
  hashtags?: string[];
}

export function PlatformCaptionsSection({
  clip,
  taskId,
}: {
  clip: WallClip;
  taskId: string;
}) {
  const [selectedPlatform, setSelectedPlatform] = useState<PlatformId>("tiktok");
  const [captions, setCaptions] = useState<Record<string, PlatformCopy>>(
    clip.workflow_meta?.social_captions || {}
  );
  const [loading, setLoading] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const currentCopy = captions[selectedPlatform];

  const handleCopy = async (text: string, key: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      toast.success(`Copied ${label} to clipboard!`);
      setTimeout(() => setCopiedKey(null), 2000);
    } catch {
      toast.error("Failed to copy to clipboard");
    }
  };

  const handleGenerate = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/social/captions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          task_id: taskId,
          clip_id: clip.id,
          all_platforms: true,
          force_refresh: true,
        }),
      });
      if (!res.ok) {
        throw new Error("Failed to generate platform captions");
      }
      const data = await res.json();
      if (data.captions) {
        setCaptions(data.captions);
        toast.success("Generated platform captions for all platforms!");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Caption generation failed");
    } finally {
      setLoading(false);
    }
  };

  const fullPostText = (copy?: PlatformCopy) => {
    if (!copy) return "";
    const parts: string[] = [];
    if (copy.title && selectedPlatform === "youtube") {
      parts.push(copy.title);
      parts.push("");
    }
    if (copy.caption) {
      parts.push(copy.caption);
    }
    if (copy.hashtags && copy.hashtags.length > 0) {
      parts.push("");
      parts.push(copy.hashtags.join(" "));
    }
    return parts.join("\n");
  };

  return (
    <section className="rounded-xl border bg-card p-4 text-card-foreground shadow-xs">
      <div className="flex items-center justify-between pb-3">
        <div className="flex items-center gap-2">
          <Sparkles className="size-4 text-primary" />
          <h3 className="text-sm font-semibold">Platform Captions & Hashtags</h3>
        </div>
        <Button
          size="sm"
          variant="ghost"
          className="h-8 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          onClick={handleGenerate}
          disabled={loading}
        >
          {loading ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Sparkles className="size-3.5" />
          )}
          {Object.keys(captions).length > 0 ? "Regenerate" : "Generate All"}
        </Button>
      </div>

      {/* Platform Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-2 border-b scrollbar-none">
        {PLATFORMS.map((platform) => {
          const active = selectedPlatform === platform.id;
          return (
            <button
              key={platform.id}
              type="button"
              onClick={() => setSelectedPlatform(platform.id)}
              className={`flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
                active
                  ? "bg-primary text-primary-foreground shadow-xs"
                  : "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground"
              }`}
            >
              <span>{platform.icon}</span>
              <span>{platform.label}</span>
            </button>
          );
        })}
      </div>

      {/* Platform Content */}
      <div className="mt-3 space-y-3">
        {currentCopy ? (
          <>
            {currentCopy.title && (
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span className="font-medium">Title</span>
                  <button
                    type="button"
                    onClick={() => handleCopy(currentCopy.title!, `${selectedPlatform}-title`, "Title")}
                    className="flex items-center gap-1 text-[11px] hover:text-foreground"
                  >
                    {copiedKey === `${selectedPlatform}-title` ? (
                      <Check className="size-3 text-emerald-500" />
                    ) : (
                      <Copy className="size-3" />
                    )}
                    <span>Copy</span>
                  </button>
                </div>
                <p className="rounded-lg bg-muted/50 p-2 text-xs font-medium text-foreground">
                  {currentCopy.title}
                </p>
              </div>
            )}

            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span className="font-medium">Caption & Hashtags</span>
                <button
                  type="button"
                  onClick={() =>
                    handleCopy(
                      fullPostText(currentCopy),
                      `${selectedPlatform}-full`,
                      `${PLATFORMS.find((p) => p.id === selectedPlatform)?.label} Post`
                    )
                  }
                  className="flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
                >
                  {copiedKey === `${selectedPlatform}-full` ? (
                    <Check className="size-3 text-emerald-500" />
                  ) : (
                    <Copy className="size-3" />
                  )}
                  <span>Copy Full Post</span>
                </button>
              </div>
              <div className="max-h-52 overflow-y-auto whitespace-pre-wrap rounded-lg bg-muted/50 p-2.5 text-xs text-foreground font-sans leading-relaxed border border-border/40">
                {currentCopy.caption}
                {currentCopy.hashtags && currentCopy.hashtags.length > 0 && (
                  <div className="mt-2.5 flex flex-wrap gap-1 text-primary">
                    {currentCopy.hashtags.map((tag) => (
                      <span key={tag} className="font-medium bg-primary/10 px-1.5 py-0.5 rounded text-[11px]">
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Direct Publishing & Channel Connection */}
            <div className="flex items-center justify-between border-t border-border/40 pt-2.5 text-xs">
              <span className="text-muted-foreground text-[11px]">Publish directly to your channel:</span>
              <Link
                href="/settings/social"
                className="inline-flex items-center gap-1 font-medium text-primary hover:underline text-[11px]"
              >
                <span>Connect {selectedPlatform === "youtube" ? "YouTube Channel" : selectedPlatform === "instagram" ? "Instagram" : PLATFORMS.find((p) => p.id === selectedPlatform)?.label}</span>
                <ExternalLink className="size-3" />
              </Link>
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-6 text-center">
            <Sparkles className="size-5 text-muted-foreground/60" />
            <p className="mt-2 text-xs text-muted-foreground">
              No platform captions generated yet for this clip.
            </p>
            <Button
              size="sm"
              variant="outline"
              className="mt-3 h-8 gap-1.5 text-xs"
              onClick={handleGenerate}
              disabled={loading}
            >
              {loading ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Sparkles className="size-3.5 text-primary" />
              )}
              Generate Captions for All Platforms
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}

