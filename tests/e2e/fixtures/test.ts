/**
 * The fixtures every spec builds on.
 *
 * `authState` is a worker-visible option rather than a per-test call so a whole
 * describe block can declare "this is a signed-in visitor" once. It is applied
 * before the first navigation, because `ClerkProvider` loads its script during the
 * very first paint and swapping it afterwards would race the app.
 */

import { test as base, expect } from "@playwright/test";
import { DeckApiMock } from "./deckApi";
import {
  CLERK_ANY_URL,
  CLERK_JS_URL,
  CLERK_UI_STUB_SCRIPT,
  CLERK_UI_URL,
  clerkStubScript,
  E2E_USER,
  type StubUser,
} from "./clerkStub";
import { EntryPage } from "../pages/EntryPage";
import { ResultPage } from "../pages/ResultPage";
import { RunPage } from "../pages/RunPage";

export type AuthState = "signed-in" | "signed-out";

interface Options {
  /** Who the browser believes it is. Override per describe block with `test.use`. */
  authState: AuthState;
  /** The stubbed identity; only meaningful when signed in. */
  clerkUser: StubUser;
}

interface Fixtures {
  entryPage: EntryPage;
  runPage: RunPage;
  resultPage: ResultPage;
  /** Installed on demand — a spec that wants the real API simply never touches it. */
  deckApi: DeckApiMock;
}

export const test = base.extend<Options & Fixtures>({
  authState: ["signed-out", { option: true }],
  clerkUser: [E2E_USER, { option: true }],

  // Auto-use: no spec should ever hit the unreachable clerk.e2e.local host, and a
  // missed interception shows up as a 30s hang rather than an obvious failure.
  page: async ({ page, authState, clerkUser }, use) => {
    await page.route(CLERK_JS_URL, (route) =>
      route.fulfill({ status: 200, contentType: "application/javascript", body: clerkStubScript(authState === "signed-in", clerkUser) }),
    );
    await page.route(CLERK_UI_URL, (route) =>
      route.fulfill({ status: 200, contentType: "application/javascript", body: CLERK_UI_STUB_SCRIPT }),
    );
    // Telemetry and any other frontend-API chatter: answer, never leave it hanging.
    await page.route(CLERK_ANY_URL, (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: "{}" }),
    );
    await use(page);
  },

  entryPage: async ({ page }, use) => {
    await use(new EntryPage(page));
  },
  runPage: async ({ page }, use) => {
    await use(new RunPage(page));
  },
  resultPage: async ({ page }, use) => {
    await use(new ResultPage(page));
  },
  deckApi: async ({ page }, use) => {
    const mock = new DeckApiMock(page);
    await mock.install();
    await use(mock);
  },
});

export { expect };
export { E2E_USER };
