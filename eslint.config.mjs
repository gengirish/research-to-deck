import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// The design system's one machine-checkable rule: components compose from the tokens in
// globals.css, never from literals. See design-system/research-to-deck/MASTER.md §5.
// globals.css itself is the token layer and is exempt by virtue of not being JSX.
const designSystem = {
  files: ["src/**/*.tsx"],
  rules: {
    "no-restricted-syntax": [
      "error",
      {
        selector: "JSXAttribute[name.name='style'] Literal[value=/#[0-9a-fA-F]{3,8}\\b/]",
        message:
          "Raw hex in a style prop. Use a token — var(--color-…) — see design-system/research-to-deck/MASTER.md §2.1.",
      },
      {
        selector: "JSXAttribute[name.name='style'] TemplateElement[value.raw=/#[0-9a-fA-F]{3,8}\\b/]",
        message:
          "Raw hex in a style prop. Use a token — var(--color-…) — see design-system/research-to-deck/MASTER.md §2.1.",
      },
      {
        selector: "JSXAttribute[name.name='style'] Property[key.name='borderRadius'][value.value!=0]",
        message:
          "Industry is square: border-radius is 0 everywhere outside .auth-panel. See MASTER.md §2.5.",
      },
    ],
  },
};

// Playwright's fixture API takes a callback named after the fixture and hands it a
// `use` function. That is not a React hook, but the rules-of-hooks heuristic reads
// `use(...)` inside a lowercase function and says otherwise.
const e2e = {
  files: ["tests/e2e/**/*.ts"],
  rules: {
    "react-hooks/rules-of-hooks": "off",
  },
};

const config = [
  ...nextVitals,
  ...nextTs,
  designSystem,
  e2e,
  { ignores: [".next/**", "node_modules/**", "next-env.d.ts"] },
];

export default config;
