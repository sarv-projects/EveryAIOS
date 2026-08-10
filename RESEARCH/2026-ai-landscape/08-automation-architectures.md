# 08 · Automation Architectures — Desktop Scheduling Options

> Research: how automations (reminders, daily briefs, workflow runs) execute on a desktop app where
> everything runs on the user's machine — NO server, NO push, open-source and user-dependent.

---

## Option A: In-App Only (simplest — app must be open)

```
User creates automation → stored in SQLite
  → node-cron / croner library polls every 60s
  → WorkflowEngine runs directly in Node.js process
  → chat path: direct LLM call (user's BYOK keys or free pool)
  → notification: Electron Notification API
  → App closes → everything stops
```

| Pro | Con |
|---|---|
| Zero OS integration | Useless when app is closed |
| ~1 day to implement | User frustration: "why didn't my reminder fire?" |
| Cross-platform with zero platform code | — |

## Option B: System Tray Background (common desktop pattern)

```
User closes window → app minimizes to system tray
  → node-cron keeps running in background process
  → WorkflowEngine fires on schedule
  → Desktop notification pops up
  → User clicks notification → app window opens to result
  → Right-click tray → "Quit" actually stops everything
```

| Pro | Con |
|---|---|
| Feels "always on" without staying in your face | Uses RAM even when idle (~100–200MB for Electron) |
| Familiar UX (Slack, Discord, Spotify do this) | User might force-quit and wonder why automations stopped |
| ~2–3 days to implement | — |

## Option C: OS-Level Scheduling (most reliable)

```
User creates automation
  → App writes to OS scheduler:
     • Linux:   crontab entry    (every N or at specific time)
     • macOS:   launchd plist    (~/Library/LaunchAgents/)
     • Windows: Task Scheduler   (schtasks / XML)
  → OS calls back into the app (or a small helper binary)
  → Fires even if app is fully closed
  → Best for daily briefs, morning summaries, etc.
```

| Pro | Con |
|---|---|
| Fires 100% reliably, even after reboot | 3 different OS implementations |
| Zero resource usage between fires | Complex to set up, test, and debug |
| Professional feel | Helper binary must be signed on macOS/Windows |

## Option D: Hybrid — Tray + OS Fallback (RECOMMENDED)

```
┌─────────────────────────────────────────────┐
│              DESKTOP APP                     │
│                                              │
│  App Open:                                   │
│    → system tray keeps Node.js process alive │
│    → node-cron polls every 30-60s            │
│    → WorkflowEngine executes locally         │
│    → Desktop notifications                   │
│                                              │
│  For CRITICAL automations (user-tagged):     │
│    → Also registers with OS scheduler        │
│    → Works even if app crashed / rebooted    │
│    → Fires a lightweight script that:        │
│       - wakes/opens the app, OR              │
│       - sends a local notification directly  │
│                                              │
│  User toggle: "Keep automations alive"       │
└─────────────────────────────────────────────┘
```

## Recommendation

**Option B (Tray) → graduate to Option D (Hybrid).**
Start simple: system tray keeps app alive, `node-cron` handles scheduling. Ship v0.1. Then add
OS-level scheduling for critical automations in v0.2. This is what Slack, Discord, and most desktop
productivity apps do — proven and users understand it.

## Notes

- `node-cron` / `croner` are the Node libs to use (zero-config cron).
- We already have: NL cron parser (`parseNaturalLanguageSchedule()`), WorkflowEngine with all 6 safety
  mechanisms (kill switch, circuit breaker, velocity limit), `automations` SQLite table (schema v14+),
  Crystallization Engine (compile NL automations to deterministic).
- Desktop notifications: Electron `Notification` API (Windows toast / macOS / Linux libnotify).
