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
import { KeyboardShortcuts } from "@/components/shell/keyboard-shortcuts";
import { AiPointer } from "@/components/shell/ai-pointer";
import { ToastBridge } from "@/components/shell/toast-bridge";
import { useAppStore } from "@/lib/store";
import VaultGate from "@/components/shell/vault-gate";
import { OnboardingModal } from "@/components/onboarding-modal";
import NpsPrompt from "@/components/nps-prompt";
import { startPerfMeasurement } from "@/lib/perf";
import { recordSessionEvent } from "@/lib/session-recording";

export default function App() {
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

  // Progressive disclosure (B9/P31): casual users get chat only; the activity
  // rail + right viewport reveal when the power toggle is flipped.
  const powerMode = useAppStore((s) => s.powerMode);

  return (
    <VaultGate>
    <div className="h-screen w-screen flex flex-col bg-background overflow-hidden">
      <KeyboardShortcuts />
      <TitleBar />
      <main className="flex-1 min-h-0 flex">
        <LeftSidebar />
        <CenterColumn />
        {powerMode && <ActivityRail />}
        {powerMode && <RightViewport />}
      </main>
      <StatusBar />
      <CommandPalette />
      <ToastBridge />
      <AiPointer />
      {/* P11.2 — first-launch onboarding (welcome → key → chat → success). */}
      <OnboardingModal />
      {/* P11.6.2 — non-intrusive NPS prompt (after 7 days, at most once per 90). */}
      <NpsPrompt />
    </div>
    </VaultGate>
  );
}
