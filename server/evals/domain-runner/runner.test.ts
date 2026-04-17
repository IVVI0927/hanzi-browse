import { describe, it, expect, vi } from "vitest";
import { runCase } from "./runner.js";
import type { GoldenCase } from "./types.js";

// Stub runAgentLoop so the test doesn't need a browser.
vi.mock("../../src/agent/loop.js", () => ({
  runAgentLoop: vi.fn(async () => ({
    status: "complete",
    answer: "The bio mentions OpenAI and building AGI.",
    steps: 3,
    usage: { inputTokens: 0, outputTokens: 0, apiCalls: 1 },
    turns: [
      {
        step: 1,
        ai_response: null,
        tools: [
          { name: "navigate", input: { url: "https://x.com/sama" }, result: "ok", durationMs: 10 },
        ],
      },
      {
        step: 2,
        ai_response: null,
        tools: [
          { name: "get_page_text", input: {}, result: "bio text", durationMs: 10 },
        ],
      },
    ],
  })),
}));

vi.mock("./llm-judge.js", () => ({
  judgeScreenshot: vi.fn(async () => ({ pass: true, rawAnswer: "yes" })),
}));

const noopExecutor = {
  executeTool: vi.fn(async () => ({ success: true, output: "ok" })),
  close: vi.fn(async () => {}),
};

describe("runCase", () => {
  it("passes a simple agent_answer_contains case", async () => {
    const c: GoldenCase = {
      id: "read-profile",
      task: "Read sama profile",
      success_check: { type: "agent_answer_contains", substring: "OpenAI" },
    };
    const r = await runCase("x.com", c, noopExecutor as any);
    expect(r.pass).toBe(true);
    expect(r.reasons).toEqual([]);
  });

  it("fails when required_tool_call is missing", async () => {
    const c: GoldenCase = {
      id: "reads-page",
      task: "Do it",
      success_check: { type: "agent_answer_contains", substring: "OpenAI" },
      required_tool_call: { tool: "javascript_tool" },
    };
    const r = await runCase("x.com", c, noopExecutor as any);
    expect(r.pass).toBe(false);
    expect(r.reasons.join(" ")).toMatch(/required_tool_call/);
  });

  it("fails when forbidden_tool_call is present", async () => {
    const c: GoldenCase = {
      id: "no-navigate",
      task: "Do it",
      success_check: { type: "agent_answer_contains", substring: "OpenAI" },
      forbidden_tool_call: { tool: "navigate" },
    };
    const r = await runCase("x.com", c, noopExecutor as any);
    expect(r.pass).toBe(false);
    expect(r.reasons.join(" ")).toMatch(/forbidden_tool_call/);
  });
});
