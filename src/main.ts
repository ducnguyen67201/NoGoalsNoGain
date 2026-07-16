import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

import type { Dashboard, GoalInput, GoalPeriod, ReviewInput } from "./types";
import { loadingMarkup, renderDashboard, updateLiveTimers } from "./ui";

const appElement = document.querySelector<HTMLDivElement>("#app");
const goalDialog = document.querySelector<HTMLDialogElement>("#goal-dialog");
const goalForm = document.querySelector<HTMLFormElement>("#goal-form");
const toastElement = document.querySelector<HTMLDivElement>("#toast");

function render(data: Dashboard): void {
  if (!appElement) {
    return;
  }
  appElement.innerHTML = renderDashboard(data);
  updateLiveTimers();
}

function showToast(message: string, kind: "error" | "success" = "success"): void {
  if (!toastElement) {
    return;
  }

  toastElement.textContent = message;
  toastElement.dataset.kind = kind;
  toastElement.classList.add("is-visible");
  window.setTimeout(() => toastElement.classList.remove("is-visible"), 3200);
}

async function refreshDashboard(): Promise<void> {
  render(await invoke<Dashboard>("get_dashboard"));
}

async function runCommand(
  command: string,
  args: Record<string, unknown> = {},
  successMessage?: string,
): Promise<boolean> {
  try {
    render(await invoke<Dashboard>(command, args));
    if (successMessage) {
      showToast(successMessage);
    }
    return true;
  } catch (error) {
    showToast(String(error), "error");
    return false;
  }
}

function openGoalDialog(period?: GoalPeriod): void {
  if (!goalDialog || !goalForm) {
    return;
  }

  goalForm.reset();
  const periodSelect = goalForm.elements.namedItem("period");
  if (periodSelect instanceof HTMLSelectElement && period) {
    periodSelect.value = period;
  }
  goalDialog.showModal();
  window.setTimeout(() => {
    goalForm.querySelector<HTMLInputElement>('input[name="title"]')?.focus();
  }, 50);
}

document.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof Element)) {
    return;
  }

  const actionElement = target.closest<HTMLElement>("[data-action]");
  if (!actionElement) {
    return;
  }

  const action = actionElement.dataset.action;
  const goalId = actionElement.dataset.goalId;

  switch (action) {
    case "new-goal":
      openGoalDialog(actionElement.dataset.period as GoalPeriod | undefined);
      break;
    case "close-goal-dialog":
      goalDialog?.close();
      break;
    case "start-focus":
      if (goalId) {
        void runCommand("start_focus", { goalId }, "Focus session started.");
      }
      break;
    case "stop-focus":
      void runCommand("stop_focus", {}, "Focus session saved.");
      break;
    case "complete-goal":
      if (goalId) {
        void runCommand("complete_goal", { goalId }, "Goal marked as shipped.");
      }
      break;
    case "primary-goal":
      if (goalId) {
        void runCommand("set_primary_goal", { goalId }, "Primary focus updated.");
      }
      break;
    case "delete-goal":
      if (
        goalId &&
        window.confirm("Delete this goal and all of its focus sessions?")
      ) {
        void runCommand("delete_goal", { goalId }, "Goal deleted.");
      }
      break;
    case "scroll": {
      const sectionId = actionElement.dataset.target;
      if (sectionId) {
        document.getElementById(sectionId)?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      }
      break;
    }
  }
});

document.addEventListener("submit", (event) => {
  const form = event.target;
  if (!(form instanceof HTMLFormElement)) {
    return;
  }

  if (form.id === "goal-form") {
    event.preventDefault();
    const formData = new FormData(form);
    const input: GoalInput = {
      title: String(formData.get("title") ?? ""),
      period: String(formData.get("period") ?? "daily") as GoalPeriod,
      targetMinutes: Number(formData.get("targetMinutes") ?? 0),
      isPrimary: formData.get("isPrimary") === "on",
    };

    void runCommand("create_goal", { input }, "Goal created.").then((didCreate) => {
      if (didCreate) {
        goalDialog?.close();
      }
    });
  }

  if (form.id === "review-form") {
    event.preventDefault();
    const formData = new FormData(form);
    const input: ReviewInput = {
      shipped: String(formData.get("shipped") ?? ""),
      blocker: String(formData.get("blocker") ?? ""),
      nextFocus: String(formData.get("nextFocus") ?? ""),
    };

    void runCommand("save_review", { input }, "Daily review saved.");
  }
});

goalDialog?.addEventListener("click", (event) => {
  if (event.target === goalDialog) {
    goalDialog.close();
  }
});

window.setInterval(updateLiveTimers, 1_000);
window.setInterval(() => {
  const activeElement = document.activeElement;
  const isWriting =
    activeElement instanceof HTMLInputElement ||
    activeElement instanceof HTMLTextAreaElement ||
    activeElement instanceof HTMLSelectElement;

  if (!isWriting) {
    void refreshDashboard();
  }
}, 30_000);

void listen("state-changed", () => {
  void refreshDashboard();
});

if (appElement) {
  appElement.innerHTML = loadingMarkup();
}
void refreshDashboard().catch((error: unknown) => {
  showToast(String(error), "error");
});
