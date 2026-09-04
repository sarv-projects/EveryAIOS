// EveryAIOS cockpit — one project, one session, one ticket, one timeline.
// Left = which job · center = talk + now-doing + approve · right = one lens.
// Never 9 peer tabs; never Chat/Cowork/Code as three apps.

import { useEffect } from "react";
import { TitleBar } from "@/components/shell/title-bar";
import { LeftSidebar } from "@/components/shell/left-sidebar";
import { CenterColumn } from "@/components/shell/center-column";
import { ActivityRail, RightViewport } from "@/components/shell/right-rail";
import { StatusBar } from "@/components/shell/status-bar";
import { CommandPalette } from "@/components/shell/command-palette";
import { CockpitSlideover } from "@/components/shell/cockpit-slideover";
import { KeyboardShortcuts } from "@/components/shell/keyboard-shortcuts";
import { AiPointer } from "@/components/shell/ai-pointer";
import { ToastBridge } from "@/components/shell/toast-bridge";
import VaultGate from "@/components/shell/vault-gate";
import { SetupGate } from "@/components/shell/setup-gate";
import { useAppStore } from "@/lib/store";
import { OnboardingModal } from "@/components/onboarding-modal";
import NpsPrompt from "@/components/nps-prompt";
import { startPerfMeasurement } from "@/lib/perf";
import { recordSessionEvent } from "@/lib/session-recording";
import { RuntimeStatusBanner } from "@/components/shell/runtime-status-banner";

export default function App() {
  const powerMode = useAppStore((s) => s.powerMode);
  const cockpitOpen = useAppStore((s) => s.cockpitOpen);
  const setCockpitOpen = useAppStore((s) => s.setCockpitOpen);
  // P11.4 — kick off LCP/TTI measurement at boot.
  useEffect(() => {
    startPerfMeasurement();
  }, []);

  // P11.6.5 — opt-in session recording: a single delegated listener records
  // clicks/navigation (content-free element identity only) when enabled.
  useEffect(() => {
    const onClick = (e: MouseEvent) => recordSessionEvent("click", e.target);
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  // P44.5 — reconcile the composer autonomy level with the Rust GuardService
  // preset at boot (the applied preset wins over stale localStorage).
  useEffect(() => {
    void useAppStore.getState().syncAutonomyFromRust();
  }, []);

  return (
    <VaultGate>
    <div className="h-screen w-screen flex flex-col bg-background overflow-hidden">
      <KeyboardShortcuts />
      <TitleBar />
      <RuntimeStatusBanner />
      <main className="flex-1 min-h-0 flex">
        <LeftSidebar />
        <CenterColumn />
        {/* Power mode intentionally reveals the cockpit rail and active lens. */}
        {powerMode && <ActivityRail />}
        {powerMode && <RightViewport />}
      </main>
      <StatusBar />
      <CommandPalette />
      {/* P3.2 — multi-agent flight deck (was implemented but never mounted). */}
      <CockpitSlideover open={cockpitOpen} onClose={() => setCockpitOpen(false)} />
      <ToastBridge />
      <AiPointer />
      {/* P50.4.1 — first-run provider setup (no model → no generic agent error). */}
      <SetupGate />
      {/* P11.2 — first-launch onboarding (welcome → key → chat → success). */}
      <OnboardingModal />
      {/* P11.6.2 — non-intrusive NPS prompt (after 7 days, at most once per 90). */}
      <NpsPrompt />
    </div>
    </VaultGate>
  );
}
