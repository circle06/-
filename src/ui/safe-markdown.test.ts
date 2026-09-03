import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SafeMarkdown } from "@/ui/safe-markdown";

function render(content: string): string {
  return renderToStaticMarkup(createElement(SafeMarkdown, { content }));
}

describe("SafeMarkdown", () => {
  it("renders fenced code blocks and basic tables", () => {
    const html = render("```ts\nconst value = 1;\n```\n\n| Name | Value |\n| --- | --- |\n| one | **two** |");
    expect(html).toContain("<pre><code data-language=\"ts\">const value = 1;</code></pre>");
    expect(html).toContain("<table>");
    expect(html).toContain("<thead>");
    expect(html).toContain("<strong>two</strong>");
  });

  it("renders raw HTML, scripts and event attributes only as escaped text", () => {
    const html = render('<script>alert(1)</script>\n<img src=x onerror="alert(2)">\n<div onclick="alert(3)">text</div>');
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<div onclick");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).toContain("&lt;img src=x onerror=&quot;alert(2)&quot;&gt;");
  });
});
