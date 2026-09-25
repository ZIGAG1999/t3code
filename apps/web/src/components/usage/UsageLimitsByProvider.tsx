import type { ServerProviderUsageWindow } from "@t3tools/contracts";
import {
  collectLimitNotices,
  cursorUsageWindowDetails,
  formatDuration,
  formatResetsIn,
  type LimitAccount,
  type LimitPool,
  type LimitPoolWindow,
  type LimitPresentations,
  limitAccountName,
  remainingPercent,
} from "@t3tools/shared/usageLimits";
import { AlertTriangleIcon } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";

import { usePrimarySettings } from "../../hooks/useSettings";
import { formatUpcomingTimestamp } from "../../timestampFormat";
import { ProviderInstanceIcon } from "../chat/ProviderInstanceIcon";
import { getDriverOption } from "../settings/providerDriverMeta";
import { Alert, AlertTitle } from "../ui/alert";
import { ResetCredits, WindowBar, barColor } from "./UsageLimits";
import { collectLimitSections, type LimitSection } from "./usageLimitSections";

/** Cursor names its pools itself; every other window keeps the provider's label. */
function columnDetails(driver: LimitPool["driver"], window: { id: string; label: string }) {
  const cursor = driver === "cursor" ? cursorUsageWindowDetails(window.id) : undefined;
  return { label: cursor?.label ?? window.label, description: cursor?.description };
}

/**
 * Every row on the page shares one template, so the columns line up down
 * each section and across providers.
 */
function Row({ columns, children }: { readonly columns: number; readonly children: ReactNode }) {
  return (
    <div
      style={{ "--limit-columns": Math.max(columns, 1) } as CSSProperties}
      className="grid gap-x-8 gap-y-3 border-t border-border/60 py-4 md:grid-cols-[minmax(0,13rem)_repeat(var(--limit-columns),minmax(0,1fr))]"
    >
      {children}
    </div>
  );
}

function CellHeading({ label, value }: { readonly label: string; readonly value: ReactNode }) {
  return (
    <span className="flex min-w-0 items-baseline gap-2 text-xs">
      <span className="truncate text-muted-foreground">{label}</span>
      <span className="ms-auto shrink-0 font-medium text-foreground tabular-nums">{value}</span>
    </span>
  );
}

/** One window of one account: what is left, the bar, and when it resets. */
function WindowCell({
  window,
  label,
  color,
  now,
}: {
  readonly window: ServerProviderUsageWindow;
  readonly label: string;
  readonly color: string;
  readonly now: number;
}) {
  const timestampFormat = usePrimarySettings((settings) => settings.timestampFormat);
  const resetsIn = formatResetsIn(window, now);
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <CellHeading label={label} value={`${remainingPercent(window)}%`} />
      <WindowBar color={color} window={window} now={now} />
      <span className="truncate text-xs text-muted-foreground tabular-nums">
        {window.resetsAt && resetsIn ? (
          <>
            <span className="text-foreground">{resetsIn.replace("resets ", "")}</span>
            {` · ${formatUpcomingTimestamp(window.resetsAt, timestampFormat, now)}`}
          </>
        ) : (
          "No reset pending"
        )}
      </span>
    </div>
  );
}

/**
 * One window summed over the accounts that report it: five untouched accounts
 * are 500%. The next reset that hands anything back is counted in the same
 * points.
 */
function TotalCell({
  column,
  label,
  now,
}: {
  readonly column: LimitPoolWindow;
  readonly label: string;
  readonly now: number;
}) {
  const next = column.resets.find((reset) => reset.member.window.usedPercent > 0);
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className="truncate text-xs text-muted-foreground">{label}</span>
      <span className="flex items-baseline gap-1.5">
        <span className="text-2xl font-semibold text-foreground tabular-nums">
          {column.totalRemainingPercent}%
        </span>
        <span className="text-xs text-muted-foreground">remaining</span>
      </span>
      <span className="text-xs text-muted-foreground tabular-nums">
        {next ? (
          <>
            <span className="font-medium text-foreground">
              ↻ +{Math.round(next.member.window.usedPercent)}%
            </span>{" "}
            {next.at <= now ? "now" : `in ${formatDuration(next.at - now)}`}
          </>
        ) : (
          `of ${column.members.length * 100}%`
        )}
      </span>
    </div>
  );
}

/** Who the account is (email censored), its plan, and its banked reset credits. */
function AccountCell({ account, now }: { readonly account: LimitAccount; readonly now: number }) {
  const driverLabel = getDriverOption(account.driver)?.label ?? String(account.driver);
  const name = limitAccountName(account) ?? driverLabel;
  // Hub accounts without an email carry their raw file name as a display name,
  // and a default instance's name only repeats the section heading.
  const instanceName =
    !account.sourceAccountId &&
    account.email &&
    account.displayName?.toLowerCase() !== driverLabel.toLowerCase()
      ? account.displayName
      : null;
  const detail = [account.plan, instanceName].filter(Boolean).join(" · ");
  const credits = account.limits.resetCredits;
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className="truncate font-mono text-sm font-medium text-foreground">{name}</span>
      {detail ? <span className="truncate text-xs text-muted-foreground">{detail}</span> : null}
      {account.redeem && credits ? (
        <ResetCredits
          environmentId={account.redeem.environmentId}
          input={account.redeem.input}
          credits={credits}
          now={now}
        />
      ) : null}
    </div>
  );
}

