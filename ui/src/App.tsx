// EveryAIOS cockpit — one project, one session, one ticket, one timeline.
// Left = which job · center = talk + now-doing + approve · right = one lens.
// Never 9 peer tabs; never Chat/Cowork/Code as three apps.

import { TitleBar } from "@/components/shell/title-bar";
import { LeftSidebar } from "@/components/shell/left-sidebar";
import { CenterColumn } from "@/components/shell/center-column";
import { ActivityRail, RightViewport } from "@/components/shell/right-rail";
import { StatusBar } from "@/components/shell/status-bar";
import { CommandPalette } from "@/components/shell/command-palette";
import { KeyboardShortcuts } from "@/components/shell/keyboard-shortcuts";
import { ToastBridge } from "@/components/shell/toast-bridge";
import { useAppStore } from "@/lib/store";

export default function App() {
  // Progressive disclosure (B9/P31): casual users get chat only; the activity
  // rail + right viewport reveal when the power toggle is flipped.
  const powerMode = useAppStore((s) => s.powerMode);

  return (
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
    </div>
  );
}
