"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { PaymentFailedBanner } from "@/components/payment-failed-banner";
import { SubscriptionCancelBanner } from "@/components/subscription-cancel-banner";
import { DeleteAccountSection } from "@/components/delete-account-section";
import { EmailChangeSection } from "@/components/email-change-section";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { useSession } from "@/lib/auth-client";
import { useSocialAccess } from "@/hooks/use-social-access";
import { useWorkspace } from "@/hooks/use-workspace";
import {
  annualFullPrice,
  annualMonthlyEquivalent,
  annualMonthsFree,
  getPublicBillingPlans,
  getTeamBillingConfig,
  isPaidBillingPlan,
  planPrice,
  type BillingInterval,
  type BillingPlanId,
} from "@/lib/billing-plans";
import { LanguageSwitcher } from "@/components/language-switcher";
import { BillingIntervalToggle, ComingSoonTag, UpgradeNudge, getUpgradeState, useBillingPlanText } from "@/components/billing/upgrade-prompt";
import type { BillingSummary } from "@/hooks/use-billing-summary";
import { startUpgrade } from "@/lib/start-upgrade";
import { CreatorCodeField } from "@/components/billing/creator-code-field";
import { UpgradeThankYou } from "@/components/billing/upgrade-thank-you";
import { toast } from "sonner";
import { track } from "@/lib/datafast";
import Link from "next/link";
import { AlertCircle, Bot, Check, ChevronRight, Clock, Cpu, CreditCard, Info, Languages, Layers, Loader2, Mail, Megaphone, Mic, RefreshCw, Send, Share2, Sparkles, Type, Users, Volume2, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { DEFAULT_SITE_URL, GITHUB_URL } from "@/lib/site";
import { FontSelectOption, type FontOption } from "@/components/font-select-option";
import { SocialProviderIcon } from "@/components/social-provider-icon";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { PROVIDER_LABELS, type SocialConnection, type SocialProviderId } from "@/lib/social";

interface UserPreferences {
  fontFamily: string;
  fontSize: number;
  fontColor: string;
  notifyOnCompletion: boolean;
  notifyOnPublish: boolean;
}

export default function SettingsPage() {
  const [fontFamily, setFontFamily] = useState("TikTokSans-Regular");
  const [fontSize, setFontSize] = useState(24);
  const [fontColor, setFontColor] = useState("#FFFFFF");
  const [completionEmails, setCompletionEmails] = useState(true);
  const [publishEmails, setPublishEmails] = useState(false);
  const [availableFonts, setAvailableFonts] = useState<FontOption[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isFetching, setIsFetching] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [billingSummary, setBillingSummary] = useState<BillingSummary | null>(null);
  const [savedSnapshot, setSavedSnapshot] = useState<string | null>(null);
  const [isBillingActionLoading, setIsBillingActionLoading] = useState(false);
  const [canCancelTransfer, setCanCancelTransfer] = useState(false);
  const [billingInterval, setBillingInterval] = useState<BillingInterval>("month");
  // Back from checkout: wait for the paid plan, then thank them on the plan card.
  const [celebration, setCelebration] = useState<"waiting" | "show" | null>(null);
  const { data: session, isPending, refetch: refetchSession } = useSession();
  const socialAccess = useSocialAccess(Boolean(session?.user));
  const { teams, teamsAvailable } = useWorkspace(Boolean(session?.user));

  // Auto-Clip Mode & AI Radar Settings
  const [autoClipNiche, setAutoClipNiche] = useState("all");
  const [autoClipRegion, setAutoClipRegion] = useState("US");
  const [autoClipTimeframe, setAutoClipTimeframe] = useState("24h");
  const [autoClipMaxClips, setAutoClipMaxClips] = useState("5");
  const [autoClipHealing, setAutoClipHealing] = useState(true);
  const [autoClipImpWords, setAutoClipImpWords] = useState(true);
  const [autoClipLearning, setAutoClipLearning] = useState(true);
  const [localModel, setLocalModel] = useState("ollama:qwen2.5:7b");
  const [chunkedDownload, setChunkedDownload] = useState(true);
  const [chunkDuration, setChunkDuration] = useState("180");
  const [aiVoiceHook, setAiVoiceHook] = useState(true);
  const [aiVoiceStyle, setAiVoiceStyle] = useState("viral_guy");

  // Social Connections & Direct Post state
  const [socialConnections, setSocialConnections] = useState<SocialConnection[]>([]);
  const [loadingSocial, setLoadingSocial] = useState(false);
  const [directPostOpen, setDirectPostOpen] = useState(false);
  const [directPostTitle, setDirectPostTitle] = useState("");
  const [directPostCaption, setDirectPostCaption] = useState("");
  const [directPostProvider, setDirectPostProvider] = useState<SocialProviderId>("youtube");
  const [isPosting, setIsPosting] = useState(false);

  const loadSocialData = useCallback(async () => {
    setLoadingSocial(true);
    try {
      const connRes = await fetch("/api/social/connections", { cache: "no-store" });
      if (connRes.ok) {
        const cData = await connRes.json();
        setSocialConnections(cData.connections || []);
      }
    } catch {}
    setLoadingSocial(false);
  }, []);

  useEffect(() => {
    if (session?.user?.id) {
      void loadSocialData();
    }
  }, [session?.user?.id, loadSocialData]);

  const handleDirectPost = async () => {
    if (!directPostCaption.trim()) {
      toast.error("Please enter a caption or description for your post");
      return;
    }
    setIsPosting(true);
    try {
      const res = await fetch("/api/social/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: directPostProvider,
          title: directPostTitle.trim() || "Trending Viral Clip",
          caption: directPostCaption.trim(),
          privacy_level: "public",
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || err.error || "Failed to publish post");
      }
      toast.success(`Post successfully queued for publishing to ${directPostProvider}!`);
      setDirectPostOpen(false);
      setDirectPostCaption("");
      setDirectPostTitle("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to publish post");
    } finally {
      setIsPosting(false);
    }
  };

  useEffect(() => {
    try {
      const stored = localStorage.getItem("supoclip_autoclip_settings");
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.niche) setAutoClipNiche(parsed.niche);
        if (parsed.region) setAutoClipRegion(parsed.region);
        if (parsed.timeframe) setAutoClipTimeframe(parsed.timeframe);
        if (parsed.maxClips) setAutoClipMaxClips(parsed.maxClips);
        if (parsed.speechHealing !== undefined) setAutoClipHealing(parsed.speechHealing);
        if (parsed.impWords !== undefined) setAutoClipImpWords(parsed.impWords);
        if (parsed.learningLoop !== undefined) setAutoClipLearning(parsed.learningLoop);
        if (parsed.localModel) setLocalModel(parsed.localModel);
        if (parsed.chunkedDownload !== undefined) setChunkedDownload(parsed.chunkedDownload);
        if (parsed.chunkDuration) setChunkDuration(parsed.chunkDuration);
        if (parsed.aiVoiceHook !== undefined) setAiVoiceHook(parsed.aiVoiceHook);
        if (parsed.aiVoiceStyle) setAiVoiceStyle(parsed.aiVoiceStyle);
      }
    } catch {}
  }, []);

  const updateAutoClipSetting = (key: string, val: string | number | boolean) => {
    try {
      const current = JSON.parse(localStorage.getItem("supoclip_autoclip_settings") || "{}");
      current[key] = val;
      localStorage.setItem("supoclip_autoclip_settings", JSON.stringify(current));
      toast.success("Auto-Clip settings saved");
    } catch {}
  };

  const t = useTranslations("settings");
  const common = useTranslations("common");
  const tLang = useTranslations("language");
  const plans = useBillingPlanText();

  const paidPlans = getPublicBillingPlans();
  const teamConfig = getTeamBillingConfig();
  const isTeamWorkspace = billingSummary?.workspace_type === "team";
  const upgradeState = getUpgradeState(billingSummary);
  const paymentNeedsUpdate = upgradeState?.needsPayment ?? false;
  const currentPaidPlan = paidPlans.find((plan) => plan.id === billingSummary?.plan);

  // Stripe sends people back here after checkout or a plan change.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const outcome = params.get("billing");
    if (outcome === "success" || outcome === "upgraded") setCelebration("waiting");
    if (outcome) {
      params.delete("billing");
      const query = params.toString();
      window.history.replaceState(null, "", `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`);
    }
  }, []);

  // Stripe's webhook can land a moment after the redirect, so look again for a
  // few seconds. If the plan still isn't paid, fall back to a plain toast.
  useEffect(() => {
    if (celebration !== "waiting" || !billingSummary) return;
    if (billingSummary.monetization_enabled && isPaidBillingPlan(billingSummary.plan)) {
      setCelebration("show");
      document.getElementById("plan")?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    let attempts = 0;
    const timer = window.setInterval(async () => {
      attempts += 1;
      try {
        const response = await fetch("/api/tasks/billing-summary", { cache: "no-store" });
        if (response.ok) {
          const data: BillingSummary = await response.json();
          if (isPaidBillingPlan(data.plan)) {
            window.clearInterval(timer);
            setBillingSummary(data);
            return;
          }
        }
      } catch {
        // Try again on the next tick.
      }
      if (attempts >= 8) {
        window.clearInterval(timer);
        setCelebration(null);
        toast.success(t("toasts.ready"));
      }
    }, 1500);
    return () => window.clearInterval(timer);
  }, [celebration, billingSummary, t]);

  const handlePlanChange = async (plan: BillingPlanId, interval: BillingInterval) => {
    setIsBillingActionLoading(true);
    try {
      await startUpgrade(plan, "settings", interval);
    } catch (upgradeError) {
      toast.error(upgradeError instanceof Error ? upgradeError.message : plans.t("checkoutError"));
      setIsBillingActionLoading(false);
    }
  };

  // Load available fonts from backend and inject them into the page
  useEffect(() => {
    const loadFonts = async () => {
      try {
        const response = await fetch('/api/fonts', { cache: 'no-store' });
        if (response.ok) {
          const data = await response.json();
          setAvailableFonts(data.fonts || []);

          // Dynamically load fonts using @font-face
          const fontFaceStyles = data.fonts.map((font: { name: string }) => {
            return `
              @font-face {
                font-family: '${font.name}';
                src: url('/api/fonts/${font.name}') format('truetype');
                font-weight: normal;
                font-style: normal;
              }
            `;
          }).join('\n');

          // Inject font styles into the page
          const styleElement = document.createElement('style');
          styleElement.id = 'custom-fonts';
          styleElement.innerHTML = fontFaceStyles;

          // Remove existing custom fonts style if present
          const existingStyle = document.getElementById('custom-fonts');
          if (existingStyle) {
            existingStyle.remove();
          }

          document.head.appendChild(styleElement);
        }
      } catch (error) {
        console.error('Failed to load fonts:', error);
      }
    };

    loadFonts();
  }, []);

  // Load user preferences
  useEffect(() => {
    const loadPreferences = async () => {
      if (!session?.user?.id) return;

      setIsFetching(true);
      try {
        const response = await fetch('/api/preferences');
        if (response.ok) {
          const data: UserPreferences = await response.json();
          setFontFamily(data.fontFamily);
          setFontSize(data.fontSize);
          setFontColor(data.fontColor);
          setCompletionEmails(data.notifyOnCompletion ?? true);
          setPublishEmails(data.notifyOnPublish ?? false);
          setSavedSnapshot(
            JSON.stringify([
              data.fontFamily,
              data.fontSize,
              data.fontColor,
              data.notifyOnCompletion ?? true,
              data.notifyOnPublish ?? false,
            ]),
          );
        }
      } catch (error) {
        console.error('Failed to load preferences:', error);
      } finally {
        setIsFetching(false);
      }
    };

    loadPreferences();
  }, [session?.user?.id]);

  useEffect(() => {
    const fetchBillingSummary = async () => {
      if (!session?.user?.id) return;

      try {
        const response = await fetch("/api/tasks/billing-summary", {
          cache: "no-store",
        });

        if (!response.ok) {
          return;
        }

        const data: BillingSummary = await response.json();
        setBillingSummary(data);
      } catch (fetchError) {
        console.error("Failed to fetch billing summary:", fetchError);
      }
    };

    fetchBillingSummary();
  }, [session?.user?.id]);

  const handleBillingAction = async (selectedPlan?: BillingPlanId) => {
    if (!billingSummary?.monetization_enabled) return;

    const isPaid = isPaidBillingPlan(billingSummary.plan);

    if (!isPaid) {
      // Checkout goes through startUpgrade so a remembered creator code is applied.
      try {
        setIsBillingActionLoading(true);
        track("billing_checkout_started", { plan: billingSummary.plan, selected_plan: selectedPlan });
        await startUpgrade(selectedPlan ?? "pro", "settings", billingInterval);
      } catch (billingError) {
        setError(billingError instanceof Error ? billingError.message : t("plan.actionFailed"));
        setIsBillingActionLoading(false);
      }
      return;
    }

    try {
      setIsBillingActionLoading(true);
      const response = await fetch("/api/billing/portal", { method: "POST" });
      const responseText = await response.text();
      let data: { url?: string; error?: string; code?: string } = {};
      if (responseText) {
        try {
          data = JSON.parse(responseText);
        } catch {
          data = { error: responseText };
        }
      }

      if (!response.ok || !data.url) {
        setCanCancelTransfer(data.code === "billing_transfer_pending");
        throw new Error(data.error || t("plan.actionFailed"));
      }

      track("billing_portal_opened", { plan: billingSummary.plan });
      window.location.href = data.url;
    } catch (billingError) {
      setError(billingError instanceof Error ? billingError.message : t("plan.actionFailed"));
    } finally {
      setIsBillingActionLoading(false);
    }
  };

  const cancelTransferRenewal = async () => {
    if (!window.confirm(t("plan.transferCancelConfirm"))) return;
    setIsBillingActionLoading(true);
    try {
      const response = await fetch("/api/billing/cancel", { method: "POST" });
      const data: { error?: string } = await response.json();
      if (!response.ok) throw new Error(data.error || t("plan.actionFailed"));
      setCanCancelTransfer(false);
      setError(null);
      toast.success(t("plan.transferCancelSuccess"));
    } catch (billingError) {
      setError(billingError instanceof Error ? billingError.message : t("plan.actionFailed"));
    } finally {
      setIsBillingActionLoading(false);
    }
  };

  const handleSavePreferences = async () => {
    setIsLoading(true);
    setError(null);
    setSuccess(false);

    try {
      const response = await fetch('/api/preferences', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fontFamily,
          fontSize,
          fontColor,
          notifyOnCompletion: completionEmails,
          notifyOnPublish: publishEmails,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || t("save.failed"));
      }

      track("preferences_saved");
      setSavedSnapshot(JSON.stringify([fontFamily, fontSize, fontColor, completionEmails, publishEmails]));
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (error) {
      console.error('Error saving preferences:', error);
      setError(error instanceof Error ? error.message : t("save.failed"));
    } finally {
      setIsLoading(false);
    }
  };



  if (isPending || (session?.user && isFetching)) {
    return (
      <div role="status" aria-label={common("loading")} className="mx-auto w-full max-w-3xl space-y-6 px-4 py-8 sm:px-8 md:py-10">
        <Skeleton className="h-9 w-40" />
        {[0, 1, 2].map((key) => <Skeleton key={key} className="h-40 w-full rounded-2xl" />)}
      </div>
    );
  }

  if (!session?.user) {
    return (
      <div className="mx-auto max-w-md px-4 py-24 text-center">
        <h1 className="font-display text-3xl font-bold tracking-tight">{t("signInRequired.title")}</h1>
        <p className="mb-8 mt-3 text-muted-foreground">{t("signInRequired.body")}</p>
        <Link href="/sign-in">
          <Button size="lg">{t("signInRequired.action")}</Button>
        </Link>
      </div>
    );
  }

  const dirty = savedSnapshot !== null && savedSnapshot !== JSON.stringify([fontFamily, fontSize, fontColor, completionEmails, publishEmails]);
  // The save bar only appears once there's something to save (and briefly to confirm it).
  const showSaveBar = dirty || isLoading || success;
  const minuteLimit = billingSummary?.minute_limit ?? null;
  const usageMinutes = billingSummary?.usage_minutes ?? 0;
  const usagePct = minuteLimit ? Math.min(100, (usageMinutes / minuteLimit) * 100) : 0;
  // Monthly Stripe subscribers can move to yearly billing for the same plan.
  const canSwitchToYearly =
    currentPaidPlan &&
    billingSummary?.subscription_provider === "stripe" &&
    billingSummary.billing_interval === "month" &&
    !billingSummary.cancel_at;

  return (
    <main className={cn("mx-auto w-full max-w-3xl px-4 pt-8 sm:px-8 md:pt-10", showSaveBar ? "pb-32" : "pb-16")}>
      <h1 className="font-display text-3xl font-bold tracking-tight">{t("title")}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{t("intro")}</p>

      <div className="mt-8 space-y-6">
        <Section icon={<Languages className="size-4" />} title={tLang("label")} description={t("languageDescription")}>
          <LanguageSwitcher />
        </Section>

        <EmailChangeSection
          email={session.user.email}
          emailVerified={session.user.emailVerified}
          onChanged={() => void refetchSession()}
        />

        <Section tour="settings-captions" icon={<Type className="size-4" />} title={t("captions.title")} description={t("captions.description")}>
          <div className="grid gap-6 sm:grid-cols-[minmax(0,1fr)_150px]">
            <div className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="caption-default-font" className="text-sm">{t("captions.font")}</Label>
                <Select value={fontFamily} onValueChange={setFontFamily} disabled={isLoading}>
                  <SelectTrigger id="caption-default-font" className="w-full"><SelectValue placeholder={t("captions.selectFont")} /></SelectTrigger>
                  <SelectContent>
                    {availableFonts.map((font) => (
                      <FontSelectOption key={font.name} font={font} />
                    ))}
                    {availableFonts.length === 0 && <FontSelectOption font={{ name: "TikTokSans-Regular", display_name: "TikTok Sans Regular", scope: "system" }} />}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-sm">{t("captions.size")}</Label>
                  <span className="text-xs tabular-nums text-muted-foreground">{fontSize}px</span>
                </div>
                <Slider value={[fontSize]} onValueChange={(value) => setFontSize(value[0])} max={48} min={12} step={2} disabled={isLoading} aria-label={t("captions.fontSize")} />
              </div>

              <div className="space-y-2">
                <Label className="text-sm">{t("captions.color")}</Label>
                <div className="flex flex-wrap items-center gap-1.5">
                  {["#FFFFFF", "#000000", "#FFD700", "#FF6B6B", "#4ECDC4", "#45B7D1"].map((color) => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => setFontColor(color)}
                      disabled={isLoading}
                      title={color}
                      aria-label={t("captions.captionColor", { color })}
                      className={cn("size-8 rounded-full border-2 transition-transform hover:scale-110 disabled:cursor-not-allowed", fontColor.toUpperCase() === color ? "border-foreground" : "border-border")}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                  <label className="relative size-8 cursor-pointer overflow-hidden rounded-full border-2 border-dashed border-border" title={t("captions.customColor")}>
                    <input type="color" value={fontColor} onChange={(e) => setFontColor(e.target.value)} disabled={isLoading} className="absolute inset-0 cursor-pointer opacity-0" aria-label={t("captions.customCaptionColor")} />
                    <span className="absolute inset-1 rounded-full bg-[conic-gradient(red,yellow,lime,cyan,blue,magenta,red)]" />
                  </label>
                  <Input
                    type="text"
                    value={fontColor}
                    onChange={(e) => setFontColor(e.target.value)}
                    disabled={isLoading}
                    placeholder="#FFFFFF"
                    aria-label={t("captions.captionColorHex")}
                    className="ml-1 h-8 w-24 font-mono text-xs"
                    pattern="^#[0-9A-Fa-f]{6}$"
                  />
                </div>
              </div>
            </div>

            <div className="relative mx-auto aspect-[9/16] w-full max-w-[150px] overflow-hidden rounded-xl bg-[radial-gradient(circle_at_50%_30%,oklch(0.5_0.05_50),oklch(0.2_0.01_50))]" aria-label={t("captions.preview")}>
              <p
                className="absolute inset-x-2 top-[70%] text-center font-bold leading-snug"
                style={{
                  color: fontColor,
                  fontFamily: `'${fontFamily}', system-ui, sans-serif`,
                  fontSize: `${Math.max(Math.min(fontSize * 0.5, 18), 9)}px`,
                  textShadow: "0 2px 6px rgba(0,0,0,0.8), 0 0 2px rgba(0,0,0,0.9)",
                }}
              >
                {t("captions.sample")}
              </p>
            </div>
          </div>
        </Section>

        <Section icon={<Mail className="size-4" />} title={t("notifications.title")} description={t("notifications.description")}>
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-4">
              <Label htmlFor="completion-emails" className="flex-col items-start gap-0.5">
                <span className="text-sm font-medium">{t("notifications.emails")}</span>
                <span className="text-xs font-normal text-muted-foreground">{t("notifications.emailsHint")}</span>
              </Label>
              <Switch id="completion-emails" checked={completionEmails} onCheckedChange={setCompletionEmails} disabled={isLoading} />
            </div>
            {socialAccess === true && (
              <div className="flex items-center justify-between gap-4 border-t pt-4">
                <Label htmlFor="publish-emails" className="flex-col items-start gap-0.5">
                  <span className="text-sm font-medium">{t("notifications.publishEmails")}</span>
                  <span className="text-xs font-normal text-muted-foreground">{t("notifications.publishEmailsHint")}</span>
                </Label>
                <Switch id="publish-emails" checked={publishEmails} onCheckedChange={setPublishEmails} disabled={isLoading} />
              </div>
            )}
          </div>
        </Section>

        {/* Auto-Clip Mode & AI Radar Settings */}
        <Section
          icon={<Sparkles className="size-4 text-amber-500" />}
          title="Auto-Clip Mode & AI Radar"
          description="Configure default niche, automated clipping rules, speech healing, and continuous learning"
        >
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="autoclip-default-niche" className="text-sm">Default Content Niche</Label>
                <Select
                  value={autoClipNiche}
                  onValueChange={(val) => {
                    setAutoClipNiche(val);
                    updateAutoClipSetting("niche", val);
                  }}
                >
                  <SelectTrigger id="autoclip-default-niche" className="h-9 w-full text-xs">
                    <SelectValue placeholder="Select niche" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Trending (Curated)</SelectItem>
                    <SelectItem value="gaming">Gaming & Esports</SelectItem>
                    <SelectItem value="podcasts">Podcasts & Interviews</SelectItem>
                    <SelectItem value="tech">Tech & AI</SelectItem>
                    <SelectItem value="entertainment">Entertainment & Challenges</SelectItem>
                    <SelectItem value="education">Education & Business</SelectItem>
                    <SelectItem value="irl">IRL & Live Streamers</SelectItem>
                    <SelectItem value="music">Music (Official)</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">Filters out copyright music tracks unless Music is selected.</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="autoclip-default-region" className="text-sm">Default Region / Country</Label>
                <Select
                  value={autoClipRegion}
                  onValueChange={(val) => {
                    setAutoClipRegion(val);
                    updateAutoClipSetting("region", val);
                  }}
                >
                  <SelectTrigger id="autoclip-default-region" className="h-9 w-full text-xs">
                    <SelectValue placeholder="Select region" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="US">United States 🇺🇸</SelectItem>
                    <SelectItem value="GLOBAL">Worldwide 🌍</SelectItem>
                    <SelectItem value="GB">United Kingdom 🇬🇧</SelectItem>
                    <SelectItem value="CA">Canada 🇨🇦</SelectItem>
                    <SelectItem value="IN">India 🇮🇳</SelectItem>
                    <SelectItem value="JP">Japan 🇯🇵</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">Sets geographic trending algorithm feeds for YouTube & Twitch.</p>
              </div>

              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="autoclip-default-timeframe" className="text-sm">Discovery Timeframe</Label>
                <Select
                  value={autoClipTimeframe}
                  onValueChange={(val) => {
                    setAutoClipTimeframe(val);
                    updateAutoClipSetting("timeframe", val);
                  }}
                >
                  <SelectTrigger id="autoclip-default-timeframe" className="h-9 w-full text-xs">
                    <SelectValue placeholder="Select timeframe" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="24h">Recent 24 Hours ⚡ (Recommended - Only Breakout Content)</SelectItem>
                    <SelectItem value="all">All-Time Trending Feed</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">Restricts trending discoveries strictly to videos published within the last 24 hours.</p>
              </div>

              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="autoclip-default-max-clips" className="text-sm">Max Clips to Extract per Video</Label>
                <Select
                  value={autoClipMaxClips}
                  onValueChange={(val) => {
                    setAutoClipMaxClips(val);
                    updateAutoClipSetting("maxClips", val);
                  }}
                >
                  <SelectTrigger id="autoclip-default-max-clips" className="h-9 w-full text-xs">
                    <SelectValue placeholder="Select max clips" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="3">3 Clips (Fastest turnaround)</SelectItem>
                    <SelectItem value="5">5 Clips (Recommended - High Engagement)</SelectItem>
                    <SelectItem value="8">8 Clips (Comprehensive highlight package)</SelectItem>
                    <SelectItem value="10">10 Clips (Maximum extraction)</SelectItem>
                    <SelectItem value="auto">Auto (AI-determined optimal moments)</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">Controls how many viral clips the AI extracts from each video or live stream.</p>
              </div>
            </div>

            <div className="border-t pt-3 space-y-3">
              <div className="flex items-center justify-between gap-4">
                <Label htmlFor="speech-healing-toggle" className="flex-col items-start gap-0.5">
                  <span className="text-sm font-medium">AI Speech Recognition Self-Healing</span>
                  <span className="text-xs font-normal text-muted-foreground">
                    Automatically detect and repair phonetics, gamer slangs, and misheard creator words using local Ollama.
                  </span>
                </Label>
                <Switch
                  id="speech-healing-toggle"
                  checked={autoClipHealing}
                  onCheckedChange={(val) => {
                    setAutoClipHealing(val);
                    updateAutoClipSetting("speechHealing", val);
                  }}
                />
              </div>

              <div className="flex items-center justify-between gap-4 border-t pt-3">
                <Label htmlFor="imp-words-toggle" className="flex-col items-start gap-0.5">
                  <span className="text-sm font-medium">Important Words (&ldquo;Imp Words&rdquo;) Extraction</span>
                  <span className="text-xs font-normal text-muted-foreground">
                    Highlight high-impact keywords in generated clips and YouTuber-to-audience captions.
                  </span>
                </Label>
                <Switch
                  id="imp-words-toggle"
                  checked={autoClipImpWords}
                  onCheckedChange={(val) => {
                    setAutoClipImpWords(val);
                    updateAutoClipSetting("impWords", val);
                  }}
                />
              </div>

              <div className="flex items-center justify-between gap-4 border-t pt-3">
                <Label htmlFor="continuous-learning-toggle" className="flex-col items-start gap-0.5">
                  <span className="text-sm font-medium">Continuous Viral Learning Loop</span>
                  <span className="text-xs font-normal text-muted-foreground">
                    Autonomous agent runs in the background to learn hook formulas and increase virality scores.
                  </span>
                </Label>
                <Switch
                  id="continuous-learning-toggle"
                  checked={autoClipLearning}
                  onCheckedChange={(val) => {
                    setAutoClipLearning(val);
                    updateAutoClipSetting("learningLoop", val);
                  }}
                />
              </div>

              {/* Local AI Model Engine */}
              <div className="border-t pt-3 space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="local-model-select" className="text-sm font-medium flex items-center gap-1.5">
                    <Bot className="size-4 text-primary" />
                    <span>Local AI Model Engine (Precision Editing & Viral Cues)</span>
                  </Label>
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                    <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    RTX 4050 GPU Active
                  </span>
                </div>
                <Select
                  value={localModel}
                  onValueChange={(val) => {
                    setLocalModel(val);
                    updateAutoClipSetting("localModel", val);
                  }}
                >
                  <SelectTrigger id="local-model-select" className="h-9 w-full text-xs">
                    <SelectValue placeholder="Select Local Model" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ollama:qwen2.5:7b">Ollama: Qwen 2.5 7B (Recommended - RTX 4050 GPU Accelerated)</SelectItem>
                    <SelectItem value="ollama:qwen3.5:4b">Ollama: Qwen 3.5 4B (Fastest Local Inference)</SelectItem>
                    <SelectItem value="ollama:qwen3.5:9b">Ollama: Qwen 3.5 9B (High-Precision Reasoning)</SelectItem>
                    <SelectItem value="ollama:glm-4.7-flash:latest">Ollama: GLM-4.7 Flash (Deep Context Model)</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">
                  Zero token cost. Runs directly on your local GPU to tag high-retention moments, zoom cuts, sound effect beats, and generate punchy viral headlines.
                </p>
              </div>

              {/* Chunked Streaming & Instant Pipelining */}
              <div className="border-t pt-3 space-y-3">
                <div className="flex items-center justify-between gap-4">
                  <Label htmlFor="chunked-download-toggle" className="flex-col items-start gap-0.5">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-medium">Chunked Streaming & Instant Pipelining</span>
                      <span className="rounded-full bg-primary/10 text-primary px-1.5 py-0.2 text-[9px] font-bold">⚡ Big Videos</span>
                    </div>
                    <span className="text-xs font-normal text-muted-foreground">
                      Automatically activates on big videos (&gt;10 min) and long live streams. Downloads in rolling chunks so clipping starts in ~20s without waiting for the full video. Short videos (&lt;10m) process directly in a single pass.
                    </span>
                  </Label>
                  <Switch
                    id="chunked-download-toggle"
                    checked={chunkedDownload}
                    onCheckedChange={(val) => {
                      setChunkedDownload(val);
                      updateAutoClipSetting("chunkedDownload", val);
                    }}
                  />
                </div>

                {chunkedDownload && (
                  <div className="pl-3 border-l-2 border-primary/30 space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="chunk-duration-select" className="text-xs text-muted-foreground">Pipeline Chunk Window Size</Label>
                      <span className="text-xs font-semibold text-primary">{chunkDuration}s ({Math.round(parseInt(chunkDuration) / 60)} min)</span>
                    </div>
                    <Select
                      value={chunkDuration}
                      onValueChange={(val) => {
                        setChunkDuration(val);
                        updateAutoClipSetting("chunkDuration", val);
                      }}
                    >
                      <SelectTrigger id="chunk-duration-select" className="h-8 text-xs">
                        <SelectValue placeholder="Select chunk window" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="120">120 Seconds (2 min chunks - Ultra-fast initial clip)</SelectItem>
                        <SelectItem value="180">180 Seconds (3 min chunks - Recommended sweet spot)</SelectItem>
                        <SelectItem value="300">300 Seconds (5 min chunks - Wider narrative context)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>

              {/* Attention-Grabbing AI Voice Hooks */}
              <div className="border-t pt-3 space-y-3">
                <div className="flex items-center justify-between gap-4">
                  <Label htmlFor="ai-voice-hook-toggle" className="flex-col items-start gap-0.5">
                    <div className="flex items-center gap-1.5">
                      <Mic className="size-3.5 text-primary" />
                      <span className="text-sm font-medium">AI Viral Attention Voice Hooks</span>
                    </div>
                    <span className="text-xs font-normal text-muted-foreground">
                      Synthesize an energetic 3-second spoken intro hook (&ldquo;Wait till you see this...&rdquo;) with smart audio ducking to prevent viewer swipe-away.
                    </span>
                  </Label>
                  <Switch
                    id="ai-voice-hook-toggle"
                    checked={aiVoiceHook}
                    onCheckedChange={(val) => {
                      setAiVoiceHook(val);
                      updateAutoClipSetting("aiVoiceHook", val);
                    }}
                  />
                </div>

                {aiVoiceHook && (
                  <div className="pl-3 border-l-2 border-primary/30 space-y-2">
                    <Label htmlFor="voice-style-select" className="text-xs text-muted-foreground">Voice Hook Persona & Tone</Label>
                    <Select
                      value={aiVoiceStyle}
                      onValueChange={(val) => {
                        setAiVoiceStyle(val);
                        updateAutoClipSetting("aiVoiceStyle", val);
                      }}
                    >
                      <SelectTrigger id="voice-style-select" className="h-8 text-xs">
                        <SelectValue placeholder="Select Voice Style" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="viral_guy">Viral Creator (Male - Energetic, High-Pitched Hook)</SelectItem>
                        <SelectItem value="viral_girl">Trendsetter (Female - Punchy, Dynamic Expression)</SelectItem>
                        <SelectItem value="deep_narrator">Deep Cinematic (Authoritative, Dramatic Hook)</SelectItem>
                        <SelectItem value="documentary">Storyteller (Smooth, Curiosity-Driven)</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                      <Volume2 className="size-3 text-muted-foreground" />
                      <span>Original audio is smoothly ducked down to 35% during the 2.5s hook, then swells back to 100%.</span>
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </Section>

        {/* Social Accounts & Direct Publishing Section */}
        <Section
          icon={<Share2 className="size-4 text-primary" />}
          title="Social Accounts & Direct Publishing"
          description="Connect your YouTube, TikTok, and Instagram accounts to publish or schedule clips directly from this page"
        >
          <div className="space-y-4">
            <div className="flex items-center justify-between pb-1 border-b">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Platforms & Connections
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={loadSocialData}
                disabled={loadingSocial}
                className="h-7 text-xs gap-1.5"
              >
                <RefreshCw className={cn("size-3", loadingSocial && "animate-spin")} />
                <span>Refresh Accounts</span>
              </Button>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              {(["youtube", "tiktok", "instagram"] as const).map((prov) => {
                const connection = socialConnections.find((c) => c.provider === prov);
                const isConnected = connection && connection.status === "active";
                const label = PROVIDER_LABELS[prov] || (prov === "youtube" ? "YouTube" : prov === "tiktok" ? "TikTok" : "Instagram");

                return (
                  <div
                    key={prov}
                    className="flex flex-col justify-between rounded-xl border bg-card p-3.5 space-y-3 transition-colors hover:border-foreground/20"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <span className="flex size-8 items-center justify-center rounded-lg border bg-muted/30">
                          <SocialProviderIcon provider={prov} className="size-4" />
                        </span>
                        <div>
                          <p className="text-xs font-semibold text-foreground">{label}</p>
                          <p className="text-[11px] text-muted-foreground truncate max-w-[110px]">
                            {isConnected ? (connection.username || connection.display_name || "Connected") : "Not Connected"}
                          </p>
                        </div>
                      </div>
                      <Badge
                        variant={isConnected ? "secondary" : "outline"}
                        className={cn(
                          "text-[10px] py-0 px-1.5 font-medium",
                          isConnected && "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                        )}
                      >
                        {isConnected ? "Active" : "Ready"}
                      </Badge>
                    </div>

                    <div className="pt-1 flex items-center gap-1.5">
                      {isConnected ? (
                        <Button
                          size="sm"
                          className="w-full h-8 text-xs gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90"
                          onClick={() => {
                            setDirectPostProvider(prov);
                            setDirectPostOpen(true);
                          }}
                        >
                          <Send className="size-3" />
                          <span>Direct Post</span>
                        </Button>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          asChild
                          className="w-full h-8 text-xs gap-1"
                        >
                          <a href={`/api/social/connect/${prov}`}>
                            <span>Connect</span>
                            <ChevronRight className="size-3 text-muted-foreground" />
                          </a>
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex items-center justify-between text-xs text-muted-foreground pt-1">
              <span>Looking for full post history & analytics?</span>
              <Link href="/settings/social" className="text-primary hover:underline font-medium flex items-center gap-1">
                <span>Manage Social Credentials</span>
                <ChevronRight className="size-3" />
              </Link>
            </div>
          </div>
        </Section>

        {/* Multitasking & Worker Processing Engine */}
        <Section
          icon={<Cpu className="size-4 text-emerald-500" />}
          title="Multitasking & Processing Engine"
          description="High-throughput parallel workers and zero-waste background clipping pipeline"
        >
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border bg-card p-3.5 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                    <Layers className="size-3.5 text-primary" />
                    <span>Parallel Worker Pool</span>
                  </span>
                  <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-mono text-[10px]">
                    3 Workers Active ⚡
                  </Badge>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Up to 24 concurrent ARQ job slots executing video processing, AI transcript analysis, and FFmpeg encoding.
                </p>
              </div>

              <div className="rounded-xl border bg-card p-3.5 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                    <Zap className="size-3.5 text-amber-500" />
                    <span>User Concurrency Limit</span>
                  </span>
                  <Badge variant="secondary" className="font-mono text-[10px]">
                    4 Simultaneous Tasks
                  </Badge>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Clip up to 4 videos at the same time without queuing delays. Extra tasks queue automatically.
                </p>
              </div>
            </div>

            <div className="rounded-xl border border-primary/20 bg-primary/5 p-3.5 flex items-start gap-3">
              <span className="flex size-7 items-center justify-center rounded-lg bg-primary/20 text-primary shrink-0 mt-0.5">
                <Sparkles className="size-3.5" />
              </span>
              <div className="space-y-1">
                <p className="text-xs font-semibold text-foreground">High-Throughput Background Video Processing</p>
                <p className="text-[11px] text-muted-foreground">
                  Videos process completely in the background across our distributed worker pool. Monitor live stage progress, accurate percentages, and finished clips directly in your Library and Task views.
                </p>
              </div>
            </div>
          </div>
        </Section>

        {billingSummary?.monetization_enabled && (
          <Section id="plan" tour="settings-plan" icon={<CreditCard className="size-4" />} title={t("plan.title")} description={paymentNeedsUpdate || isPaidBillingPlan(billingSummary.plan) ? t("plan.paidDescription") : t("plan.freeDescription")}>
            <div className="space-y-4">
              <UpgradeThankYou
                active={celebration === "show"}
                planName={plans.planName(billingSummary.plan)}
                minutes={minuteLimit === null ? null : plans.formatMinutes(minuteLimit)}
                resolution={billingSummary.output_short_side ? `${billingSummary.output_short_side}p` : null}
                onClose={() => setCelebration(null)}
              >
                <div className="h-full rounded-xl bg-muted/50 p-4">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="font-semibold">
                      {plans.planName(billingSummary.plan)}
                      <span className="ml-2 text-xs font-normal capitalize text-muted-foreground">{billingSummary.subscription_status}</span>
                    </p>
                    <p className="text-sm tabular-nums text-muted-foreground">
                      {minuteLimit === null ? t("plan.usageMinutes", { used: usageMinutes }) : t("plan.usageMinutesOf", { used: usageMinutes, limit: minuteLimit })}
                    </p>
                  </div>
                  {minuteLimit !== null && (
                    <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-background"><div className="h-full rounded-full bg-brand" style={{ width: `${usagePct}%` }} /></div>
                  )}
                  <p className="mt-2 text-xs text-muted-foreground">
                    {paymentNeedsUpdate && !upgradeState?.isPaid
                      ? t("paymentFailed.paused")
                      : !upgradeState?.isPaid
                      ? t("plan.noneYet")
                      : minuteLimit === null
                      ? t("plan.minutesThisMonth", { used: usageMinutes })
                      : upgradeState.atLimit
                      ? (upgradeState.resetsOn
                        ? t("plan.allUsedRefresh", { limit: plans.formatMinutes(minuteLimit), date: upgradeState.resetsOn })
                        : t("plan.allUsedPeriod", { limit: plans.formatMinutes(minuteLimit) }))
                      : (upgradeState.resetsOn
                        ? t("plan.leftRefresh", { left: plans.formatMinutes(Math.max(minuteLimit - usageMinutes, 0)), date: upgradeState.resetsOn })
                        : t("plan.leftPeriod", { left: plans.formatMinutes(Math.max(minuteLimit - usageMinutes, 0)) }))}
                  </p>
                  {upgradeState?.isPaid && billingSummary.output_short_side && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {billingSummary.legacy_hd
                        ? t("plan.clipsResolutionLegacy", { resolution: `${billingSummary.output_short_side}p` })
                        : t("plan.clipsResolution", { resolution: `${billingSummary.output_short_side}p` })}
                      {billingSummary.billing_interval === "year" ? ` · ${t("plan.billedYearly")}` : ""}
                    </p>
                  )}
                </div>
              </UpgradeThankYou>

              {billingSummary.cancel_at && billingSummary.subscription_provider === "stripe" && (
                <SubscriptionCancelBanner
                  cancelAt={billingSummary.cancel_at}
                  onRestarted={() => setBillingSummary((prev) => (prev ? { ...prev, cancel_at: null } : prev))}
                />
              )}

              {paymentNeedsUpdate && <PaymentFailedBanner teamId={isTeamWorkspace ? billingSummary.team_id : undefined} />}

              {isTeamWorkspace ? (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-muted/40 p-4">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">
                      {t("plan.teamWorkspaceTitle", {
                        team: billingSummary.team_name || common("plans.team"),
                      })}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {t("plan.teamWorkspaceBody")}
                    </p>
                  </div>
                  <Button asChild size="sm">
                    <Link href="/settings/team">{t("plan.manageTeam")}</Link>
                  </Button>
                </div>
              ) : isPaidBillingPlan(billingSummary.plan) ? (
                billingSummary.subscription_provider === "apple" ? (
                  <p className="rounded-lg border px-3 py-2 text-sm text-muted-foreground">{t("plan.appStore")}</p>
                ) : (
                  <div className="space-y-3">
                    {!paymentNeedsUpdate && upgradeState?.nextPlan && (
                      <UpgradeNudge
                        title={
                          currentPaidPlan
                            ? t(
                                upgradeState.nextPlan.resolution !== currentPaidPlan.resolution && !billingSummary.legacy_hd
                                  ? "plan.upgradeMultiplierHd"
                                  : "plan.upgradeMultiplier",
                                {
                                  multiplier: formatRatio(upgradeState.nextPlan.minuteLimit / currentPaidPlan.minuteLimit),
                                  resolution: upgradeState.nextPlan.resolution,
                                  plan: plans.planName(upgradeState.nextPlan.id),
                                },
                              )
                            : t("plan.upgradeMore", { plan: plans.planName(upgradeState.nextPlan.id) })
                        }
                        description={t("plan.upgradeDescription", {
                          price: upgradeState.nextPlan.priceMonthly,
                          minutes: plans.formatMinutes(upgradeState.nextPlan.minuteLimit),
                          resolution: upgradeState.nextPlan.resolution,
                          length: plans.formatMinutes(upgradeState.nextPlan.youtubeMaxMinutes),
                        })}
                        action={t("plan.upgrade")}
                        onAction={() => handlePlanChange(upgradeState.nextPlan!.id, billingSummary.billing_interval ?? "month")}
                        loading={isBillingActionLoading}
                      />
                    )}
                    {!paymentNeedsUpdate && canSwitchToYearly && annualMonthsFree(currentPaidPlan) > 0 && (
                      <UpgradeNudge
                        title={t("plan.switchYearlyTitle", { count: annualMonthsFree(currentPaidPlan) })}
                        description={t("plan.switchYearlyDescription", {
                          price: currentPaidPlan.priceAnnual,
                          monthly: annualMonthlyEquivalent(currentPaidPlan),
                        })}
                        action={t("plan.switch")}
                        onAction={() => handlePlanChange(currentPaidPlan.id, "year")}
                        loading={isBillingActionLoading}
                      />
                    )}
                    {billingSummary.subscription_provider === "affiliate" ? (
                      <p className="rounded-lg border px-3 py-2 text-sm text-muted-foreground">{t("plan.affiliate")}</p>
                    ) : (
                      <Button type="button" variant="outline" onClick={() => handleBillingAction()} disabled={isBillingActionLoading}>
                        {isBillingActionLoading ? t("plan.loading") : t("plan.manage")}
                      </Button>
                    )}
                  </div>
                )
              ) : paymentNeedsUpdate ? null : (
                <div className="grid gap-3 sm:grid-cols-2">
                  <BillingIntervalToggle
                    className="justify-self-start sm:col-span-2"
                    value={billingInterval}
                    onChange={setBillingInterval}
                    plan={paidPlans[0]}
                  />
                  {paidPlans.map((plan) => (
                    <button
                      key={plan.id}
                      type="button"
                      onClick={() => handleBillingAction(plan.id)}
                      disabled={isBillingActionLoading}
                      className={cn(
                        "rounded-xl border p-4 text-left transition-colors hover:border-foreground/30 disabled:opacity-60",
                        plan.highlighted && "border-foreground ring-1 ring-foreground",
                      )}
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span className="text-sm font-semibold">{plans.planName(plan.id)}</span>
                        {plan.highlighted && <span className="text-xs text-muted-foreground">{plans.t("mostPopular")}</span>}
                      </span>
                      <span className="mt-1 block text-2xl font-bold tracking-tight">
                        {billingInterval === "year" && annualMonthsFree(plan) > 0 && (
                          <span className="mr-1.5 text-sm font-normal text-muted-foreground line-through">${annualFullPrice(plan)}</span>
                        )}
                        ${planPrice(plan, billingInterval)}
                        <span className="text-xs font-normal text-muted-foreground">
                          {billingInterval === "year" ? plans.t("perYear") : plans.t("perMonth")}
                        </span>
                      </span>
                      {billingInterval === "year" && (
                        <span className="block text-xs text-muted-foreground">
                          {t("plan.monthlyEquivalentYearly", { price: annualMonthlyEquivalent(plan) })}
                        </span>
                      )}
                      <span className="mt-3 block space-y-1.5">
                        {plans.highlights(plan).map((highlight) => (
                          <span key={highlight} className="flex items-start gap-1.5 text-xs text-muted-foreground">
                            <Check className="mt-0.5 size-3 shrink-0" />{highlight}
                          </span>
                        ))}
                        {plans.comingSoon(plan) && (
                          <span className="flex items-start gap-1.5 text-xs text-muted-foreground/80">
                            <Clock className="mt-0.5 size-3 shrink-0" />
                            <span>{plans.comingSoon(plan)} <ComingSoonTag /></span>
                          </span>
                        )}
                      </span>
                      <span className={cn("mt-4 flex h-9 items-center justify-center rounded-lg text-sm font-medium", plan.highlighted ? "bg-primary text-primary-foreground" : "bg-muted")}>
                        {isBillingActionLoading ? t("plan.openingCheckout") : t("plan.choose", { name: plans.planName(plan.id) })}
                      </span>
                    </button>
                  ))}
                  {teamsAvailable && <Link
                    href="/settings/team"
                    className="group flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4 transition-colors hover:border-foreground/30 sm:col-span-2"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <Users className="size-4 text-muted-foreground" />
                        <span className="text-sm font-semibold">{common("plans.team")}</span>
                        <span className="text-xs text-muted-foreground tabular-nums">
                          {billingInterval === "year"
                            ? t("plan.teamPriceYearly", {
                                price: teamConfig.priceAnnual,
                                extraPrice: teamConfig.seatPriceAnnual,
                              })
                            : t("plan.teamPriceMonthly", {
                                price: teamConfig.priceMonthly,
                                extraPrice: teamConfig.seatPriceMonthly,
                              })}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {t("plan.teamSummary", {
                          seats: teamConfig.includedSeats,
                          hours: Math.round(teamConfig.baseMinuteLimit / 60),
                          extraHours: Math.round(teamConfig.extraSeatMinuteLimit / 60),
                        })}
                      </p>
                    </div>
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-foreground">
                      {t("plan.createTeamCta")}
                      <ChevronRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
                    </span>
                  </Link>}
                  <CreatorCodeField className="justify-self-start sm:col-span-2" />
                </div>
              )}
            </div>
          </Section>
        )}

        {(teamsAvailable || teams.length > 0) && <Link href="/settings/team" className="group flex items-center gap-4 rounded-2xl border bg-background p-5 transition-colors hover:border-foreground/25">
          <span className="flex size-9 items-center justify-center rounded-lg bg-muted"><Users className="size-4" /></span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold">{t("links.teamTitle")}</span>
            <span className="block text-xs text-muted-foreground">{t("links.teamDescription")}</span>
          </span>
          <ChevronRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
        </Link>}

        <Link href="/settings/api-keys" className="group flex items-center gap-4 rounded-2xl border bg-background p-5 transition-colors hover:border-foreground/25">
          <span className="flex size-9 items-center justify-center rounded-lg bg-muted"><Bot className="size-4" /></span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold">{t("links.agentsTitle")}</span>
            <span className="block text-xs text-muted-foreground">{t("links.agentsDescription")}</span>
          </span>
          <ChevronRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
        </Link>

        {socialAccess === true && (
          <Link href="/settings/social" className="group flex items-center gap-4 rounded-2xl border bg-background p-5 transition-colors hover:border-foreground/25">
            <span className="flex size-9 items-center justify-center rounded-lg bg-muted"><Share2 className="size-4" /></span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold">{t("links.socialTitle")}</span>
              <span className="block text-xs text-muted-foreground">{t("links.socialDescription")}</span>
            </span>
            <ChevronRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
          </Link>
        )}

        <Link href="/settings/creator-program" className="group flex items-center gap-4 rounded-2xl border bg-background p-5 transition-colors hover:border-foreground/25">
          <span className="flex size-9 items-center justify-center rounded-lg bg-muted"><Megaphone className="size-4" /></span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold">{t("links.creatorTitle")}</span>
            <span className="block text-xs text-muted-foreground">{t("links.creatorDescription")}</span>
          </span>
          <ChevronRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
        </Link>

        <Section icon={<Info className="size-4" />} title={t("about.title")} description={t("about.credit")}>
          <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
            <a className="underline underline-offset-4" href={GITHUB_URL}>{t("about.repository")}</a>
            <a className="underline underline-offset-4" href={DEFAULT_SITE_URL}>supoclip.com</a>
          </div>
        </Section>

        <DeleteAccountSection
          email={session.user.email}
          hasAppStoreSubscription={
            billingSummary?.subscription_provider === "apple" &&
            ["active", "trialing", "past_due"].includes(billingSummary.subscription_status)
          }
        />

        {error && (
          <Alert className="border-red-200 bg-red-50 dark:border-red-900/60 dark:bg-red-950/40">
            <AlertCircle className="h-4 w-4 text-red-500" />
            <AlertDescription className="text-sm text-red-700 dark:text-red-300">
              {error}
              {canCancelTransfer && <Button type="button" variant="outline" className="ml-3" disabled={isBillingActionLoading} onClick={cancelTransferRenewal}>{t("plan.transferCancel")}</Button>}
            </AlertDescription>
          </Alert>
        )}
      </div>

      {showSaveBar && (
        <div className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-30 flex justify-center px-4 pb-4 pointer-events-none md:bottom-0 md:pb-6 md:pl-64">
          <div className="pointer-events-auto flex w-full max-w-3xl animate-in fade-in slide-in-from-bottom-4 duration-200 items-center justify-between gap-4 rounded-2xl border bg-background/95 px-4 py-3 shadow-lg backdrop-blur max-md:mr-14">
            <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
              {success ? <><Check className="size-4 text-emerald-600" />{t("save.saved")}</>
                : <><span className="size-2 rounded-full bg-brand" />{t("save.unsaved")}</>}
            </p>
            <Button onClick={handleSavePreferences} disabled={isLoading}>
              {isLoading ? <><Loader2 className="size-4 animate-spin" />{t("save.saving")}</> : t("save.button")}
            </Button>
          </div>
        </div>
      )}

      {/* Direct Post Dialog */}
      <Dialog open={directPostOpen} onOpenChange={setDirectPostOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Send className="size-4 text-primary" />
              <span>Direct Post to {directPostProvider === "youtube" ? "YouTube Shorts" : directPostProvider === "tiktok" ? "TikTok" : "Instagram"}</span>
            </DialogTitle>
            <DialogDescription className="text-xs">
              Publish or schedule a clip directly to your connected account without leaving this page.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 pt-2">
            <div className="space-y-1.5">
              <Label htmlFor="direct-post-title" className="text-xs">Post Title</Label>
              <Input
                id="direct-post-title"
                placeholder="e.g. Insane Overtime Clutch Moment 🔥"
                value={directPostTitle}
                onChange={(e) => setDirectPostTitle(e.target.value)}
                className="h-8 text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="direct-post-caption" className="text-xs">Caption & Description</Label>
              <Textarea
                id="direct-post-caption"
                placeholder="Write an engaging caption with hashtags..."
                value={directPostCaption}
                onChange={(e) => setDirectPostCaption(e.target.value)}
                className="text-xs min-h-[90px]"
              />
            </div>

            <div className="rounded-lg bg-muted/40 p-2 text-[11px] text-muted-foreground flex items-center justify-between">
              <span>Publishing Target: <strong>{directPostProvider.toUpperCase()}</strong></span>
              <span className="text-emerald-600 dark:text-emerald-400 font-medium">⚡ Connected</span>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDirectPostOpen(false)}
              disabled={isPosting}
              className="h-8 text-xs"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleDirectPost}
              disabled={isPosting}
              className="gap-1.5 h-8 text-xs bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {isPosting ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
              <span>Publish Now</span>
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </main>
  );
}

function Section({ id, tour, icon, title, description, children }: { id?: string; /** `data-tour` target for the welcome tour. */ tour?: string; icon: React.ReactNode; title: string; description: string; children: React.ReactNode }) {
  return (
    <section id={id} data-tour={tour} className="scroll-mt-6 rounded-2xl border bg-background">
      <div className="flex items-start gap-3 border-b px-5 py-4">
        <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted">{icon}</span>
        <div>
          <h2 className="text-sm font-semibold">{title}</h2>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

/** 2.5 → "2.5", 3 → "3". */
function formatRatio(ratio: number) {
  const rounded = Math.round(ratio * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}