function AccountRows({
  pool,
  columns,
  gridColumns,
  now,
}: {
  readonly pool: LimitPool;
  readonly columns: readonly LimitPoolWindow[];
  readonly gridColumns: number;
  readonly now: number;
}) {
  const color = barColor(pool.driver);
  const details = columns.map((column) => columnDetails(pool.driver, column));
  return (
    <div className="flex flex-col">
      {pool.accounts.length > 1 && columns.length > 0 ? (
        <Row columns={gridColumns}>
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="text-sm font-medium text-foreground">All accounts</span>
            <span className="text-xs text-muted-foreground">
              {pool.accounts.length} accounts pooled
            </span>
          </div>
          {columns.map((column, position) => (
            <TotalCell
              key={`${column.kind}:${column.id}`}
              column={column}
              label={details[position]!.label}
              now={now}
            />
          ))}
        </Row>
      ) : null}
      {pool.accounts.map((account, index) => (
        <Row key={account.key} columns={gridColumns}>
          <AccountCell account={account} now={now} />
          {account.limits.windows.length === 0 ? (
            <p className="text-xs text-muted-foreground md:col-[2/-1]">No usage reported yet.</p>
          ) : (
            columns.map((column, position) => {
              const window = column.columns[index]?.window;
              const label = details[position]!.label;
              return window ? (
                <WindowCell
                  key={`${column.kind}:${column.id}`}
                  window={window}
                  label={label}
                  color={color}
                  now={now}
                />
              ) : (
                <span key={`${column.kind}:${column.id}`} className="text-xs text-muted-foreground">
                  {label}: not reported
                </span>
              );
            })
          )}
        </Row>
      ))}
      {details.some((detail) => detail.description) ? (
        <dl className="flex flex-col gap-0.5 border-t border-border/60 pt-3 text-xs">
          {details.map((detail) =>
            detail.description ? (
              <div key={detail.label} className="flex flex-wrap gap-x-1.5">
                <dt className="font-medium text-foreground">{detail.label}</dt>
                <dd className="text-muted-foreground">{detail.description}</dd>
              </div>
            ) : null,
          )}
        </dl>
      ) : null}
    </div>
  );
}

function ProviderSection({
  section,
  gridColumns,
  now,
  children,
}: {
  readonly section: LimitSection;
  readonly gridColumns: number;
  readonly now: number;
  /** Provider-specific setup shown under the section, such as enabling Cursor usage. */
  readonly children?: ReactNode;
}) {
  const label = getDriverOption(section.driver)?.label ?? String(section.driver);
  return (
    <section className="flex flex-col gap-2">
      <h2 className="flex items-center gap-2 text-sm font-medium text-foreground">
        <ProviderInstanceIcon
          driverKind={section.driver}
          displayName={label}
          indicatorBackground="var(--background)"
          className="size-5"
          iconClassName="size-4 text-foreground/80"
        />
        {label}
        {section.pool ? (
          <span className="font-normal text-muted-foreground tabular-nums">
            {section.pool.accounts.length}
          </span>
        ) : null}
      </h2>
      {section.pool ? (
        <AccountRows
          pool={section.pool}
          columns={section.columns}
          gridColumns={gridColumns}
          now={now}
        />
      ) : (
        <p className="text-xs text-muted-foreground">
          {section.empty.headline}
          {section.empty.detail ? ` · ${section.empty.detail}` : null}
        </p>
      )}
      {children}
    </section>
  );
}

/**
 * Subscription limits one provider at a time: the pooled total when there are
 * several accounts, then a row per account with a bar per window.
 */
export function UsageLimitsByProvider({
  presentations,
  now,
  cursorPrompt,
}: {
  readonly presentations: LimitPresentations;
  readonly now: number;
  /** Offered in the Cursor section when an environment can read Cursor usage once allowed. */
  readonly cursorPrompt?: ReactNode;
}) {
  const sections = collectLimitSections(presentations, now);
  const notices = collectLimitNotices(presentations, { includeUnmetered: true });
  // One column count for the whole page, so bars line up across providers.
  const gridColumns = Math.max(
    1,
    ...sections.map((section) => (section.pool ? section.columns.length : 0)),
  );
  return (
    <div className="flex flex-col gap-8">
      {sections.map((section) => (
        <ProviderSection key={section.driver} section={section} gridColumns={gridColumns} now={now}>
          {section.driver === "cursor" ? cursorPrompt : null}
        </ProviderSection>
      ))}
      <LimitNotices notices={notices} />
    </div>
  );
}

/** Sources and providers that could not be read, so a missing bar is not mistaken for a full one. */
function LimitNotices({ notices }: { readonly notices: readonly string[] }) {
  if (notices.length === 0) return null;
  return (
    <Alert variant="warning" controlAlignment="first-line">
      <AlertTriangleIcon />
      {notices.map((notice) => (
        <AlertTitle key={notice} className="break-words">
          {notice}
        </AlertTitle>
      ))}
    </Alert>
  );
}
