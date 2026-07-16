import { invoke } from "@tauri-apps/api/core";
import { LogicalSize } from "@tauri-apps/api/dpi";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  disable as disableAutostart,
  enable as enableAutostart,
  isEnabled as isAutostartEnabled,
} from "@tauri-apps/plugin-autostart";
import { relaunch } from "@tauri-apps/plugin-process";
import {
  check,
  type DownloadEvent,
  type Update,
} from "@tauri-apps/plugin-updater";

import type {
  AppUpdateState,
  Dashboard,
  GoalInput,
  GoalPeriod,
  ReviewInput,
  SystemPreferences,
} from "./types";
import {
  loadingMarkup,
  renderDashboard,
  renderMenuBarPopover,
  updateLiveTimers,
} from "./ui";

const appElement = document.querySelector<HTMLDivElement>("#app");
const goalDialog = document.querySelector<HTMLDialogElement>("#goal-dialog");
const goalForm = document.querySelector<HTMLFormElement>("#goal-form");
const toastElement = document.querySelector<HTMLDivElement>("#toast");
const currentWindow = getCurrentWindow();
const isMenuBarView = currentWindow.label === "menubar";

document.body.classList.toggle("is-menu-popover", isMenuBarView);
document.documentElement.classList.toggle("is-menu-popover", isMenuBarView);

let systemPreferences: SystemPreferences = {
  launchAtLogin: false,
};
let latestDashboard: Dashboard | null = null;
let pendingUpdate: Update | null = null;
let updateCheckPromise: Promise<void> | null = null;
let appUpdateState: AppUpdateState = {
  phase: "idle",
  version: null,
  notes: null,
  progress: null,
  error: null,
};

function render(data: Dashboard): void {
  if (!appElement) {
    return;
  }
  latestDashboard = data;
  appElement.innerHTML = isMenuBarView
    ? renderMenuBarPopover(data, appUpdateState)
    : renderDashboard(data, systemPreferences, appUpdateState);

  if (isMenuBarView) {
    const activeGoalCount = data.goals.filter(
      (goal) => goal.status === "active" && goal.periodEnd > data.now,
    ).length;
    const basePanelHeight =
      activeGoalCount === 0
        ? 450
        : Math.min(560, 420 + Math.max(0, activeGoalCount - 1) * 58);
    const showsUpdatePrompt = [
      "available",
      "downloading",
      "installing",
      "error",
    ].includes(appUpdateState.phase);
    const panelHeight = Math.min(
      620,
      basePanelHeight + (showsUpdatePrompt ? 66 : 0),
    );
    void currentWindow
      .setSize(new LogicalSize(380, panelHeight))
      .catch((error: unknown) => showToast(String(error), "error"));
  }
  updateLiveTimers();
}

