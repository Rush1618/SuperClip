"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Flame,
  Layers,
  Loader2,
  Mic,
  Play,
  Radio,
  RefreshCw,
  Scissors,
  Sparkles,
  Square,
  TrendingUp,
  Wand2,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app/app-shell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { AutoUploadModule } from "@/components/app/auto-upload-module";
import { cn } from "@/lib/utils";

interface TrendingVideo {
  id: string;
  platform?: "youtube" | "twitch";
  platform_icon?: string;
  title: string;
  channel: string;
  views: string;
  published: string;
  duration?: string;
  thumbnail: string;
  url: string;
  virality_score?: number | null;
  score_explanation?: string;
  verified_metrics?: boolean;
  region: string;
  niche?: string;
  observed_at?: string;
}

interface LearningAgentInfo {
  status: string;
  cycles_completed: number;
  videos_analyzed: number;
  last_learned_at?: string;
  active_hooks?: string[];
  model?: string;
  learned_patterns_count?: number;
}

interface TranscriptionError {
  raw: string;
  corrected: string;
  reason?: string;
}

interface TranscriptionCheck {
  raw_speech: string;
  corrected_speech: string;
  corrections_applied: TranscriptionError[];
  accuracy_score: string;
  status: string;
  error_count: number;
  important_words?: string[];
}

interface HypeMoment {
  id: string;
  title: string;
  hype_score: number;
  chat_velocity: string;
  sentiment: string;
  top_triggers: string[];
  start_seconds: number;
  end_seconds: number;
  duration: string;
  timestamp_label: string;
  platform: string;
  channel: string;
  stream_url: string;
  is_playable?: boolean;
  is_simulated?: boolean;
  reason: string;
  spoken_transcript?: string;
  important_words?: string[];
  transcription_error_check?: TranscriptionCheck;
}

interface LiveMonitorResult {
  status: string;
  is_simulated?: boolean;
  pipeline_status?: string;
  pipeline_notice?: string;
  source_kind?: string;
  is_playable?: boolean;
  platform: string;
  channel: string;
  stream_url: string;
  playable_url?: string;
  current_viewer_activity: string;
  active_chat_velocity: string;
  hype_index: string;
  detected_moments: HypeMoment[];
}

const REGIONS = [
  { code: "US", label: "United States", flag: "🇺🇸" },
  { code: "GLOBAL", label: "Worldwide", flag: "🌍" },
  { code: "GB", label: "United Kingdom", flag: "🇬🇧" },
  { code: "CA", label: "Canada", flag: "🇨🇦" },
  { code: "IN", label: "India", flag: "🇮🇳" },
  { code: "JP", label: "Japan", flag: "🇯🇵" },
];

const NICHES = [
  { id: "all", label: "All Trending" },
  { id: "gaming", label: "Gaming & Esports" },
  { id: "podcasts", label: "Podcasts & Talk" },
  { id: "tech", label: "Tech & AI" },
  { id: "entertainment", label: "Entertainment" },
  { id: "education", label: "Education" },
  { id: "irl", label: "IRL Streams" },
  { id: "music", label: "Music" },
];

const PRESET_STREAMS = [
  { name: "Tarik (Valorant)", url: "https://www.twitch.tv/tarik", channel: "Tarik", icon: "🟣" },
  { name: "Kai Cenat (IRL)", url: "https://www.twitch.tv/kaicenat", channel: "Kai Cenat", icon: "🟣" },
  { name: "Jynxzi (R6 Siege)", url: "https://www.twitch.tv/jynxzi", channel: "Jynxzi", icon: "🟣" },
  { name: "MrBeast Premiere", url: "https://www.youtube.com/watch?v=L_LUpnjgPso", channel: "MrBeast", icon: "▶️" },
  { name: "Lex Fridman AI", url: "https://www.youtube.com/watch?v=0PT5c1z3LL8", channel: "Lex Fridman", icon: "▶️" },
];

