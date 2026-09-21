/**
 * A stand-in for clerk-js, served to the browser instead of the real script.
 *
 * The app cannot render at all without a Clerk publishable key (`ClerkProvider`
 * throws), and a *signed-in* browser session cannot be forged — it needs a JWT
 * signed by a real Clerk instance. So the suite runs the app against a synthetic
 * key (`E2E_CLERK_PUBLISHABLE_KEY` in playwright.config.ts) whose frontend API
 * host never resolves, and intercepts the two scripts that host would serve.
 *
 * What `@clerk/react` does with those scripts is the whole contract to meet: it
 * loads `clerk.browser.js`, reads `globalThis.Clerk`, calls `load()`, then
 * `addListener()` and reads `.session` / `.user`. Everything below exists to
 * satisfy that and nothing more — a test double, not a Clerk emulator.
 *
 * Server-side `auth()` still sees a signed-out request, so `POST /api/decks`
 * answers 401 however the browser is stubbed. That is deliberate: signed-in specs
 * mock the deck API (`deckApi.ts`), and the real 401 is asserted against the live
 * route in `specs/api-contract.spec.ts`.
 */

export interface StubUser {
  id: string;
  firstName: string;
  lastName: string;
  primaryEmail: string;
}

export const E2E_USER: StubUser = {
  id: "user_2e2eTESTUSER00000000000",
  firstName: "Ada",
  lastName: "Lovelace",
  primaryEmail: "ada@example.com",
};

/** Frontend-API URLs the synthetic publishable key resolves to. */
export const CLERK_JS_URL = /clerk\.e2e\.local\/npm\/@clerk\/clerk-js@.*\.js/;
export const CLERK_UI_URL = /clerk\.e2e\.local\/npm\/@clerk\/ui@.*\.js/;
/** Anything else the stub never serves: telemetry, the FAPI itself, images. */
export const CLERK_ANY_URL = /(^https?:\/\/clerk\.e2e\.local|clerk-telemetry\.com)/;

/**
 * Source of the fake `clerk.browser.js`. It runs in the page, so it is a string
 * rather than an import: the auth state is baked in at interception time.
 */
