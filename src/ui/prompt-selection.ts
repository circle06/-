import type { BuiltInPrompt } from "@/prompts/built-in-prompts";
import type { LocalPrompt } from "@/ui/local-data";

export type PromptSelection = `built-in:${string}` | `local:${string}` | "";

export function builtInPromptValue(promptId: string): PromptSelection {
  return `built-in:${promptId}`;
}

export function localPromptValue(promptId: string): PromptSelection {
  return `local:${promptId}`;
}

export function promptContentForSelection(
  selection: PromptSelection,
  builtInPrompts: readonly BuiltInPrompt[],
  localPrompts: readonly LocalPrompt[],
): string | undefined {
  if (selection.startsWith("built-in:")) {
    return builtInPrompts.find((prompt) => prompt.id === selection.slice("built-in:".length))?.content;
  }
  if (selection.startsWith("local:")) {
    return localPrompts.find((prompt) => prompt.id === selection.slice("local:".length))?.content;
  }
  return undefined;
}
