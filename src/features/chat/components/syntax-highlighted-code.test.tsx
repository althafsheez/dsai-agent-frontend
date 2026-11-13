import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SyntaxHighlightedCode } from "./syntax-highlighted-code";

describe("SyntaxHighlightedCode", () => {
  it("applies VS Code-style token colors without changing code text", () => {
    const { container } = render(<pre><SyntaxHighlightedCode language="python" code={'def greet(name):\n    # hello\n    return "Hi " + name'} /></pre>);

    expect(container).toHaveTextContent('def greet(name): # hello return "Hi " + name');
    expect(screen.getByText("def")).toHaveStyle({ color: "#c586c0" });
    expect(screen.getByText("greet")).toHaveStyle({ color: "#dcdcaa" });
    expect(screen.getByText("# hello")).toHaveStyle({ color: "#6a9955" });
    expect(screen.getByText('"Hi "')).toHaveStyle({ color: "#ce9178" });
  });
});
