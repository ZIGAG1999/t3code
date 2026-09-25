import type { OrchestratorFixtureInput } from "../shared.ts";

export const GROK_MONITOR_TICKS = ["tick 1", "tick 2", "tick 3"] as const;

export const GROK_MONITOR_PROMPT =
  "Use the Monitor tool to watch this command: 'for i in 1 2 3; do sleep 8; echo tick $i; done'. Do not wait for the monitor to finish; as soon as it has started, end your turn by replying exactly ROOT_DONE.";

/** First reply Grok streams after the monitor ended (its own `notifications-*` wake turn). */
const GROK_MONITOR_WAKE_LABEL =
  "notification:session/update:agent_message_chunk:notifications-01a0d754-c2a6-7e51-b5d9-710c43051847";

export function grokMonitorInput(): OrchestratorFixtureInput {
  return {
    steps: [
      { type: "message", text: GROK_MONITOR_PROMPT },
      {
        type: "await_turn_item",
        targetRunIndex: 1,
        itemType: "command_execution",
        status: "completed",
      },
      { type: "advance_clock", duration: "3 seconds" },
      { type: "await_run_status", targetRunIndex: 1, status: "completed" },
      { type: "release_replay_gate", label: GROK_MONITOR_WAKE_LABEL },
      {
        type: "await_run_status",
        targetRunIndex: 2,
        status: "running",
        waitForTurnItemType: "assistant_message",
      },
      { type: "advance_clock", duration: "3 seconds" },
      { type: "await_run_status", targetRunIndex: 2, status: "completed" },
    ],
  };
}
