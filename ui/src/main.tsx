import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { initBridge } from "@/lib/bridge";

// The bridge is started from a React effect so StrictMode can exercise its
// setup/cleanup pair. Browser mode is an explicitly labelled design preview.
function Bootstrap() {
  React.useEffect(() => {
    const bridge = initBridge();
    return () => {
      void bridge.then((dispose) => dispose());
    };
  }, []);
  return <App />;
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {/* P70 — appearance is owned in one place: theme mode (light · dark ·
        system), accent, text size, contrast and density all persist and are
        applied at boot, not only while Settings → Appearance is open.
        `system` is the default so the app follows the OS; `dark` is the
        fallback when no OS preference is available (the app's native look). */}
    <ThemeProvider defaultTheme="dark" enableSystem>
      <TooltipProvider delayDuration={200} skipDelayDuration={100}>
        <Bootstrap />
        <Toaster />
      </TooltipProvider>
    </ThemeProvider>
  </React.StrictMode>,
);
