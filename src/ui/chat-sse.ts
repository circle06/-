export interface ParsedSseEvent {
  event: string;
  data: string;
}

/** Parse complete SSE event blocks for the chat page and its tests. */
export function parseSseText(text: string): ParsedSseEvent[] {
  const events: ParsedSseEvent[] = [];
  let event = "message";
  let data: string[] = [];
  const flush = () => {
    if (data.length > 0) events.push({ event, data: data.join("\n") });
    event = "message";
    data = [];
  };
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trimEnd();
    if (line === "") flush();
    else if (line.startsWith("event:")) event = line.slice("event:".length).trim();
    else if (line.startsWith("data:")) data.push(line.slice("data:".length).trimStart());
  }
  flush();
  return events;
}
