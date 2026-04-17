export interface ToolCallAssertion {
  /** Tool name to match, e.g. "javascript_tool" or "form_input". */
  tool: string;
  /** Optional regex (as string) that must match against JSON.stringify(toolInput). */
  target_regex?: string;
  /** Optional substring that must appear in JSON.stringify(toolInput). */
  body_contains?: string;
}

export type SuccessCheck =
  | {
      type: "llm_judge";
      /** Prompt sent to the judge model alongside the final screenshot. */
      prompt: string;
    }
  | {
      type: "agent_answer_contains";
      /** Substring that must appear in AgentLoopResult.answer. */
      substring: string;
    };

export interface GoldenCase {
  id: string;
  task: string;
  url?: string;
  context?: string;
  success_check: SuccessCheck;
  /** If the agent made a tool call matching this, it's a regression. */
  forbidden_tool_call?: ToolCallAssertion;
  /** The agent MUST have made at least one tool call matching this. */
  required_tool_call?: ToolCallAssertion;
  /** Per-case timeout, seconds. Default 120. */
  timeout_sec?: number;
}

export interface GoldenFile {
  domain: string;
  cases: GoldenCase[];
}

export interface CaseResult {
  domain: string;
  caseId: string;
  pass: boolean;
  reasons: string[];
  steps: number;
  durationMs: number;
  answer?: string;
  error?: string;
}
