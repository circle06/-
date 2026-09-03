export interface BuiltInPrompt {
  id: string;
  name: string;
  content: string;
  updatedAt: string;
}

const builtInPrompts: readonly BuiltInPrompt[] = [
  {
    id: "summarize",
    name: "总结",
    content: "请将以下内容概括为三个要点，并保留重要事实：\n\n",
    updatedAt: "2026-09-03T00:00:00.000Z",
  },
  {
    id: "translate-zh-en",
    name: "中英翻译",
    content: "请将以下内容翻译成英文，保持原意和语气，只输出译文：\n\n",
    updatedAt: "2026-09-03T00:00:00.000Z",
  },
  {
    id: "explain-code",
    name: "代码解释",
    content: "请解释以下代码的用途、主要流程和潜在风险：\n\n",
    updatedAt: "2026-09-03T00:00:00.000Z",
  },
];

export function listBuiltInPrompts(): BuiltInPrompt[] {
  return builtInPrompts.map((prompt) => ({ ...prompt }));
}
