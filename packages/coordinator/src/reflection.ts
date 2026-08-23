/**
 * P11.5.9 — Lint/Test Reflection (doc 46 Aider "lint after every edit").
 *
 * After an edit lands, the loop runs the lint/test command; on failure it
 * retries up to 3 times, each retry feeding the previous diagnostics back as
 * a fix prompt. Deterministic policy — the command runner is injected so
 * tests never spawn processes.
 */

export interface ReflectionResult {
  /** True when the last run passed (or max retries were not exhausted). */
  passed: boolean;
  /** Runs executed (1 + retries). */
  attempts: number;
  /** The fix prompt that should be fed to the model next (empty when passed). */
  fixPrompt: string;
  /** Last run's diagnostics/error text ("" when clean). */
  diagnostics: string;
}

export interface ReflectionOptions {
  /** Max attempts including the first (default 4 = 1 + 3 retries). */
  maxAttempts?: number;
  /** Pass when the command exits 0 OR the output matches this (optional). */
  tolerate?: RegExp;
}

export type ReflectionRunner = (fixPrompt: string) => Promise<{ code: number; output: string }>;

/**
 * Run lint/test with reflection retries. Each failed attempt produces an
 * escalating fix prompt (diagnostics quoted; attempt number + prior attempts
 * noted) and re-runs. Exits early on pass.
 */
export async function runWithReflection(
  runner: ReflectionRunner,
  opts: ReflectionOptions = {},
): Promise<ReflectionResult> {
  const maxAttempts = opts.maxAttempts ?? 4;
  let attempts = 0;
  let lastOutput = "";
  let fixPrompt = "";

  for (let i = 0; i < maxAttempts; i++) {
    attempts++;
    const { code, output } = await runner(fixPrompt);
    lastOutput = output;
    const tolerated = opts.tolerate ? opts.tolerate.test(output) : false;
    if (code === 0 || tolerated) {
      return {
        passed: true,
        attempts,
        fixPrompt: "",
        diagnostics: output,
      };
    }
    const attemptWord = attempts === 1 ? "first" : `retry ${attempts - 1}`;
    fixPrompt = [
      `The ${attemptWord} edit failed lint/tests. Diagnostics:`,
      "",
      "```",
      output.trim().slice(0, 2000),
      "```",
      "",
      `Fix the code so these pass (attempt ${attempts}/${maxAttempts}).`,
    ].join("\n");
  }

  return { passed: false, attempts, fixPrompt, diagnostics: lastOutput };
}

/** Build the lint/test command suggestion for a language (UI display). */
export function suggestedCheckFor(file: string): string {
  if (file.endsWith(".rs")) return "cargo check --message-format short";
  if (file.endsWith(".ts") || file.endsWith(".tsx")) return "tsc --noEmit";
  if (file.endsWith(".js") || file.endsWith(".jsx")) return "eslint . --quiet";
  if (file.endsWith(".py")) return "python -m py_compile";
  if (file.endsWith(".go")) return "go vet ./...";
  return "lint";
}
