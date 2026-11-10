import {
  createContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { isHostMessage } from "./bridge";
import {
  PLUGIN_APPEARANCE_KEY,
  readPluginTheme,
  type PluginTheme,
} from "./plugin-appearance";

export const PluginThemeContext = createContext<PluginTheme>("light");
let sequence = 0;

export function initialPluginTheme(): PluginTheme {
  if (import.meta.env.DEV) {
    try {
      return (
        readPluginTheme(localStorage.getItem(PLUGIN_APPEARANCE_KEY)) ?? "light"
      );
    } catch {
      /* Keep appearance usable when local storage is unavailable. */
    }
  }
  return "light";
}

export function applyPluginTheme(theme: PluginTheme) {
  document.documentElement.dataset.pluginTheme = theme;
  document.documentElement.classList.toggle("dark", theme === "dark");
  document.documentElement.classList.toggle("light", theme === "light");
}

export function usePluginTheme() {
  const [theme, setTheme] = useState(initialPluginTheme);
  const [error, setError] = useState("");
  const touched = useRef(false);
  const lastSave = useRef(0);

  useLayoutEffect(() => applyPluginTheme(theme), [theme]);

  useEffect(() => {
    if (import.meta.env.DEV) return;
    const revision = ++sequence;
    const receive = (event: MessageEvent) => {
      if (!isHostMessage(event.source, parent, top)) return;
      const message = event.data?.pluginMessage;
      if (
        message?.type === "plugin-appearance" &&
        message.revision === revision
      ) {
        const saved = readPluginTheme(message.theme);
        if (saved && !touched.current) setTheme(saved);
      }
      if (
        message?.type === "plugin-appearance-saved" &&
        message.revision === lastSave.current
      )
        setError("");
      if (
        message?.type === "plugin-appearance-error" &&
        ((message.action === "load" &&
          message.revision === revision &&
          !touched.current) ||
          (message.action === "save" && message.revision === lastSave.current))
      )
        setError(
          message.action === "save"
            ? "The theme changed for this session, but could not be saved. Choose it again to retry."
            : "Your saved theme could not be restored. You can choose a theme below.",
        );
    };
    window.addEventListener("message", receive);
    parent.postMessage(
      { pluginMessage: { type: "load-plugin-appearance", revision } },
      "*",
    );
    return () => window.removeEventListener("message", receive);
  }, []);

  const choose = (value: string) => {
    const next = readPluginTheme(value);
    if (!next) return;
    touched.current = true;
    setTheme(next);
    setError("");
    if (import.meta.env.DEV) {
      try {
        localStorage.setItem(PLUGIN_APPEARANCE_KEY, next);
      } catch {
        setError("The theme changed for this session, but could not be saved.");
      }
    } else {
      const revision = ++sequence;
      lastSave.current = revision;
      parent.postMessage(
        {
          pluginMessage: {
            type: "save-plugin-appearance",
            theme: next,
            revision,
          },
        },
        "*",
      );
    }
  };
  return { theme, choose, error };
}