function setUpdateState(nextState: AppUpdateState): void {
  appUpdateState = nextState;
  if (latestDashboard) {
    render(latestDashboard);
  }
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

async function checkForUpdates(): Promise<void> {
  if (
    updateCheckPromise ||
    pendingUpdate ||
    appUpdateState.phase === "downloading" ||
    appUpdateState.phase === "installing"
  ) {
    return updateCheckPromise ?? Promise.resolve();
  }

  setUpdateState({
    phase: "checking",
    version: null,
    notes: null,
    progress: null,
    error: null,
  });

  updateCheckPromise = (async () => {
    try {
      pendingUpdate = await check({ timeout: 15_000 });
      if (!pendingUpdate) {
        setUpdateState({
          phase: "idle",
          version: null,
          notes: null,
          progress: null,
          error: null,
        });
        return;
      }

      setUpdateState({
        phase: "available",
        version: pendingUpdate.version,
        notes: pendingUpdate.body ?? null,
        progress: null,
        error: null,
      });
    } catch (error) {
      // A repository with no published release returns 404. Background update
      // checks should never interrupt the user's focus flow.
      console.warn("Update check failed", error);
      setUpdateState({
        phase: "idle",
        version: null,
        notes: null,
        progress: null,
        error: null,
      });
    } finally {
      updateCheckPromise = null;
    }
  })();

  return updateCheckPromise;
}

function updateDownloadProgress(
  event: DownloadEvent,
  downloadedBytes: { value: number },
  totalBytes: { value: number | null },
): void {
  if (event.event === "Started") {
    downloadedBytes.value = 0;
    totalBytes.value = event.data.contentLength ?? null;
  } else if (event.event === "Progress") {
    downloadedBytes.value += event.data.chunkLength;
  } else {
    setUpdateState({
      ...appUpdateState,
      phase: "installing",
      progress: 100,
      error: null,
    });
    return;
  }

  const progress = totalBytes.value
    ? Math.min(
        99,
        Math.round((downloadedBytes.value / totalBytes.value) * 100),
      )
    : null;
  if (progress !== appUpdateState.progress) {
    setUpdateState({
      ...appUpdateState,
      phase: "downloading",
      progress,
      error: null,
    });
  }
}

async function installAvailableUpdate(): Promise<void> {
  if (
    !pendingUpdate ||
    appUpdateState.phase === "downloading" ||
    appUpdateState.phase === "installing"
  ) {
    return;
  }

  const downloadedBytes = { value: 0 };
  const totalBytes: { value: number | null } = { value: null };
  setUpdateState({
    ...appUpdateState,
    phase: "downloading",
    progress: 0,
    error: null,
  });

  try {
    await pendingUpdate.downloadAndInstall((event) => {
      updateDownloadProgress(event, downloadedBytes, totalBytes);
    });
    setUpdateState({
      ...appUpdateState,
      phase: "installing",
      progress: 100,
      error: null,
    });
    await relaunch();
  } catch (error) {
    console.error("Update installation failed", error);
    setUpdateState({
      ...appUpdateState,
      phase: "error",
      progress: null,
      error: String(error),
    });
  }
}

async function refreshDashboard(): Promise<void> {
  if (isMenuBarView) {
    render(await invoke<Dashboard>("get_dashboard"));
    return;
  }

  const [data, launchAtLogin] = await Promise.all([
    invoke<Dashboard>("get_dashboard"),
    isAutostartEnabled(),
  ]);
  systemPreferences = { launchAtLogin };
  render(data);
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

async function toggleAutostart(): Promise<void> {
  try {
    if (systemPreferences.launchAtLogin) {
      await disableAutostart();
    } else {
      await enableAutostart();
    }
    systemPreferences = {
      launchAtLogin: await isAutostartEnabled(),
    };
    await refreshDashboard();
    showToast(
      systemPreferences.launchAtLogin
        ? "No Goals No Gain will launch when you sign in."
        : "Launch at login turned off.",
    );
  } catch (error) {
    showToast(String(error), "error");
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
    case "toggle-autostart":
      void toggleAutostart();
      break;
    case "install-update":
      void installAvailableUpdate();
      break;
    case "close-popover":
      void invoke("close_quick_panel");
      break;
    case "open-dashboard":
      void invoke("open_main_dashboard");
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
window.setInterval(() => {
  void checkForUpdates();
}, 6 * 60 * 60 * 1_000);

void listen("state-changed", () => {
  void refreshDashboard();
});

if (isMenuBarView) {
  let isPanelOpen = false;
  let openedAt = performance.now();

  void listen("quick-panel-opened", () => {
    isPanelOpen = true;
    openedAt = performance.now();
    void refreshDashboard();
  });

  window.addEventListener("blur", () => {
    window.setTimeout(() => {
      const hasSettledAfterOpening = performance.now() - openedAt > 350;
      if (isPanelOpen && hasSettledAfterOpening && !goalDialog?.open) {
        isPanelOpen = false;
        void invoke("close_quick_panel");
      }
    }, 80);
  });
}

if (appElement) {
  appElement.innerHTML = loadingMarkup();
}
void refreshDashboard()
  .then(() => checkForUpdates())
  .catch((error: unknown) => {
    showToast(String(error), "error");
  });
