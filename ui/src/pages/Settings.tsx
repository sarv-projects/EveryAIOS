import { useEffect, useState } from "react";
import { inTauri, invoke } from "../lib/tauri";

interface Probe {
  label: string;
  value: string;
  ok: boolean;
}

const DEMO: Probe[] = [
  { label: "version", value: "everyaios-core 0.1.0 (preview)", ok: true },
  { label: "boot report", value: "preview — run inside the Tauri shell", ok: true },
  { label: "vault", value: "preview — not probed outside the shell", ok: true },
  { label: "guard scan", value: "preview — no text scanned yet", ok: true },
];

export default function Settings() {
  const [probes, setProbes] = useState<Probe[]>([]);
  const [scanText, setScanText] = useState("");
  const [scanResult, setScanResult] = useState<string | null>(null);

  useEffect(() => {
    if (!inTauri()) {
      setProbes(DEMO);
      return;
    }
    void (async () => {
      const out: Probe[] = [];
      try {
        const v = await invoke<string>("version");
        out.push({ label: "version", value: v, ok: true });
      } catch (e) {
        out.push({ label: "version", value: String(e), ok: false });
      }
      try {
        const r = await invoke<string>("core_boot_report");
        out.push({ label: "boot report", value: r, ok: true });
      } catch (e) {
        out.push({ label: "boot report", value: String(e), ok: false });
      }
      try {
        const v = await invoke<string>("probe_vault");
        out.push({ label: "vault", value: v, ok: true });
      } catch (e) {
        out.push({ label: "vault", value: String(e), ok: false });
      }
      setProbes(out);
    })();
  }, []);

  async function runScan() {
    if (!inTauri()) {
      setScanResult("preview — Guard-1 scan only runs inside the shell");
      return;
    }
    try {
      const blocked = await invoke<boolean>("scan_text", { text: scanText });
      setScanResult(blocked ? "blocked by Guard-1" : "clean");
    } catch (e) {
      setScanResult(String(e));
    }
  }

  return (
    <div className="page">
      <header className="page-head">
        <h1>Settings</h1>
        <span className="pill">{inTauri() ? "shell connected" : "preview mode"}</span>
      </header>

      <section className="card">
        <h2>Core bridge</h2>
        <div className="probe-list">
          {probes.map((p) => (
            <div key={p.label} className="probe">
              <span className={`probe-dot ${p.ok ? "ok" : "bad"}`} />
              <span className="probe-label">{p.label}</span>
              <span className="probe-value">{p.value}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="card">
        <h2>Guard-1 scan</h2>
        <div className="scan-row">
          <input
            value={scanText}
            onChange={(e) => setScanText(e.target.value)}
            placeholder="Paste text to scan for blocked patterns…"
            aria-label="Text to scan"
          />
          <button onClick={() => void runScan()}>Scan</button>
        </div>
        {scanResult && <p className="scan-result">{scanResult}</p>}
      </section>
    </div>
  );
}
