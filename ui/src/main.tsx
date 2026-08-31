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
    <ThemeProvider defaultTheme="light" enableSystem={false}>
      <TooltipProvider delayDuration={200} skipDelayDuration={100}>
        <Bootstrap />
        <Toaster />
      </TooltipProvider>
    </ThemeProvider>
  </React.StrictMode>,
);
