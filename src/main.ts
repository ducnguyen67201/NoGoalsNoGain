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
  AssistantProvider,
  Dashboard,
  GoalInput,
  GoalPeriod,
  ReviewInput,
  SystemPreferences,
  ThoughtComposerState,
  ThoughtDumpInput,
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

interface SpeechRecognitionAlternativeLike {
  transcript: string;
}

interface SpeechRecognitionResultLike {
  readonly isFinal: boolean;
  readonly length: number;
  readonly [index: number]: SpeechRecognitionAlternativeLike;
}

interface SpeechRecognitionResultListLike {
  readonly length: number;
  readonly [index: number]: SpeechRecognitionResultLike;
}

interface SpeechRecognitionEventLike extends Event {
  readonly results: SpeechRecognitionResultListLike;
}

interface SpeechRecognitionErrorEventLike extends Event {
  readonly error: string;
}

interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onstart: (() => void) | null;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

function speechRecognitionConstructor(): SpeechRecognitionConstructor | null {
  const speechWindow = window as typeof window & {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return (
    speechWindow.SpeechRecognition ??
    speechWindow.webkitSpeechRecognition ??
    null
  );
}

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
let thoughtComposer: ThoughtComposerState = {
  isOpen: false,
  draft: "",
  isListening: false,
  speechSupported: speechRecognitionConstructor() !== null,
  message: null,
};
let speechRecognition: SpeechRecognitionLike | null = null;
let thoughtSpeechWasUsed = false;

function render(data: Dashboard): void {
  if (!appElement) {
    return;
  }
  latestDashboard = data;
  appElement.innerHTML = isMenuBarView
    ? renderMenuBarPopover(data, appUpdateState, thoughtComposer)
    : renderDashboard(data, systemPreferences, appUpdateState);

  if (isMenuBarView) {
    const activeGoalCount = data.goals.filter(
      (goal) => goal.status === "active" && goal.periodEnd > data.now,
    ).length;
    const basePanelHeight =
      activeGoalCount === 0
        ? 430
        : Math.min(500, 370 + Math.max(0, activeGoalCount - 1) * 52);
    const showsUpdatePrompt = [
      "available",
      "downloading",
      "installing",
      "error",
    ].includes(appUpdateState.phase);
    const momentumHeight = data.stats.dailyProgress.length > 0 ? 122 : 0;
    const panelHeight = Math.min(
      640,
      basePanelHeight + momentumHeight + (showsUpdatePrompt ? 66 : 0),
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

function focusThoughtInput(): void {
  window.setTimeout(() => {
    const input = document.querySelector<HTMLTextAreaElement>(
      "#quick-thought-input",
    );
    input?.focus();
    input?.setSelectionRange(input.value.length, input.value.length);
  }, 30);
}

function stopSpeechCapture(): void {
  const recognition = speechRecognition;
  speechRecognition = null;
  if (recognition) {
    recognition.onend = null;
    try {
      recognition.stop();
    } catch {
      // A rapid second click can arrive before WebKit finishes starting.
    }
  }
  thoughtComposer = { ...thoughtComposer, isListening: false };
}

function openThoughtComposer(): void {
  thoughtComposer = {
    ...thoughtComposer,
    isOpen: true,
    message: null,
  };
  if (latestDashboard) {
    render(latestDashboard);
  }
  focusThoughtInput();
}

function closeThoughtComposer(): void {
  stopSpeechCapture();
  thoughtComposer = {
    ...thoughtComposer,
    isOpen: false,
    message: null,
  };
  if (latestDashboard) {
    render(latestDashboard);
  }
}

function speechErrorMessage(error: string): string {
  if (error === "not-allowed" || error === "service-not-allowed") {
    return "Microphone access was not granted. Press Fn twice to use Mac Dictation.";
  }
  if (error === "no-speech") {
    return "I didn’t hear anything. Tap the mic to try again.";
  }
  return "Speech capture paused. You can still press Fn twice for Mac Dictation.";
}

function toggleThoughtSpeech(): void {
  if (thoughtComposer.isListening) {
    stopSpeechCapture();
    thoughtComposer = {
      ...thoughtComposer,
      message: "Speech added. Keep typing or save when it feels complete.",
    };
    if (latestDashboard) {
      render(latestDashboard);
    }
    focusThoughtInput();
    return;
  }

  const Recognition = speechRecognitionConstructor();
  if (!Recognition) {
    thoughtComposer = {
      ...thoughtComposer,
      message: "Field ready—press Fn twice and speak with Mac Dictation.",
    };
    if (latestDashboard) {
      render(latestDashboard);
    }
    focusThoughtInput();
    return;
  }

  const startingDraft = thoughtComposer.draft.trimEnd();
  const recognition = new Recognition();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = navigator.language || "en-US";
  recognition.onstart = () => {
    thoughtComposer = {
      ...thoughtComposer,
      isListening: true,
      message: null,
    };
    if (latestDashboard) {
      render(latestDashboard);
    }
  };
  recognition.onresult = (event) => {
    let transcript = "";
    for (let index = 0; index < event.results.length; index += 1) {
      transcript += event.results[index]?.[0]?.transcript ?? "";
    }
    const spokenText = transcript.trim();
    thoughtComposer.draft = [startingDraft, spokenText]
      .filter(Boolean)
      .join(startingDraft ? " " : "");
    thoughtSpeechWasUsed ||= spokenText.length > 0;
    const input = document.querySelector<HTMLTextAreaElement>(
      "#quick-thought-input",
    );
    if (input) {
      input.value = thoughtComposer.draft;
    }
  };
  recognition.onerror = (event) => {
    speechRecognition = null;
    thoughtComposer = {
      ...thoughtComposer,
      isListening: false,
      message: speechErrorMessage(event.error),
    };
    if (latestDashboard) {
      render(latestDashboard);
    }
    focusThoughtInput();
  };
  recognition.onend = () => {
    if (speechRecognition !== recognition) {
      return;
    }
    speechRecognition = null;
    thoughtComposer = {
      ...thoughtComposer,
      isListening: false,
      message: thoughtSpeechWasUsed
        ? "Speech added. Keep typing or save when it feels complete."
        : thoughtComposer.message,
    };
    if (latestDashboard) {
      render(latestDashboard);
    }
    focusThoughtInput();
  };

  speechRecognition = recognition;
  thoughtComposer = {
    ...thoughtComposer,
    isListening: true,
    message: null,
  };
  if (latestDashboard) {
    render(latestDashboard);
  }

  try {
    recognition.start();
  } catch (error) {
    speechRecognition = null;
    thoughtComposer = {
      ...thoughtComposer,
      isListening: false,
      message: speechErrorMessage(String(error)),
    };
    if (latestDashboard) {
      render(latestDashboard);
    }
    focusThoughtInput();
  }
}

async function saveThought(
  provider?: AssistantProvider,
): Promise<void> {
  const content = thoughtComposer.draft.trim();
  if (!content) {
    showToast("Write or dictate a thought first.", "error");
    focusThoughtInput();
    return;
  }

  stopSpeechCapture();
  const input: ThoughtDumpInput = {
    content,
    source: thoughtSpeechWasUsed ? "speech" : "typed",
  };

  let savedDashboard: Dashboard;
  try {
    savedDashboard = await invoke<Dashboard>("save_thought_dump", { input });
  } catch (error) {
    showToast(String(error), "error");
    return;
  }

  thoughtComposer = {
    ...thoughtComposer,
    isOpen: false,
    draft: "",
    isListening: false,
    message: null,
  };
  thoughtSpeechWasUsed = false;
  render(savedDashboard);

  if (!provider) {
    showToast("Thought saved on this Mac.");
    return;
  }

  try {
    await invoke("open_in_assistant", { provider, content });
    showToast(`Saved and opened in ${provider === "codex" ? "Codex" : "Claude"}.`);
  } catch (error) {
    showToast(`Thought saved, but the assistant could not open: ${String(error)}`, "error");
  }
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
    case "open-thought":
      openThoughtComposer();
      break;
    case "close-thought":
      closeThoughtComposer();
      break;
    case "toggle-thought-speech":
      toggleThoughtSpeech();
      break;
    case "save-thought":
      void saveThought();
      break;
    case "send-thought": {
      const provider = actionElement.dataset.provider as
        | AssistantProvider
        | undefined;
      if (provider === "codex" || provider === "claude") {
        void saveThought(provider);
      }
      break;
    }
    case "load-thought": {
      const thoughtId = actionElement.dataset.thoughtId;
      const thought = latestDashboard?.thoughtDumps.find(
        (item) => item.id === thoughtId,
      );
      if (thought) {
        thoughtSpeechWasUsed = thought.source === "speech";
        thoughtComposer = {
          ...thoughtComposer,
          draft: thought.content,
          message: "Loaded. Add context or hand it to an assistant.",
        };
        render(latestDashboard!);
        focusThoughtInput();
      }
      break;
    }
    case "delete-thought": {
      const thoughtId = actionElement.dataset.thoughtId;
      if (thoughtId) {
        void runCommand(
          "delete_thought_dump",
          { thoughtId },
          "Thought deleted.",
        );
      }
      break;
    }
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

document.addEventListener("input", (event) => {
  const target = event.target;
  if (
    target instanceof HTMLTextAreaElement &&
    target.matches("[data-thought-draft]")
  ) {
    thoughtComposer.draft = target.value;
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
      if (
        isPanelOpen &&
        hasSettledAfterOpening &&
        !goalDialog?.open &&
        !thoughtComposer.isOpen &&
        !thoughtComposer.isListening
      ) {
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
