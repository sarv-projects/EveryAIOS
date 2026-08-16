import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { initBridge } from "@/lib/bridge";

// Wire real Tauri data (agents/sessions/spend/tickets/chat) when running
// inside the shell; plain-browser preview keeps the demo data.
initBridge();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ThemeProvider defaultTheme="light" enableSystem={false}>
      <TooltipProvider delayDuration={200} skipDelayDuration={100}>
        <App />
        <Toaster />
      </TooltipProvider>
    </ThemeProvider>
  </React.StrictMode>,
);
