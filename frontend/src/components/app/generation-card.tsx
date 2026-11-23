"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { AlertTriangle, Check, Loader2 } from "lucide-react";
import { ClipCover, ScoreRing } from "@/components/app/clip-cover";
import { StatusBadge, ACTIVE_TASK_STATUSES } from "@/components/app/status-badge";
import { VIDEO_SOURCE_LABELS, VideoSourceIcon, videoSourceKind } from "@/components/video-source-icon";
import { coverClipUrl, timeAgoLabel, type GenerationSummary } from "@/lib/generations";
import { cn } from "@/lib/utils";
import { SCORED, taskWorkflow } from "@/lib/workflows";

export function GenerationCard({ generation, selected, onToggle, selectionDisabled, showStatus, className }: {
  generation: GenerationSummary;
  /** Always show the status badge (management views); otherwise only non-completed states. */
  showStatus?: boolean;
  selected?: boolean;
  onToggle?: () => void;
  selectionDisabled?: boolean;
  className?: string;
}) {
  const t = useTranslations("library");
  const locale = useLocale();
  const active = ACTIVE_TASK_STATUSES.includes(generation.status);
  const failed = generation.status === "error";
  const selectable = Boolean(onToggle);
  const source = videoSourceKind(generation.source_type);
  const workflow = taskWorkflow(generation);
  const outputs = workflow === "highlights"
    ? t("card.clips", { count: generation.clips_count })
    : t(`card.workflow.${workflow}`, { count: generation.part_count ?? generation.clips_count });

  return (
    <div className={cn("group relative", className)}>
      <Link href={`/tasks/${generation.id}`} className="block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
        <ClipCover
          src={coverClipUrl(generation)}
          className={cn(
            "aspect-[3/4] rounded-xl ring-1 ring-black/5 transition-all duration-200 group-hover:shadow-lg group-hover:ring-black/10",
            selected && "ring-2 ring-foreground",
          )}
        >
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/70 via-black/0 to-black/20" />
          {active && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-stone-950/75 p-3 text-center text-white backdrop-blur-[2px]">
              <Loader2 className="size-5 animate-spin text-primary" aria-hidden />
              {typeof generation.progress === "number" && generation.progress > 0 ? (
                <span className="font-mono text-base font-bold tabular-nums text-white">
                  {Math.round(generation.progress)}%
                </span>
              ) : null}
              <span className="line-clamp-2 text-[11px] font-medium leading-tight text-white/90">
                {generation.progress_message || (generation.status === "queued" ? t("card.queued") : workflow === "highlights" ? t("card.finding") : t(`card.findingByWorkflow.${workflow}`))}
              </span>
              <div className="relative mt-1 h-1.5 w-24 overflow-hidden rounded-full bg-white/20">
                <div
                  className="h-full bg-primary transition-all duration-500"
                  style={{ width: `${Math.max(5, Math.min(100, generation.progress || (generation.status === "queued" ? 5 : 20)))}%` }}
                />
              </div>
            </div>
          )}
          {failed && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-stone-950/70 text-white">
              <AlertTriangle className="size-5 text-amber-300" aria-hidden />
              <span className="text-xs font-medium">{t("card.needsAttention")}</span>
            </div>
          )}
          {SCORED.has(workflow) && generation.top_virality_score ? (
            <div className="absolute right-2 top-2 rounded-full bg-black/55 text-white backdrop-blur">
              <ScoreRing score={generation.top_virality_score} size={34} />
            </div>
          ) : null}
          <div className="absolute inset-x-3 bottom-2.5 flex items-center justify-between text-[11px] font-medium text-white/90">
            <span className="flex items-center gap-1.5"><VideoSourceIcon source={source} className="size-3.5" aria-hidden />{source === "upload" ? t("card.upload") : VIDEO_SOURCE_LABELS[source]}</span>
            {generation.clips_count > 0 && <span className="tabular-nums">{outputs}</span>}
          </div>
        </ClipCover>
        <div className="mt-2.5 space-y-1 px-0.5">
          <h3 className="line-clamp-2 text-sm font-semibold leading-snug">{generation.source_title}</h3>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>{timeAgoLabel(generation.created_at, locale)}</span>
            {(showStatus || generation.status !== "completed") && <StatusBadge status={generation.status} />}
          </div>
        </div>
      </Link>
      {selectable && (
        <button
          type="button"
          role="checkbox"
          aria-checked={Boolean(selected)}
          aria-label={selected ? t("card.deselect", { title: generation.source_title }) : t("card.select", { title: generation.source_title })}
          disabled={selectionDisabled}
          onClick={onToggle}
          className={cn(
            "absolute left-1 top-1 z-10 flex size-10 items-center justify-center rounded-lg transition-opacity",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-black/40",
            selected ? "opacity-100" : "opacity-100 md:opacity-0 md:group-hover:opacity-100 md:focus-within:opacity-100",
            "disabled:cursor-not-allowed disabled:opacity-40",
          )}
        >
          <span
            aria-hidden
            className={cn(
              "flex size-6 items-center justify-center rounded-[7px] border-2 border-white shadow-[0_1px_3px_rgba(0,0,0,0.45)]",
              selected ? "bg-white text-stone-950" : "bg-black",
            )}
          >
            <Check className={cn("size-3.5", selected ? "opacity-100" : "opacity-0")} strokeWidth={3} />
          </span>
        </button>
      )}
    </div>
  );
}
