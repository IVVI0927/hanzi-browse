import { readFileSync } from "fs";
import { parse as parseYaml } from "yaml";
import type { GoldenFile, GoldenCase } from "./types.js";

export function loadGoldenFile(path: string): GoldenFile {
  const raw = parseYaml(readFileSync(path, "utf-8"));
  if (!raw || typeof raw !== "object") {
    throw new Error(`Invalid YAML at ${path}: not an object`);
  }
  if (typeof raw.domain !== "string") {
    throw new Error(`Missing or invalid \`domain\` in ${path}`);
  }
  if (!Array.isArray(raw.cases)) {
    throw new Error(`\`cases\` must be an array in ${path}`);
  }
  const cases: GoldenCase[] = raw.cases.map((c: any, i: number) => {
    if (typeof c.id !== "string") {
      throw new Error(`Case ${i} in ${path}: missing \`id\``);
    }
    if (typeof c.task !== "string") {
      throw new Error(`Case ${c.id} in ${path}: missing \`task\``);
    }
    if (!c.success_check || typeof c.success_check.type !== "string") {
      throw new Error(`Case ${c.id} in ${path}: missing \`success_check\``);
    }
    return c as GoldenCase;
  });
  return { domain: raw.domain, cases };
}
