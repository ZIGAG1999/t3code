import {
  EnvironmentId,
  ProviderDriverKind,
  ProviderInstanceId,
  type ServerProvider,
  type ServerProviderUsageWindow,
} from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { collectLimitSections, limitsEmptyState } from "./usageLimitSections";

const now = Date.parse("2026-09-25T12:00:00.000Z");
const checkedAt = "2026-09-25T11:00:00.000Z";

function provider(overrides: Partial<ServerProvider>): ServerProvider {
  return {
    instanceId: ProviderInstanceId.make("codex"),
    driver: ProviderDriverKind.make("codex"),
    enabled: true,
    installed: true,
    version: null,
    status: "ready",
    auth: { status: "authenticated" },
    checkedAt,
    models: [],
    slashCommands: [],
    skills: [],
    ...overrides,
  };
}

const presentations = (providers: ServerProvider[]) =>
  new Map([
    [
      EnvironmentId.make("env"),
      { entry: { target: { label: "Laptop" } }, serverConfig: { providers } },
    ],
  ]);

const claudeWindow = (id: string, label: string): ServerProviderUsageWindow => ({
  id,
  kind: id === "five_hour" ? "session" : "weekly",
  label,
  usedPercent: 10,
});

describe("collectLimitSections", () => {
  it("lists every provider in a fixed order and leads Claude with its model allowance", () => {
    const claude = provider({
      instanceId: ProviderInstanceId.make("claude"),
      driver: ProviderDriverKind.make("claudeAgent"),
      auth: { status: "authenticated", email: "someone@example.com" },
      usageLimits: {
        checkedAt,
        windows: [
          claudeWindow("five_hour", "5-hour limit"),
          claudeWindow("seven_day", "7-day limit"),
          claudeWindow("seven_day_fable_5", "7-day Fable 5"),
        ],
      },
    });
    const sections = collectLimitSections(presentations([claude]), now);
    expect(sections.map((section) => [section.driver, section.pool !== null])).toEqual([
      ["claudeAgent", true],
      ["codex", false],
      ["grok", false],
      ["opencode", false],
      ["cursor", false],
      ["antigravity", false],
    ]);
    const [first] = sections;
    expect(first?.pool ? first.columns.map((column) => column.label) : null).toEqual([
      "7-day Fable 5",
      "5-hour limit",
      "7-day limit",
    ]);
  });

  it("shows Cursor's two pools instead of their combined total", () => {
    const cursor = provider({
      instanceId: ProviderInstanceId.make("cursor"),
      driver: ProviderDriverKind.make("cursor"),
      usageLimits: {
        checkedAt,
        windows: ["totalPercentUsed", "apiPercentUsed", "autoPercentUsed"].map((id) => ({
          id,
          kind: "monthly" as const,
          label: id,
          usedPercent: 10,
        })),
      },
    });
    const section = collectLimitSections(presentations([cursor]), now).find(
      (candidate) => candidate.driver === "cursor",
    );
    expect(section?.pool ? section.columns.map((column) => column.id) : null).toEqual([
      "autoPercentUsed",
      "apiPercentUsed",
    ]);
  });

  it("keeps a provider outside the fixed order when it reports accounts", () => {
    const other = provider({
      driver: ProviderDriverKind.make("future"),
      usageLimits: { checkedAt, windows: [claudeWindow("five_hour", "Session")] },
    });
    expect(collectLimitSections(presentations([other]), now).at(-1)?.driver).toBe("future");
  });
});

describe("limitsEmptyState", () => {
  const detailOf = (providers: ServerProvider[]) => limitsEmptyState(providers).detail;

  it("explains a missing account without calling it an error", () => {
    expect(limitsEmptyState([]).detail).toBe("Not set up on the selected environments.");
    // Before an environment's config arrives, nothing is known yet.
    expect(limitsEmptyState([], true)).toEqual({
      headline: "Checking provider status",
      detail: null,
    });
    expect(
      detailOf([provider({ enabled: false, message: "Grok is disabled in T3 Code settings." })]),
    ).toBe("Grok is disabled in T3 Code settings.");
    // Antigravity has no limits probe at all.
    expect(detailOf([provider({ driver: ProviderDriverKind.make("antigravity") })])).toBe(
      "Does not report usage limits.",
    );
    expect(
      detailOf([
        provider({
          usageLimits: { checkedAt, windows: [], unavailable: { reason: "unsupported" } },
        }),
      ]),
    ).toBe("This account has no subscription limits.");
    // A working instance speaks for the driver over a disabled one.
    expect(
      detailOf([
        provider({ enabled: false }),
        provider({
          usageLimits: { checkedAt, windows: [], unavailable: { reason: "unsupported" } },
        }),
      ]),
    ).toBe("This account has no subscription limits.");
  });
});
