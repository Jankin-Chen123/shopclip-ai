import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { App } from "./App";

describe("App", () => {
  it("exports the scaffold app component", () => {
    expect(App).toBeTypeOf("function");
  });

  it("renders the P0 workspace flow landmarks", () => {
    const markup = renderToStaticMarkup(<App />);

    expect(markup).toContain("Project command center");
    expect(markup).toContain("Creative prep");
    expect(markup).toContain("Generation studio");
    expect(markup).toContain("Delivery room");
    expect(markup).toContain("Product setup");
    expect(markup).not.toContain("Studio editor");
  });
});
