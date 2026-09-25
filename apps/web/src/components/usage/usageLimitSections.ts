import { ProviderDriverKind, type ServerProvider } from "@t3tools/contracts";
import {
  collectLimitAccounts,
  collectLimitPools,
  displayLimitWindows,
  type LimitPool,
  type LimitPoolWindow,
  type LimitPresentations,
  limitsNotice,
} from "@t3tools/shared/usageLimits";

import { getProviderSummary } from "../settings/providerStatus";

/** Limits always lists these providers, in this order, whether or not they have accounts. */
const SECTION_ORDER = ["claudeAgent", "codex", "grok", "opencode", "cursor", "antigravity"].map(
  (driver) => ProviderDriverKind.make(driver),
);

export type LimitSection =
  | {
      readonly driver: ServerProvider["driver"];
      readonly pool: LimitPool;
      /** The pool's windows in column order. */
      readonly columns: readonly LimitPoolWindow[];
    }
  | {
      readonly driver: ServerProvider["driver"];
      readonly pool: null;
      /** Why there are no accounts to show. */
      readonly empty: LimitsEmptyState;
    };

/** `Disabled` and why, or the status summary's checking state while configs load. */
export interface LimitsEmptyState {
  readonly headline: string;
  readonly detail: string | null;
}

/**
 * One section per provider: its accounts pooled when any reported a read,
 * otherwise the reason it has none. Providers outside the fixed order that
 * still report accounts follow at the end.
 */
export function collectLimitSections(
  presentations: LimitPresentations,
  now: number,
): readonly LimitSection[] {
  const pools = collectLimitPools(
    collectLimitAccounts(presentations, { includeUnmetered: true }),
    now,
  );
  const providers = [...presentations.values()].flatMap(
    (presentation) => presentation.serverConfig?.providers ?? [],
  );
  // Until every environment has sent its config, a missing provider may just not have arrived.
  const loading = [...presentations.values()].some(
    (presentation) => presentation.serverConfig === null,
  );
  const drivers = [...new Set([...SECTION_ORDER, ...pools.map((pool) => pool.driver)])];
  return drivers.map((driver): LimitSection => {
    const pool = pools.find((candidate) => candidate.driver === driver);
    return pool
      ? { driver, pool, columns: limitColumns(pool) }
      : {
          driver,
          pool: null,
          empty: limitsEmptyState(
            providers.filter((provider) => provider.driver === driver),
            loading,
          ),
        };
  });
}

/**
 * The windows worth a column, per `displayLimitWindows` (Cursor shows its two
 * pools instead of their combined total). Claude's model allowance
 * (`seven_day_<model>`) leads its account-wide windows.
 */
function limitColumns(pool: LimitPool): readonly LimitPoolWindow[] {
  const windows = displayLimitWindows(pool);
  if (pool.driver !== "claudeAgent") return windows;
  const scoped = (window: LimitPoolWindow) => window.id.startsWith("seven_day_");
  return [...windows.filter(scoped), ...windows.filter((window) => !scoped(window))];
}

/**
 * Why a provider has no account rows. Setup problems use the provider's own
 * status summary; a working provider says what its limits read reported.
 */
export function limitsEmptyState(
  providers: readonly ServerProvider[],
  loading = false,
): LimitsEmptyState {
  const provider = providers.find((candidate) => candidate.enabled && candidate.installed);
  const shown = provider ?? providers[0];
  const disabled = (detail: string) => ({ headline: "Disabled", detail });
  if (!shown && loading) return { headline: getProviderSummary(undefined).headline, detail: null };
  if (!shown) return disabled("Not set up on the selected environments.");
  if (!provider || shown.auth.status === "unauthenticated") {
    const summary = getProviderSummary(shown);
    return disabled(summary.detail ?? summary.headline);
  }
  if (!shown.usageLimits) return disabled("Does not report usage limits.");
  return disabled(limitsNotice(shown.usageLimits) ?? "No limits reported.");
}
