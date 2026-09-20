import type { Metadata } from "next";

export const metadata: Metadata = { title: "Offline · Research-to-Deck" };

export default function Offline() {
  return (
    <main>
      <div className="eyebrow">IntelliForge Deep Research</div>
      <h1>You&rsquo;re offline</h1>
      <p className="lede">
        Generating a deck needs a connection — we read papers from OpenAlex and call Claude to write the slides. Any deck
        that already finished is still downloadable once you&rsquo;re back online.
      </p>
      <p className="lede">Reconnect and reload to pick up where you left off.</p>
    </main>
  );
}
