import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { App } from "./App";

describe("App", () => {
  it("exports the scaffold app component", () => {
    expect(App).toBeTypeOf("function");
  });

  it("renders the P1 workspace flow landmarks", () => {
    const markup = renderToStaticMarkup(<App />);

    expect(markup).toContain("Project command center");
    expect(markup).toContain("Creative prep");
    expect(markup).toContain("Generation studio");
    expect(markup).toContain("Delivery room");
    expect(markup).toContain("Analytics dashboard");
    expect(markup).toContain("Product setup");
    expect(markup).not.toContain("Studio editor");
  });

  it("renders the workspace in Chinese when Chinese is selected", () => {
    const markup = renderToStaticMarkup(<App initialLanguage="zh" />);

    expect(markup).toContain("项目指挥中心");
    expect(markup).toContain("创意准备");
    expect(markup).toContain("生成工作室");
    expect(markup).toContain("交付室");
    expect(markup).toContain("数据仪表盘");
    expect(markup).toContain("产品设置");
    expect(markup).toContain("界面语言");
  });
});
