// P9.7 — the skills-store surface. Mirrors `skills_cmds.rs`. The bundled
// signed index (Ed25519) is verified in the shell; the UI renders each row's
// plain-language capability consent before install.

import { inTauri, invoke } from "./tauri";

export interface SkillRowView {
  id: string;
  name: string;
  version: string;
  description: string;
  permissions: string[];
  scopes_plain: string[];
  installed: boolean;
  tampered: boolean | null;
}

export async function skillsCatalog(): Promise<SkillRowView[]> {
  if (!inTauri()) return demoSkills();
  try {
    return await invoke<SkillRowView[]>("skills_catalog");
  } catch {
    return demoSkills();
  }
}

export async function skillsInstall(id: string): Promise<{ installed: boolean }> {
  return invoke("skills_install", { id });
}

export async function skillsUninstall(name: string): Promise<{ installed: boolean }> {
  return invoke("skills_uninstall", { name });
}

function demoSkills(): SkillRowView[] {
  return [
    {
      id: "docx-assistant",
      name: "DOCX Assistant",
      version: "1.2.0",
      description: "Draft and format .docx documents from plain instructions.",
      permissions: ["fs.write", "tool.mcp"],
      scopes_plain: ["Write to your files (each write is approved)", "Call local + remote MCP tools"],
      installed: false,
      tampered: null,
    },
    {
      id: "note-taker",
      name: "Note Taker",
      version: "0.9.0",
      description: "Read your notes and surface the ones relevant to the current task.",
      permissions: ["fs.read"],
      scopes_plain: ["Read your files"],
      installed: false,
      tampered: null,
    },
    {
      id: "doc-scanner",
      name: "Document Scanner",
      version: "0.4.1",
      description: "Scan a folder for documents and summarize contents.",
      permissions: ["fs.read", "tool.mcp"],
      scopes_plain: ["Read your files", "Call local + remote MCP tools"],
      installed: false,
      tampered: null,
    },
    {
      id: "email-drafter",
      name: "Email Drafter",
      version: "1.0.0",
      description: "Draft replies in your tone from an inbox thread.",
      permissions: ["fs.read", "tool.connector"],
      scopes_plain: ["Read your files", "Call your connected connectors"],
      installed: false,
      tampered: null,
    },
  ];
}