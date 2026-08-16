import { lazy, Suspense } from "react";
import { NavLink, Route, Routes } from "react-router-dom";
import Audit from "./pages/Audit";
import Chat from "./pages/Chat";
import Cockpit from "./pages/Cockpit";
import DocxViewer from "./pages/DocxViewer";
import PptxViewer from "./pages/PptxViewer";
import Settings from "./pages/Settings";
import Spend from "./pages/Spend";
import Spreadsheet from "./pages/Spreadsheet";
import Trajectory from "./pages/Trajectory";

// pdf.js is ~1.4MB minified — lazy-load it so it only ships to the PDF view.
const PdfViewer = lazy(() => import("./pages/PdfViewer"));

const nav = [
  { to: "/", label: "Chat", end: true },
  { to: "/cockpit", label: "Cockpit", end: false },
  { to: "/audit", label: "Audit", end: false },
  { to: "/sheets", label: "Sheets", end: false },
  { to: "/docs", label: "Word", end: false },
  { to: "/slides", label: "Slides", end: false },
  { to: "/pdf", label: "PDF", end: false },
  { to: "/spend", label: "Spend", end: false },
  { to: "/trajectory", label: "Trajectory", end: false },
  { to: "/settings", label: "Settings", end: false },
];

export default function App() {
  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">E</div>
          <div className="brand-name">EveryAIOS</div>
        </div>
        <nav className="nav">
          {nav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => `nav-item${isActive ? " active" : ""}`}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-foot">
          <span className="dot" />
          core: shell
        </div>
      </aside>
      <main className="content">
        <Suspense fallback={<div className="muted small">Loading…</div>}>
        <Routes>
          <Route path="/" element={<Chat />} />
          <Route path="/cockpit" element={<Cockpit />} />
          <Route path="/audit" element={<Audit />} />
          <Route path="/sheets" element={<Spreadsheet />} />
          <Route path="/docs" element={<DocxViewer />} />
          <Route path="/slides" element={<PptxViewer />} />
          <Route path="/pdf" element={<PdfViewer />} />
          <Route path="/spend" element={<Spend />} />
          <Route path="/trajectory" element={<Trajectory />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
        </Suspense>
      </main>
    </div>
  );
}