export default function TrendingPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"trending" | "live_monitor" | "speech_lab">("trending");
  const [videos, setVideos] = useState<TrendingVideo[]>([]);
  const [learningAgent, setLearningAgent] = useState<LearningAgentInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [clippingId, setClippingId] = useState<string | null>(null);
  const [relearning, setRelearning] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Filters
  const [selectedPlatform, setSelectedPlatform] = useState<"all" | "youtube" | "twitch">("all");
  const [selectedNiche, setSelectedNiche] = useState<string>("all");
  const [selectedRegion, setSelectedRegion] = useState<string>("US");
  const [selectedTimeframe, setSelectedTimeframe] = useState<"24h" | "all">("24h");

  // Multitask / Batch Clipping State
  const [multitaskMode, setMultitaskMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [batchProgress, setBatchProgress] = useState<{ active: boolean; current: number; total: number } | null>(null);

  // Live Stream Monitor State
  const [streamInput, setStreamInput] = useState("");
  const [monitoringStream, setMonitoringStream] = useState(false);
  const [liveResult, setLiveResult] = useState<LiveMonitorResult | null>(null);
  const [expandedDiffs, setExpandedDiffs] = useState<Record<string, boolean>>({});
  const [activeLiveTaskId, setActiveLiveTaskId] = useState<string | null>(null);
  const [autoClippedMomentId, setAutoClippedMomentId] = useState<string | null>(null);

  // Speech & Error Lab State
  const [customSpeech, setCustomSpeech] = useState(
    "tar rick is one v five on val or ant bro no shoot he is actually aceing this right now lets goooo"
  );
  const [testingSpeech, setTestingSpeech] = useState(false);
  const [speechAnalysisResult, setSpeechAnalysisResult] = useState<TranscriptionCheck | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);

  const fetchTrendingData = useCallback(
    async (
      platform = selectedPlatform,
      region = selectedRegion,
      niche = selectedNiche,
      timeframe = selectedTimeframe,
      forceRefresh = false
    ) => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      const controller = new AbortController();
      abortControllerRef.current = controller;

      if (forceRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      try {
        const refreshParam = forceRefresh ? "&refresh=true" : "";
        const res = await fetch(
          `/api/trending?platform=${platform}&region=${region}&niche=${niche}&timeframe=${timeframe}${refreshParam}`,
          { signal: controller.signal }
        );
        if (!res.ok) throw new Error("Failed to load trending content");
        const data = await res.json();
        setVideos(data.videos || []);
        setLearningAgent(data.learning_agent || null);
        if (forceRefresh) {
          toast.success("Checked YouTube: trending feed updated with fresh videos!");
        }
      } catch (err: unknown) {
        if (err instanceof Error && err.name === "AbortError") {
          return;
        }
        toast.error(err instanceof Error ? err.message : "Error loading trending content");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [selectedPlatform, selectedRegion, selectedNiche, selectedTimeframe]
  );

  useEffect(() => {
    try {
      const stored = localStorage.getItem("supoclip_autoclip_settings");
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.niche) setSelectedNiche(parsed.niche);
        if (parsed.region) setSelectedRegion(parsed.region);
      }
    } catch {}
  }, []);

  useEffect(() => {
    void fetchTrendingData(selectedPlatform, selectedRegion, selectedNiche, selectedTimeframe);
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [selectedPlatform, selectedRegion, selectedNiche, selectedTimeframe, fetchTrendingData]);

  const toggleSelectVideo = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === videos.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(videos.slice(0, 6).map((v) => v.id));
    }
  };

  const handleBatchClip = async (targetVideos: TrendingVideo[]) => {
    if (targetVideos.length === 0) {
      toast.error("No videos selected for multitask clipping");
      return;
    }
    setBatchProgress({ active: true, current: 0, total: targetVideos.length });
    toast.info(`⚡ Multitask Mode: Launching ${targetVideos.length} concurrent clipping jobs...`);
    let successCount = 0;
    const stored = typeof window !== "undefined" ? localStorage.getItem("supoclip_autoclip_settings") : null;
    const settings = stored ? JSON.parse(stored) : {};
    const maxClipsNum = settings.maxClips && settings.maxClips !== "auto" ? parseInt(settings.maxClips, 10) : undefined;
    const isChunked = settings.chunkedDownload !== undefined ? Boolean(settings.chunkedDownload) : true;
    const isVoiceHook = settings.aiVoiceHook !== undefined ? Boolean(settings.aiVoiceHook) : true;

    await Promise.allSettled(
      targetVideos.map(async (v) => {
        try {
          const payload = {
            source: {
              url: v.url,
              title: v.title,
            },
            workflow: "highlights",
            output_format: "vertical",
            clip_length: "auto",
            add_subtitles: true,
            cut_long_pauses: true,
            remove_filler_words: true,
            workflow_settings: {
              ...(maxClipsNum ? { max_clips: maxClipsNum } : {}),
              chunked_download: isChunked,
              chunk_duration: parseInt(settings.chunkDuration || "180", 10),
              ai_voice_hook: isVoiceHook,
              ai_voice_style: settings.aiVoiceStyle || "viral_guy",
              auto_upload: settings.autoUpload !== undefined ? Boolean(settings.autoUpload) : true,
            },
          };

          let res = await fetch("/api/tasks/create", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });

          if (!res.ok) {
            res = await fetch("/api/trending/autoclip", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            });
          }

          if (res.ok) {
            successCount++;
            setBatchProgress((prev) => (prev ? { ...prev, current: successCount } : null));
          }
        } catch {}
      })
    );

    setBatchProgress(null);
    setSelectedIds([]);
    if (successCount > 0) {
      toast.success(`⚡ Multitask finished: ${successCount} of ${targetVideos.length} clipping tasks queued successfully!`);
    } else {
      toast.error("Failed to queue batch clipping tasks");
    }
  };

  const handleAutoClipTopBatch = async (count: number = 3) => {
    if (videos.length === 0) {
      toast.error("No trending videos available");
      return;
    }
    const topBatch = [...videos].sort((a, b) => (b.virality_score ?? 0) - (a.virality_score ?? 0)).slice(0, count);
    await handleBatchClip(topBatch);
  };

  const handleAutoClip = async (video: TrendingVideo) => {
    setClippingId(video.id);
    toast.info(`Creating clip task for "${video.title.slice(0, 36)}..."`);
    try {
      const payload = {
        source: {
          url: video.url,
          title: video.title,
        },
        workflow: "highlights",
        output_format: "vertical",
        clip_length: "auto",
        add_subtitles: true,
        cut_long_pauses: true,
        remove_filler_words: true,
        workflow_settings: {
          chunked_download: true,
          chunk_duration: 180,
          ai_voice_hook: true,
          ai_voice_style: "viral_guy",
          auto_upload: true,
        },
      };

      // Try primary task creation endpoint
      let res = await fetch("/api/tasks/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      // Fallback to autoclip endpoint if necessary
      if (!res.ok) {
        res = await fetch("/api/trending/autoclip", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || err.error || "Failed to create clipping task");
      }
      const data = await res.json();
      toast.success("Clipping task started! Opening task...");
      const taskId = data.task_id || data.id;
      if (taskId) {
        router.push(`/tasks/${taskId}`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to auto-clip video");
    } finally {
      setClippingId(null);
    }
  };

  const handleAutoClipTopVideo = async () => {
    if (videos.length === 0) {
      toast.error("No trending videos available");
      return;
    }
    const topVideo = [...videos].sort((a, b) => (b.virality_score ?? 0) - (a.virality_score ?? 0))[0];
    toast.info(`Auto-Clip Mode: Selected #1 viral video "${topVideo.title.slice(0, 36)}..."`);
    await handleAutoClip(topVideo);
  };

  const handleAutoClipHypeMoment = async (
    moment: HypeMoment,
    redirectToTask: boolean = false
  ): Promise<string | null> => {
    setClippingId(moment.id);
    setAutoClippedMomentId(moment.id);
    toast.info(`Extracting hype moment (${moment.timestamp_label}) from ${moment.channel}...`);
    try {
      const rawDuration = moment.end_seconds - moment.start_seconds;
      const startSec = rawDuration < 65 ? Math.max(0, moment.start_seconds - 30) : moment.start_seconds;
      const endSec = rawDuration < 65 ? startSec + 70 : moment.end_seconds;

      const payload = {
        source: {
          url: moment.stream_url,
          title: moment.title,
          start_seconds: startSec,
          end_seconds: endSec,
        },
        workflow: "highlights",
        output_format: "vertical",
        clip_length: "auto",
        add_subtitles: true,
        cut_long_pauses: true,
        remove_filler_words: true,
        workflow_settings: {
          chunked_download: true,
          chunk_duration: 180,
          ai_voice_hook: true,
          ai_voice_style: "viral_guy",
          auto_upload: true,
        },
      };

      // Try trending autoclip endpoint first (resolves raw live channel URLs to playable sources)
      let res = await fetch("/api/trending/autoclip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        if (err.detail && typeof err.detail === "string" && err.detail.includes("STREAM_NOT_PLAYABLE")) {
          throw new Error(err.detail.replace("STREAM_NOT_PLAYABLE: ", ""));
        }
        res = await fetch("/api/tasks/create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || err.error || "Failed to extract hype moment");
      }
      const data = await res.json();
      const taskId = data.task_id || data.id;
      if (taskId) {
        setActiveLiveTaskId(taskId);
        toast.success(`⚡ Auto-clipped! Processing "${moment.title.slice(0, 32)}..."`);
        if (redirectToTask) {
          router.push(`/tasks/${taskId}`);
        }
        return taskId;
      }
      return null;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to clip hype moment");
      return null;
    } finally {
      setClippingId(null);
    }
  };

  const handleLiveMonitor = async (
    targetUrl?: string,
    channelName?: string,
    autoClip: boolean = true
  ) => {
    const url = (targetUrl || streamInput).trim();
    if (!url) {
      toast.error("Please enter a valid YouTube or Twitch live URL");
      return;
    }
    setMonitoringStream(true);
    setActiveLiveTaskId(null);
    setAutoClippedMomentId(null);
    toast.info("Scanning live stream chat velocity, comments spikes & speech...");
    try {
      const res = await fetch("/api/trending/live-monitor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, channel: channelName }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Live stream analysis failed");
      }
      const data: LiveMonitorResult = await res.json();
      setLiveResult(data);
      if (autoClip && data.detected_moments && data.detected_moments.length > 0) {
        if (data.is_playable === false) {
          toast.warning("Broadcast detected: In-progress live streams require an archived VOD or clip URL before video clipping can begin.");
        } else {
          // Automatically select the highest hype moment and queue it immediately
          const sorted = [...data.detected_moments].sort((a, b) => b.hype_score - a.hype_score);
          const bestMoment = sorted[0];
          toast.success(
            `⚡ Truly Automatic: Found ${data.detected_moments.length} moments! Auto-clipping peak: "${bestMoment.title}" (${bestMoment.hype_score}/100 Hype)`
          );
          void handleAutoClipHypeMoment(bestMoment, false);
        }
      } else {
        toast.success(`Found ${data.detected_moments.length} peak hype moments in ${data.channel}'s broadcast!`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to monitor live stream");
    } finally {
      setMonitoringStream(false);
    }
  };

  const handleBatchClipMoments = async (moments: HypeMoment[]) => {
    if (moments.length === 0) return;
    toast.info(`⚡ Multitask Mode: Queueing ${moments.length} hype moments for background processing...`);
    let count = 0;
    for (const m of moments) {
      try {
        const id = await handleAutoClipHypeMoment(m, false);
        if (id) count++;
      } catch {}
    }
    toast.success(`⚡ Finished: ${count} of ${moments.length} moments queued successfully!`);
  };

  const handleSpeechCheck = async () => {
    if (!customSpeech.trim()) {
      toast.error("Enter speech text to check");
      return;
    }
    setTestingSpeech(true);
    try {
      const res = await fetch("/api/trending/check-transcription", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: customSpeech,
          channel: liveResult?.channel || "Streamer",
          context: "Live gaming and chat reactions",
        }),
      });
      if (!res.ok) throw new Error("Transcription error check failed");
      const data = await res.json();
      setSpeechAnalysisResult(data);
      toast.success("Speech error-check & keyword extraction complete!");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Speech check error");
    } finally {
      setTestingSpeech(false);
    }
  };

  const handleLearnNow = async () => {
    setRelearning(true);
    toast.info("Agent is actively analyzing viral trends to extract hook structures...");
    try {
      const res = await fetch("/api/trending/learn-now", { method: "POST" });
      if (!res.ok) throw new Error("Learning cycle failed");
      toast.success("Viral learning completed! Captions & scoring formulas updated.");
      await fetchTrendingData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Learning failed");
    } finally {
      setRelearning(false);
    }
  };

  const toggleDiff = (id: string) => {
    setExpandedDiffs((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <AppShell>
      <main className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Minimal Clean Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Flame className="size-4" />
              </span>
              <h1 className="font-display text-2xl font-bold tracking-tight">Viral Radar</h1>
              {learningAgent ? (
                <Badge variant="outline" className="text-xs font-mono gap-1 border-primary/30 bg-primary/5 text-primary">
                  <Sparkles className="size-3" />
                  <span>{learningAgent.model || `Cycle #${learningAgent.cycles_completed || 1}`}</span>
                  {(learningAgent.learned_patterns_count ?? learningAgent.active_hooks?.length ?? 0) > 0 && (
                    <span className="text-muted-foreground">
                      ({learningAgent.learned_patterns_count ?? learningAgent.active_hooks?.length ?? 0} rules)
                    </span>
                  )}
                </Badge>
              ) : (
                <Badge variant="secondary" className="text-xs font-mono">
                  Radar Feed
                </Badge>
              )}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Track breakout videos, monitor live stream spikes, and self-heal speech errors.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="default"
              size="sm"
              onClick={() => void fetchTrendingData(selectedPlatform, selectedRegion, selectedNiche, selectedTimeframe, true)}
              disabled={refreshing || loading}
              className="gap-2 text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90"
            >
              <RefreshCw className={cn("size-3.5", refreshing && "animate-spin")} />
              <span>{refreshing ? "Checking YouTube..." : "Check YouTube Now"}</span>
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={handleLearnNow}
              disabled={relearning}
              className="gap-2 text-xs font-medium"
            >
              {relearning ? (
                <Loader2 className="size-3.5 animate-spin text-primary" />
              ) : (
                <Sparkles className="size-3.5 text-primary" />
              )}
              <span>Re-learn Trends</span>
            </Button>
          </div>
        </div>

        {/* Minimal Tabs Navigation */}
        <div className="mt-6 flex items-center gap-1 border-b pb-2 overflow-x-auto scrollbar-none">
          <button
            type="button"
            onClick={() => setActiveTab("trending")}
            className={cn(
              "flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-colors",
              activeTab === "trending"
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
            )}
          >
            <TrendingUp className="size-3.5" />
            <span>Trending Feed</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("live_monitor")}
            className={cn(
              "flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-colors",
              activeTab === "live_monitor"
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
            )}
          >
            <Radio className="size-3.5" />
            <span>Live Stream Monitor</span>
            {liveResult && (
              <span className="size-2 rounded-full bg-red-500 animate-pulse" />
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("speech_lab")}
            className={cn(
              "flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-colors",
              activeTab === "speech_lab"
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
            )}
          >
            <Mic className="size-3.5" />
            <span>Speech & Error Lab</span>
          </button>
        </div>

        {/* TAB 1: Trending Feed */}
        {activeTab === "trending" && (
          <div className="mt-4 space-y-4">
            {/* Filter Bar: Platform, Timeframe, Region, Niches, Multitask Mode */}
            <div className="flex flex-col gap-3 rounded-xl border bg-card p-3 shadow-2xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  {/* Platform selector */}
                  <div className="flex items-center rounded-lg border bg-muted/40 p-0.5 text-xs font-medium">
                    {(["all", "youtube", "twitch"] as const).map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setSelectedPlatform(p)}
                        className={cn(
                          "rounded-md px-2.5 py-1 capitalize transition-colors",
                          selectedPlatform === p
                            ? "bg-background text-foreground shadow-2xs font-semibold"
                            : "text-muted-foreground hover:text-foreground"
                        )}
                      >
                        {p === "all" ? "All Platforms" : p === "youtube" ? "▶️ YouTube" : "🟣 Twitch"}
                      </button>
                    ))}
                  </div>

                  {/* Recent 24h vs All Time selector */}
                  <div className="flex items-center rounded-lg border bg-muted/40 p-0.5 text-xs font-medium">
                    <button
                      type="button"
                      onClick={() => setSelectedTimeframe("24h")}
                      className={cn(
                        "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs transition-colors",
                        selectedTimeframe === "24h"
                          ? "bg-background text-emerald-600 dark:text-emerald-400 font-semibold shadow-2xs"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      <span className="relative flex size-2">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                        <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
                      </span>
                      <span>Recent 24h</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedTimeframe("all")}
                      className={cn(
                        "rounded-md px-2.5 py-1 text-xs transition-colors",
                        selectedTimeframe === "all"
                          ? "bg-background text-foreground font-semibold shadow-2xs"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      All Time
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {/* Country / Region selector */}
                  <div className="flex items-center gap-1.5 overflow-x-auto text-xs">
                    <span className="text-[11px] text-muted-foreground font-medium mr-1">Region:</span>
                    {REGIONS.map((r) => (
                      <button
                        key={r.code}
                        type="button"
                        onClick={() => setSelectedRegion(r.code)}
                        className={cn(
                          "flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium transition-colors",
                          selectedRegion === r.code
                            ? "border-primary bg-primary/10 text-primary font-semibold"
                            : "border-transparent bg-muted/40 text-muted-foreground hover:bg-muted"
                        )}
                      >
                        <span>{r.flag}</span>
                        <span>{r.code}</span>
                      </button>
                    ))}
                  </div>

                  {/* Multitask Mode Toggle */}
                  <button
                    type="button"
                    onClick={() => {
                      setMultitaskMode((prev) => !prev);
                      setSelectedIds([]);
                    }}
                    className={cn(
                      "flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-semibold transition-colors",
                      multitaskMode
                        ? "border-primary bg-primary text-primary-foreground shadow-2xs"
                        : "border-muted bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground"
                    )}
                  >
                    <Layers className="size-3.5" />
                    <span>Multitask</span>
                  </button>

                  {/* Quick Refresh Button */}
                  <button
                    type="button"
                    onClick={() => void fetchTrendingData(selectedPlatform, selectedRegion, selectedNiche, selectedTimeframe, true)}
                    disabled={refreshing || loading}
                    title="Refresh Trending from YouTube"
                    className="flex items-center gap-1.5 rounded-lg border border-muted bg-muted/50 px-2.5 py-1 text-xs font-semibold text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                  >
                    <RefreshCw className={cn("size-3.5", refreshing && "animate-spin text-primary")} />
                    <span className="hidden sm:inline">Refresh</span>
                  </button>
                </div>
              </div>

              {/* Niche Chips */}
              <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none pt-1 border-t">
                <span className="text-[11px] text-muted-foreground font-medium mr-1 shrink-0">Niche:</span>
                {NICHES.map((n) => (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => setSelectedNiche(n.id)}
                    className={cn(
                      "shrink-0 rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                      selectedNiche === n.id
                        ? "bg-foreground text-background font-semibold"
                        : "bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground"
                    )}
                  >
                    {n.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Auto-Clip Mode Banner (Single vs Multitask) */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 rounded-xl border border-primary/20 bg-primary/5 px-4 py-2.5">
              <div className="flex items-center gap-2.5">
                <span className="flex size-7 items-center justify-center rounded-lg bg-primary/20 text-primary">
                  {multitaskMode ? <Layers className="size-3.5" /> : <Sparkles className="size-3.5" />}
                </span>
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-semibold text-foreground">
                      {multitaskMode ? "Multitask Batch Auto-Clip" : "Auto-Clip Mode"}
                    </span>
                    <Badge variant="secondary" className="text-[10px] py-0 px-1.5 font-mono">
                      {multitaskMode ? "Concurrent" : "Autonomous"}
                    </Badge>
                    <Badge variant="outline" className="text-[10px] py-0 px-1.5 text-emerald-600 dark:text-emerald-400 border-emerald-500/30">
                      ⚡ Past 24h
                    </Badge>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    {multitaskMode
                      ? `Select multiple videos to clip simultaneously in parallel without waiting (${selectedIds.length} selected).`
                      : `Automatically selects the #1 ranked video in ${selectedNiche === "all" ? "trending" : selectedNiche} & finds viral moments.`}
                  </p>
                </div>
              </div>

              {multitaskMode ? (
                <div className="flex items-center gap-2 flex-wrap">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={toggleSelectAll}
                    disabled={loading || videos.length === 0}
                    className="h-8 text-xs"
                  >
                    {selectedIds.length === Math.min(6, videos.length) ? "Deselect" : "Select Top 6"}
                  </Button>
                  {selectedIds.length > 0 && (
                    <Button
                      size="sm"
                      onClick={() => {
                        const targets = videos.filter((v) => selectedIds.includes(v.id));
                        void handleBatchClip(targets);
                      }}
                      disabled={Boolean(batchProgress?.active)}
                      className="gap-1.5 text-xs font-semibold h-8 bg-primary text-primary-foreground hover:bg-primary/90"
                    >
                      {batchProgress?.active ? <Loader2 className="size-3.5 animate-spin" /> : <Scissors className="size-3.5" />}
                      <span>Clip Selected ({selectedIds.length})</span>
                    </Button>
                  )}
                  <Button
                    size="sm"
                    onClick={() => void handleAutoClipTopBatch(3)}
                    disabled={loading || videos.length === 0 || Boolean(batchProgress?.active)}
                    className="gap-1.5 text-xs font-semibold h-8 bg-foreground text-background hover:bg-foreground/90"
                  >
                    {batchProgress?.active ? <Loader2 className="size-3.5 animate-spin" /> : <Zap className="size-3.5" />}
                    <span>Auto-Clip Top 3</span>
                  </Button>
                </div>
              ) : (
                <Button
                  size="sm"
                  onClick={handleAutoClipTopVideo}
                  disabled={loading || videos.length === 0 || Boolean(clippingId)}
                  className="gap-1.5 text-xs font-semibold h-8 shrink-0 bg-primary text-primary-foreground hover:bg-primary/90"
                >
                  {clippingId ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="size-3.5" />
                  )}
                  <span>Auto-Clip #1 Video</span>
                </Button>
              )}
            </div>

            {/* Batch Progress Bar */}
            {batchProgress?.active && (
              <div className="rounded-xl border border-primary/30 bg-primary/10 p-3 space-y-1.5 animate-in fade-in">
                <div className="flex items-center justify-between text-xs font-semibold text-primary">
                  <span className="flex items-center gap-1.5">
                    <Loader2 className="size-3.5 animate-spin" />
                    <span>Multitask Queue: Launching batch clipping tasks...</span>
                  </span>
                  <span>{batchProgress.current} / {batchProgress.total}</span>
                </div>
                <div className="h-1.5 w-full bg-primary/20 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary transition-all duration-300"
                    style={{ width: `${Math.round((batchProgress.current / batchProgress.total) * 100)}%` }}
                  />
                </div>
              </div>
            )}

            {/* Video Cards Grid */}
            {loading ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="rounded-xl border bg-card p-3 space-y-3">
                    <Skeleton className="aspect-video w-full rounded-lg" />
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-1/2" />
                  </div>
                ))}
              </div>
            ) : videos.length === 0 ? (
              <div className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
                No videos found for this filter. Try selecting another niche or region.
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {videos.map((video) => {
                  const isSelected = selectedIds.includes(video.id);
                  return (
                    <div
                      key={video.id}
                      onClick={() => {
                        if (multitaskMode) toggleSelectVideo(video.id);
                      }}
                      className={cn(
                        "flex flex-col justify-between overflow-hidden rounded-xl border bg-card transition-all hover:border-foreground/20 hover:shadow-2xs",
                        multitaskMode && "cursor-pointer",
                        isSelected && "ring-2 ring-primary border-primary bg-primary/5"
                      )}
                    >
                      <div>
                        {/* Thumbnail & Badges */}
                        <div className="group/thumb relative aspect-video w-full bg-muted overflow-hidden">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={video.thumbnail}
                            alt={video.title}
                            className="size-full object-cover transition-transform duration-300 group-hover/thumb:scale-105"
                            loading="lazy"
                            onError={(e) => {
                              const target = e.currentTarget;
                              if (video.url?.includes("youtube.com") || video.url?.includes("youtu.be")) {
                                const m = video.url.match(/(?:v=|\/)([0-9A-Za-z_-]{11})/);
                                if (m && !target.src.includes("img.youtube.com")) {
                                  target.src = `https://img.youtube.com/vi/${m[1]}/hqdefault.jpg`;
                                  return;
                                }
                              }
                              target.src = "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=640&auto=format&fit=crop&q=80";
                            }}
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/30 pointer-events-none" />

                          {/* Hover Play Button */}
                          <div className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-0 transition-opacity duration-200 group-hover/thumb:opacity-100">
                            <span className="flex size-11 items-center justify-center rounded-full bg-white/90 text-black shadow-lg">
                              <Play className="ml-0.5 size-5 fill-current" />
                            </span>
                          </div>

                          <div className="absolute top-2 left-2 flex items-center gap-1.5">
                            <Badge variant="secondary" className="bg-background/90 backdrop-blur-xs font-semibold text-[11px] shadow-2xs">
                              {video.platform_icon || (video.platform === "twitch" ? "🟣" : "▶️")} {video.platform === "twitch" ? "Twitch" : "YouTube"}
                            </Badge>
                            {video.virality_score != null ? (
                              <Badge
                                title={video.score_explanation || "Calculated from view velocity & engagement"}
                                className="bg-amber-500 text-white font-bold text-[11px] shadow-2xs"
                              >
                                ⚡ {video.virality_score}
                              </Badge>
                            ) : (
                              <Badge
                                variant="secondary"
                                title={video.score_explanation || "Live metrics not available from feed"}
                                className="bg-background/80 text-muted-foreground font-medium text-[10px] shadow-2xs border border-dashed"
                              >
                                {video.score_explanation ? "Estimated" : "New"}
                              </Badge>
                            )}
                          </div>

                          {/* Multitask selection checkbox */}
                          {multitaskMode && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleSelectVideo(video.id);
                              }}
                              className={cn(
                                "absolute top-2 right-2 flex size-6 items-center justify-center rounded-md border shadow-xs transition-colors",
                                isSelected
                                  ? "bg-primary text-primary-foreground border-primary"
                                  : "bg-background/90 text-muted-foreground border-border/80 hover:bg-background"
                              )}
                            >
                              {isSelected ? <Check className="size-3.5" /> : <Square className="size-3.5" />}
                            </button>
                          )}

                          {video.duration && (
                            <div className="absolute bottom-2 right-2 rounded bg-black/80 px-1.5 py-0.5 font-mono text-[10px] text-white">
                              {video.duration}
                            </div>
                          )}
                        </div>

                        {/* Content Info */}
                        <div className="p-3.5 space-y-2">
                          <h3 className="line-clamp-2 text-sm font-semibold leading-snug text-foreground" title={video.title}>
                            {video.title}
                          </h3>
                          <div className="flex items-center justify-between text-xs text-muted-foreground">
                            <span className="font-medium truncate max-w-[140px] text-foreground/80">{video.channel}</span>
                            <div className="flex items-center gap-1.5">
                              <span className="inline-flex items-center gap-1 rounded bg-emerald-500/10 px-1.5 py-0.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                                ⚡ {video.published}
                              </span>
                              <span className="tabular-nums">{video.views}</span>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Action Footer */}
                      <div className="flex items-center gap-2 border-t bg-muted/20 p-2.5">
                        <Button
                          size="sm"
                          className={cn(
                            "flex-1 gap-1.5 text-xs font-semibold h-8",
                            isSelected && "bg-primary text-primary-foreground"
                          )}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (multitaskMode) {
                              toggleSelectVideo(video.id);
                            } else {
                              void handleAutoClip(video);
                            }
                          }}
                          disabled={clippingId === video.id}
                        >
                          {clippingId === video.id ? (
                            <>
                              <Loader2 className="size-3.5 animate-spin" />
                              <span>Starting Clip...</span>
                            </>
                          ) : multitaskMode ? (
                            <>
                              {isSelected ? <Check className="size-3.5" /> : <Layers className="size-3.5" />}
                              <span>{isSelected ? "Selected" : "Select"}</span>
                            </>
                          ) : (
                            <>
                              <Scissors className="size-3.5" />
                              <span>⚡ Clip This Video</span>
                            </>
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          asChild
                          className="h-8 w-8 text-muted-foreground hover:text-foreground"
                          title="Watch on Source"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <a href={video.url} target="_blank" rel="noopener noreferrer">
                            <ExternalLink className="size-3.5" />
                          </a>
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* TAB 2: Live Stream Monitor */}
        {activeTab === "live_monitor" && (
          <div className="mt-4 space-y-4">
            {/* Architecture Preview Banner */}
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3.5 text-xs text-foreground flex items-start gap-2.5">
              <span className="text-base select-none">🧪</span>
              <div className="space-y-0.5">
                <span className="font-semibold block text-amber-600 dark:text-amber-400">Stream Ingestion & Chat Spikes (Preview Architecture)</span>
                <span className="text-[11px] leading-relaxed block text-muted-foreground">
                  This interface previews real-time stream ingestion and rolling hype detection. Production live chat tracking requires active Twitch IRC or YouTube Live Chat connector rolling buffers. To clip active streams, select an archived VOD or completed clip URL.
                </span>
              </div>
            </div>

            {/* Auto-Upload Distribution Integration */}
            <AutoUploadModule />

            {/* Input & Presets */}
            <div className="rounded-xl border bg-card p-4 shadow-2xs space-y-3">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-sm font-semibold tracking-tight">Autonomous Live Stream Clipper</h2>
                  <p className="text-xs text-muted-foreground">
                    Select any live stream to immediately detect peak chat spikes and automatically clip the best moment with zero extra clicks.
                  </p>
                </div>
                <Badge variant="outline" className="w-fit text-[10px] gap-1 text-amber-500 border-amber-500/30 bg-amber-500/10">
                  <Zap className="size-3 fill-amber-500" /> Truly Automatic
                </Badge>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  value={streamInput}
                  onChange={(e) => setStreamInput(e.target.value)}
                  placeholder="https://www.twitch.tv/tarik or https://youtube.com/watch?v=..."
                  className="flex-1 text-xs h-9"
                />
                <Button
                  onClick={() => handleLiveMonitor(undefined, undefined, true)}
                  disabled={monitoringStream}
                  className="gap-2 shrink-0 text-xs font-semibold h-9 bg-linear-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white"
                >
                  {monitoringStream ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Zap className="size-3.5 text-yellow-200 fill-yellow-200" />
                  )}
                  <span>Auto-Clip Live Stream</span>
                </Button>
              </div>

              {/* Quick Streamer Presets */}
              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                <span className="text-[11px] text-muted-foreground font-medium mr-1">Quick Presets:</span>
                {PRESET_STREAMS.map((preset) => (
                  <button
                    key={preset.name}
                    type="button"
                    onClick={() => {
                      setStreamInput(preset.url);
                      void handleLiveMonitor(preset.url, preset.channel, true);
                    }}
                    className="inline-flex items-center gap-1 rounded-md border bg-muted/40 px-2 py-0.5 text-[11px] hover:bg-muted font-medium transition-colors"
                  >
                    <span>{preset.icon}</span>
                    <span>{preset.name}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Autonomous Clip Status Banner */}
            {autoClippedMomentId && (
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3.5 text-xs shadow-xs">
                <div className="flex items-center gap-3">
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-500">
                    <Zap className="size-4 fill-emerald-500" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-foreground">Peak Hype Moment Auto-Clipped!</span>
                      <Badge className="bg-emerald-500 text-white text-[10px] px-1.5 py-0 h-4">Autonomous Queue</Badge>
                    </div>
                    <p className="text-muted-foreground text-[11px]">
                      The #1 peak moment was automatically identified and queued for vertical video generation without requiring an extra click.
                    </p>
                  </div>
                </div>
                {activeLiveTaskId && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-emerald-500/40 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10 text-xs h-7.5 gap-1.5 shrink-0"
                    onClick={() => router.push(`/tasks/${activeLiveTaskId}`)}
                  >
                    <span>View Clip Progress</span>
                    <ExternalLink className="size-3" />
                  </Button>
                )}
              </div>
            )}

            {/* Live Stats Summary */}
            {liveResult && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-3 shadow-2xs text-xs">
                <div className="flex items-center gap-2">
                  <span className="flex size-2 rounded-full bg-red-500 animate-pulse" />
                  <span className="font-bold text-foreground">{liveResult.channel} Live</span>
                  <span className="text-muted-foreground capitalize">({liveResult.platform})</span>
                </div>
                <div className="flex items-center gap-3 text-muted-foreground">
                  <div>
                    <span className="text-[10px] uppercase block">Velocity</span>
                    <span className="font-semibold text-foreground">{liveResult.active_chat_velocity}</span>
                  </div>
                  <div className="h-4 w-px bg-border" />
                  <div>
                    <span className="text-[10px] uppercase block">Hype Score</span>
                    <span className="font-semibold text-amber-500">{liveResult.hype_index}</span>
                  </div>
                  <div className="h-4 w-px bg-border" />
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleBatchClipMoments(liveResult.detected_moments)}
                    className="gap-1.5 text-xs h-7 font-medium border-amber-500/30 hover:bg-amber-500/10 text-amber-600 dark:text-amber-400"
                  >
                    <Zap className="size-3 fill-current" />
                    <span>Auto-Clip All Moments ({liveResult.detected_moments.length})</span>
                  </Button>
                </div>
              </div>
            )}

            {/* Moments List */}
            {liveResult && (
              <div className="space-y-3">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Detected Moments ({liveResult.detected_moments.length})
                </h3>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {liveResult.detected_moments.map((moment) => {
                    const isDiffOpen = Boolean(expandedDiffs[moment.id]);
                    const isAutoClipped = moment.id === autoClippedMomentId;
                    return (
                      <div
                        key={moment.id}
                        className={cn(
                          "flex flex-col justify-between rounded-xl border bg-card p-4 transition-all hover:border-foreground/20 hover:shadow-2xs space-y-3",
                          isAutoClipped && "border-emerald-500/40 bg-emerald-500/5 ring-1 ring-emerald-500/20"
                        )}
                      >
                        <div className="space-y-2.5">
                          {/* Header pill */}
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5">
                              <Badge className="bg-amber-500/15 text-amber-600 dark:text-amber-400 font-bold text-[11px] border-amber-500/20">
                                🔥 {moment.hype_score}/100 Hype
                              </Badge>
                              {isAutoClipped && (
                                <Badge className="bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 font-bold text-[10px] border-emerald-500/30 flex items-center gap-1">
                                  <Zap className="size-2.5 fill-current" /> Auto-Clipped
                                </Badge>
                              )}
                            </div>
                            <span className="text-[11px] font-mono text-muted-foreground bg-muted px-2 py-0.5 rounded">
                              ⏱️ {moment.timestamp_label}
                            </span>
                          </div>

                          <h4 className="text-xs font-semibold leading-snug text-foreground">
                            {moment.title}
                          </h4>

                          <div className="text-[11px] text-muted-foreground space-y-1">
                            <div className="flex justify-between">
                              <span>Chat Velocity:</span>
                              <span className="font-medium text-foreground">{moment.chat_velocity}</span>
                            </div>
                            <div className="flex justify-between">
                              <span>Sentiment:</span>
                              <span className="text-foreground">{moment.sentiment}</span>
                            </div>
                          </div>

                          {/* Important Words ('Imp Words') */}
                          {moment.important_words && moment.important_words.length > 0 && (
                            <div className="pt-1">
                              <span className="block text-[10px] text-muted-foreground font-semibold uppercase tracking-wider mb-1">
                                💡 Imp Words:
                              </span>
                              <div className="flex flex-wrap gap-1">
                                {moment.important_words.map((w) => (
                                  <span
                                    key={w}
                                    className="rounded bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 text-[10px] font-mono font-bold text-amber-600 dark:text-amber-400"
                                  >
                                    {w}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Spoken Transcript Box */}
                          {moment.spoken_transcript && (
                            <div className="rounded-lg border bg-muted/40 p-2 text-xs">
                              <div className="flex items-center justify-between text-[10px] text-muted-foreground font-medium mb-1">
                                <span>🎙️ Streamer Speech</span>
                                <span className="text-emerald-500 font-semibold">Self-Healed ✓</span>
                              </div>
                              <p className="text-[11px] text-foreground leading-relaxed italic">
                                &ldquo;{moment.spoken_transcript}&rdquo;
                              </p>
                            </div>
                          )}

                          {/* AI Transcription Error Check Diff */}
                          {moment.transcription_error_check && (
                            <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-2 text-[11px]">
                              <button
                                type="button"
                                onClick={() => toggleDiff(moment.id)}
                                className="flex w-full items-center justify-between font-medium text-emerald-600 dark:text-emerald-400"
                              >
                                <span>
                                  🛡️ {moment.transcription_error_check.accuracy_score} (
                                  {moment.transcription_error_check.error_count} fixes)
                                </span>
                                {isDiffOpen ? (
                                  <ChevronUp className="size-3" />
                                ) : (
                                  <ChevronDown className="size-3" />
                                )}
                              </button>

                              {isDiffOpen && (
                                <div className="mt-2 space-y-1.5 border-t border-emerald-500/20 pt-2 font-mono text-[10px]">
                                  {moment.transcription_error_check.corrections_applied.map((c, idx) => (
                                    <div key={idx} className="flex items-center justify-between text-muted-foreground">
                                      <span className="line-through text-red-400">{c.raw}</span>
                                      <span className="text-foreground">➔</span>
                                      <span className="text-emerald-500 font-semibold">{c.corrected}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Action Auto-Clip */}
                        <div className="pt-2 border-t">
                          {isAutoClipped && activeLiveTaskId ? (
                            <Button
                              size="sm"
                              variant="outline"
                              className="w-full gap-1.5 text-xs font-semibold h-8 border-emerald-500/40 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10"
                              onClick={() => router.push(`/tasks/${activeLiveTaskId}`)}
                            >
                              <ExternalLink className="size-3.5" />
                              <span>View Clip Progress</span>
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              className="w-full gap-1.5 text-xs font-semibold h-8"
                              onClick={() => handleAutoClipHypeMoment(moment, true)}
                              disabled={clippingId === moment.id}
                            >
                              {clippingId === moment.id ? (
                                <Loader2 className="size-3.5 animate-spin" />
                              ) : (
                                <Scissors className="size-3.5" />
                              )}
                              <span>Clip This Moment</span>
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 3: Speech & Error Lab */}
        {activeTab === "speech_lab" && (
          <div className="mt-4 max-w-3xl space-y-4">
            <div className="rounded-xl border bg-card p-4 shadow-2xs space-y-3">
              <div>
                <h2 className="text-sm font-semibold tracking-tight">Speech Recognition & Error-Healing Lab</h2>
                <p className="text-xs text-muted-foreground">
                  Paste any streamer transcript to extract high-impact important words and self-heal speech errors using the local Ollama AI model.
                </p>
              </div>

              <Textarea
                value={customSpeech}
                onChange={(e) => setCustomSpeech(e.target.value)}
                placeholder="Paste speech transcript with phonetic or slang errors..."
                rows={3}
                className="text-xs font-mono"
              />

              <div className="flex items-center justify-between">
                <Button
                  onClick={handleSpeechCheck}
                  disabled={testingSpeech}
                  size="sm"
                  className="gap-2 text-xs font-medium"
                >
                  {testingSpeech ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Wand2 className="size-3.5 text-primary" />
                  )}
                  <span>Run Error-Check & Imp Words</span>
                </Button>

                <button
                  type="button"
                  onClick={() =>
                    setCustomSpeech(
                      "tar rick is one v five on val or ant bro no shoot he is actually aceing this right now lets goooo"
                    )
                  }
                  className="text-[11px] text-muted-foreground hover:text-foreground underline"
                >
                  Load Gaming Sample
                </button>
              </div>
            </div>

            {/* Analysis Result */}
            {speechAnalysisResult && (
              <div className="rounded-xl border bg-card p-4 shadow-2xs space-y-4 text-xs">
                <div className="flex items-center justify-between border-b pb-2">
                  <span className="font-semibold text-foreground">Analysis & Healing Output</span>
                  <Badge variant="outline" className="border-emerald-500/30 text-emerald-500 font-mono text-[11px]">
                    {speechAnalysisResult.accuracy_score}
                  </Badge>
                </div>

                {/* Extracted Imp Words */}
                <div>
                  <span className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                    💡 Important Keywords (&ldquo;Imp Words&rdquo;):
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {(speechAnalysisResult.important_words ?? []).map((w: string) => (
                      <Badge key={w} className="bg-amber-500/15 text-amber-600 dark:text-amber-400 font-mono font-bold">
                        ⚡ {w}
                      </Badge>
                    ))}
                  </div>
                </div>

                {/* Polished Speech */}
                <div>
                  <span className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                    ✨ Self-Healed & Polished Speech:
                  </span>
                  <div className="rounded-lg border bg-muted/40 p-2.5 font-medium leading-relaxed">
                    &ldquo;{speechAnalysisResult.corrected_speech}&rdquo;
                  </div>
                </div>

                {/* Errors Detected & Fixed */}
                {speechAnalysisResult.corrections_applied.length > 0 && (
                  <div>
                    <span className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                      🛡️ Corrections Applied ({speechAnalysisResult.corrections_applied.length}):
                    </span>
                    <div className="space-y-1.5 font-mono text-[11px]">
                      {speechAnalysisResult.corrections_applied.map((c, i) => (
                        <div
                          key={i}
                          className="flex items-center justify-between rounded-md border bg-muted/20 px-2 py-1"
                        >
                          <span className="line-through text-red-400">{c.raw}</span>
                          <span className="text-muted-foreground">➔</span>
                          <span className="text-emerald-500 font-semibold">{c.corrected}</span>
                          {c.reason && (
                            <span className="text-[10px] text-muted-foreground">({c.reason})</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </main>
    </AppShell>
  );
}
