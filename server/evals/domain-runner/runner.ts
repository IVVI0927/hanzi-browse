import { runAgentLoop, type AgentLoopResult } from "../../src/agent/loop.js";
import type { GoldenCase, CaseResult, SuccessCheck } from "./types.js";
import { findForbiddenCall, findRequiredCall } from "./check-tool-calls.js";
import { judgeScreenshot } from "./llm-judge.js";
import type { RelayExecutor } from "./relay-executor.js";

async function checkSuccess(
  check: SuccessCheck,
  result: AgentLoopResult,
  finalScreenshot: { data: string; mediaType: string } | null
): Promise<{ pass: boolean; reason: string }> {
  if (check.type === "agent_answer_contains") {
    const pass = (result.answer ?? "").includes(check.substring);
    return {
      pass,
      reason: pass
        ? ""
        : `answer did not contain "${check.substring}" — got: ${result.answer?.slice(0, 120) ?? "(empty)"}`,
    };
  }
  if (check.type === "llm_judge") {
    if (!finalScreenshot) {
      return { pass: false, reason: "llm_judge requested but no final screenshot captured" };
    }
    const j = await judgeScreenshot({
      screenshot: finalScreenshot,
      prompt: check.prompt,
    });
    return { pass: j.pass, reason: j.pass ? "" : `judge answered: "${j.rawAnswer}"` };
  }
  return { pass: false, reason: `unknown success_check type` };
}

export async function runCase(
  domain: string,
  c: GoldenCase,
  executor: RelayExecutor
): Promise<CaseResult> {
  const start = Date.now();
  const reasons: string[] = [];
  let finalScreenshot: { data: string; mediaType: string } | null = null;

  // Capture the last screenshot returned by any tool call.
  const executeTool = async (name: string, input: Record<string, any>) => {
    const r = await executor.executeTool(name, input);
    if (r.screenshot) finalScreenshot = r.screenshot;
    return r;
  };

  let result: AgentLoopResult;
  try {
    result = await runAgentLoop({
      task: c.task,
      url: c.url,
      context: c.context,
      executeTool,
      maxSteps: 50,
    });
  } catch (e: any) {
    return {
      domain,
      caseId: c.id,
      pass: false,
      reasons: [`runAgentLoop threw: ${e.message}`],
      steps: 0,
      durationMs: Date.now() - start,
      error: e.message,
    };
  }

  const turns = result.turns ?? [];

  if (c.forbidden_tool_call) {
    const hit = findForbiddenCall(turns, c.forbidden_tool_call);
    if (hit) {
      reasons.push(
        `forbidden_tool_call matched at step ${hit.step} (tool=${c.forbidden_tool_call.tool})`
      );
    }
  }

  if (c.required_tool_call) {
    const hit = findRequiredCall(turns, c.required_tool_call);
    if (!hit) {
      reasons.push(
        `required_tool_call not found (tool=${c.required_tool_call.tool})`
      );
    }
  }

  const succ = await checkSuccess(c.success_check, result, finalScreenshot);
  if (!succ.pass) reasons.push(`success_check failed: ${succ.reason}`);

  return {
    domain,
    caseId: c.id,
    pass: reasons.length === 0,
    reasons,
    steps: result.steps,
    durationMs: Date.now() - start,
    answer: result.answer,
  };
}
