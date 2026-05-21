import { Clapperboard, Server, Sparkles } from "lucide-react";
import { createHealthPayload } from "@shopclip/shared";

const webHealth = createHealthPayload("web");

export const App = () => {
  return (
    <main className="app-shell">
      <section className="hero" aria-labelledby="page-title">
        <div className="brand-mark" aria-hidden="true">
          <Clapperboard size={28} strokeWidth={1.8} />
        </div>
        <p className="eyebrow">ShopClip AI</p>
        <h1 id="page-title">AIGC ecommerce video workspace scaffold</h1>
        <p className="subtitle">
          Part 001 is ready: the web app, API app, and shared TypeScript package are wired
          together.
        </p>
      </section>

      <section className="status-grid" aria-label="Scaffold status">
        <article className="status-card">
          <Sparkles size={22} aria-hidden="true" />
          <div>
            <h2>Web</h2>
            <p>
              {webHealth.service} service is <strong>{webHealth.status}</strong>.
            </p>
          </div>
        </article>
        <article className="status-card">
          <Server size={22} aria-hidden="true" />
          <div>
            <h2>API</h2>
            <p>Health endpoint: <code>/health</code> on port <code>4000</code>.</p>
          </div>
        </article>
      </section>
    </main>
  );
};
