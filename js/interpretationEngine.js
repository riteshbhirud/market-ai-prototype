/**
 * Backwards-compat wrapper.
 *
 * The single source of truth for rule-based interpretation logic now lives in
 * `js/interpretation/engine.js`. This module remains to avoid touching other imports.
 */
import { interpretRuleBased } from "./interpretation/engine.js";

export async function interpret(data, useAI) {
  if (useAI) {
    return interpret_AI()
  }
  return await interpretRuleBased(data);
}

/**
 * Returns one alternative explanation; cycle index for "request another".
 */
export async function getAlternativeInterpretation(data, index = 0) {
  const { alternatives } = await interpret(data, useAI=false);
  return alternatives[index % alternatives.length];
}