export function clerkStubScript(signedIn: boolean, user: StubUser): string {
  return `
(() => {
  const SIGNED_IN = ${JSON.stringify(signedIn)};
  const USER = ${JSON.stringify(user)};

  const user = SIGNED_IN
    ? {
        id: USER.id,
        firstName: USER.firstName,
        lastName: USER.lastName,
        fullName: USER.firstName + " " + USER.lastName,
        primaryEmailAddress: { id: "idn_e2e", emailAddress: USER.primaryEmail },
        emailAddresses: [{ id: "idn_e2e", emailAddress: USER.primaryEmail }],
        imageUrl: "",
        publicMetadata: {},
        unsafeMetadata: {},
        organizationMemberships: [],
        reload: async () => user,
      }
    : null;

  const session = SIGNED_IN
    ? {
        id: "sess_e2e",
        status: "active",
        user: user,
        lastActiveToken: { getRawString: () => "e2e.jwt.token" },
        getToken: async () => "e2e.jwt.token",
        touch: async () => session,
        end: async () => session,
        remove: async () => session,
      }
    : null;

  class ClerkStub {
    constructor(publishableKey) {
      this.publishableKey = publishableKey;
      this.version = "e2e-stub";
      this.loaded = false;
      this.status = "loading";
      this.instanceType = "development";
      this.frontendApi = "clerk.e2e.local";
      this.isStandardBrowser = true;
      this.isSatellite = false;
      this.domain = "";
      this.proxyUrl = "";
      this.session = session;
      this.user = user;
      this.organization = null;
      this.client = {
        id: "client_e2e",
        sessions: session ? [session] : [],
        activeSessions: session ? [session] : [],
        lastActiveSessionId: session ? session.id : null,
        signIn: { status: null, create: async () => ({}) },
        signUp: { status: null, create: async () => ({}) },
      };
      this.telemetry = { record: () => {} };
      this.__internal_environment = {
        userSettings: { signUp: {}, attributes: {}, social: {} },
        displayConfig: { applicationName: "CiteDeck (E2E)", homeUrl: "/" },
        authConfig: { singleSessionMode: true },
      };
      // Call counts the specs can assert on.
      this.__e2e = { openSignIn: 0, openSignUp: 0, signOut: 0 };
      this.__listeners = new Set();
      this.__statusListeners = new Set();
    }

    get isSignedIn() {
      return SIGNED_IN;
    }

    __resources() {
      return { client: this.client, session: this.session, user: this.user, organization: this.organization };
    }

    __emit() {
      this.__listeners.forEach((l) => l(this.__resources()));
    }

    async load() {
      this.loaded = true;
      this.status = "ready";
      this.__statusListeners.forEach((l) => l("ready"));
      this.__emit();
      return this;
    }

    addListener(listener) {
      this.__listeners.add(listener);
      listener(this.__resources());
      return () => this.__listeners.delete(listener);
    }

    on(event, listener, opts) {
      if (event === "status") {
        this.__statusListeners.add(listener);
        if (opts && opts.notify) listener(this.status);
      }
    }

    off(event, listener) {
      this.__statusListeners.delete(listener);
    }

    // Completing a sign-in needs a real Clerk instance. The suite only asserts
    // that a signed-out visitor is offered one, so the stub records the call and
    // marks the document for the specs to see.
    openSignIn() {
      this.__e2e.openSignIn++;
      document.documentElement.setAttribute("data-e2e-clerk-modal", "sign-in");
    }
    closeSignIn() {
      document.documentElement.removeAttribute("data-e2e-clerk-modal");
    }
    openSignUp() {
      this.__e2e.openSignUp++;
      document.documentElement.setAttribute("data-e2e-clerk-modal", "sign-up");
    }
    closeSignUp() {
      document.documentElement.removeAttribute("data-e2e-clerk-modal");
    }
    async signOut() {
      this.__e2e.signOut++;
    }
    async getToken() {
      return SIGNED_IN ? "e2e.jwt.token" : null;
    }
    async redirectToSignIn() {
      this.openSignIn();
    }
    async redirectToSignUp() {
      this.openSignUp();
    }
    buildSignInUrl() { return "/sign-in"; }
    buildSignUpUrl() { return "/sign-up"; }
    buildUserProfileUrl() { return "/user"; }
    buildAfterSignInUrl() { return "/"; }
    buildAfterSignUpUrl() { return "/"; }
    buildAfterSignOutUrl() { return "/"; }
    buildUrlWithAuth(url) { return url; }
    setActive() { return Promise.resolve(); }
    handleRedirectCallback() { return Promise.resolve(); }
    handleUnauthenticated() { return Promise.resolve(); }
    __internal_setComponentNavigationContext() { return () => {}; }
    __internal_getOption() { return undefined; }
    __internal_loadStripeJs() { return Promise.resolve(null); }
  }

  // Every mount/unmount pair Clerk's React components may call. Only UserButton
  // matters here — the header renders one when signed in — so it paints something
  // identifiable; the rest are inert but must exist.
  const MOUNTABLE = [
    "SignIn", "SignUp", "UserProfile", "UserButton", "OrganizationProfile",
    "OrganizationSwitcher", "CreateOrganization", "OrganizationList", "Waitlist",
    "PricingTable", "Checkout", "PlanDetails", "SubscriptionDetails", "APIKeys",
    "TaskSelectOrganization", "TaskSetupMFA", "TaskChooseSession", "OAuthConsent",
    "SignInButton", "UserVerification",
  ];
  for (const name of MOUNTABLE) {
    ClerkStub.prototype["mount" + name] = function (node) {
      if (!node) return;
      node.setAttribute("data-e2e-clerk-component", name);
      if (name === "UserButton") {
        node.innerHTML =
          '<button type="button" aria-label="Open user button" data-e2e-user-button>' +
          (SIGNED_IN ? USER.firstName.charAt(0) + USER.lastName.charAt(0) : "?") +
          '</button>';
      }
    };
    ClerkStub.prototype["unmount" + name] = function (node) {
      if (node) node.innerHTML = "";
    };
    ClerkStub.prototype["__internal_mount" + name] = ClerkStub.prototype["mount" + name];
    ClerkStub.prototype["__internal_unmount" + name] = ClerkStub.prototype["unmount" + name];
    ClerkStub.prototype["__internal_open" + name] = function () {};
    ClerkStub.prototype["__internal_close" + name] = function () {};
  }

  const script = document.currentScript;
  const key =
    (script && script.getAttribute("data-clerk-publishable-key")) ||
    window.__clerk_publishable_key ||
    "pk_test_e2e";
  globalThis.Clerk = new ClerkStub(key);
  globalThis.__clerk_e2e_stub = true;
})();
`;
}

/** The companion `ui.browser.js`; `@clerk/react` throws without the ctor global. */
export const CLERK_UI_STUB_SCRIPT = `
globalThis.__internal_ClerkUICtor = class ClerkUIStub {
  constructor() {}
  async init() {}
  mount() {}
  unmount() {}
};
`;
