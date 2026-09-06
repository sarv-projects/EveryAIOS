import { describe, expect, test } from "bun:test"
import {
  buildCandidates,
  DEFAULT_QUANT,
  bytesToGib,
  fileHwClass,
  FIT_CTX,
  FIT_CTX_LABEL,
  hostHwClass,
  tierTone,
} from "./model-fit"

const gguf = (p: string) => ({ path: p, size: 0, type: "file" })

describe("tierTone — traffic-light semantics (P52.1)", () => {
  test("maps the three native tiers", () => {
    expect(tierTone("fits")).toEqual({
      key: "ok",
      label: "fits",
      hint: expect.stringContaining("60%"),
    })
    expect(tierTone("may_be_slow")).toEqual({
      key: "warn",
      label: "may be slow",
      hint: expect.stringContaining("85%"),
    })
    expect(tierTone("wont_fit")).toEqual({
      key: "bad",
      label: "won't fit",
      hint: expect.stringContaining("85%"),
    })
  })

  test("unknown tiers fail closed to the worst tone — never silently green", () => {
    for (const bad of [undefined, null, "", "bogus", 0 as unknown as string]) {
      expect(tierTone(bad).key).toBe("bad")
    }
  })
})

describe("hostHwClass — which accelerator the native picker is asked for (P52.5)", () => {
  test("no/unknown GPU reports cpu", () => {
    expect(hostHwClass(null)).toBe("cpu")
    expect(hostHwClass({})).toBe("cpu")
    expect(hostHwClass({ gpu: "—" })).toBe("cpu")
    expect(hostHwClass({ gpu: "Unknown" })).toBe("cpu")
  })

  test("a reported GPU reports gpu", () => {
    expect(hostHwClass({ gpu: "NVIDIA GeForce RTX 4060" })).toBe("gpu")
    expect(hostHwClass({ gpu: "Apple M3 (integrated)" })).toBe("gpu")
  })
})

describe("fileHwClass — path marker opt-in (P52.5)", () => {
  test("plain GGUF is portable (cpu)", () => {
    expect(fileHwClass("models/qwen-2.5-7b-Q4_K_M.gguf")).toBe("cpu")
  })
  test("explicit neural markers opt in to npu", () => {
    for (const p of [
      "npu-q4.gguf",
      "model-ANE.Q4.gguf",
      "mlx_q4.gguf",
      "meta.metal.gguf",
    ]) {
      expect(fileHwClass(p)).toBe("npu")
    }
  })
})

describe("buildCandidates — the native picker's input (P52.5)", () => {
  const files = [
    gguf("qwen-7b-Q8_0.gguf"),
    gguf("qwen-7b-Q4_K_M.gguf"),
    gguf("qwen-7b-Q4_0.gguf"),
    gguf("NOT_A_MODEL.txt"),
    { path: "safetensors/model.safetensors", size: 0, type: "file" },
  ]

  test("includes only .gguf files with repo + derived quant", () => {
    const out = buildCandidates("Qwen/Qwen2.5-7B", files)
    expect(out).toHaveLength(3)
    expect(out[0]).toEqual({
      repo: "Qwen/Qwen2.5-7B",
      file: "qwen-7b-Q8_0.gguf",
      hw: "cpu",
      quant: "Q8_0",
    })
    expect(out[1].quant).toBe(DEFAULT_QUANT) // Q4_K_M derived from path
  })

  test("empty file list yields empty candidates (native returns null, not an error)", () => {
    expect(buildCandidates("a/b", [])).toEqual([])
  })
})

describe("fit constants + units", () => {
  test("estimate ctx default is the serving num_ctx (16K)", () => {
    expect(FIT_CTX).toBe(16384)
    expect(FIT_CTX_LABEL).toBe("16K")
  })
  test("bytesToGib matches the native size ÷ 2^30 convention", () => {
    expect(bytesToGib(0)).toBe(0)
    expect(bytesToGib(-1)).toBe(0)
    expect(bytesToGib(2 ** 30)).toBeCloseTo(1)
    expect(bytesToGib(7_450_000_000)).toBeCloseTo(7_450_000_000 / 2 ** 30)
  })
})
