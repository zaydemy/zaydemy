"use client";

import { useEffect, useRef } from "react";

export interface BotWidgetConfig {
  provider: "turnstile" | "hcaptcha";
  siteKey: string;
}

type Api = {
  render: (element: HTMLElement, options: Record<string, unknown>) => string | number;
  reset: (id?: string | number) => void;
  remove?: (id: string | number) => void;
};

const scripts = {
  turnstile: {
    src: "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit",
    global: "turnstile",
  },
  hcaptcha: { src: "https://js.hcaptcha.com/1/api.js?render=explicit", global: "hcaptcha" },
} as const;

function loadScript(provider: BotWidgetConfig["provider"]): Promise<Api> {
  const { src, global } = scripts[provider];
  const existing = (window as unknown as Record<string, Api | undefined>)[global];
  if (existing) return Promise.resolve(existing);
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.onload = () => {
      const api = (window as unknown as Record<string, Api | undefined>)[global];
      if (api) resolve(api);
      else reject(new Error(`${provider} did not load`));
    };
    script.onerror = () => reject(new Error(`${provider} did not load`));
    document.head.appendChild(script);
  });
}

/**
 * Bot-protection challenge (Turnstile or hCaptcha), rendered explicitly.
 * Tokens are single-use: bump `resetKey` after every server call so the next
 * attempt gets a fresh one.
 */
export function BotWidget({
  config,
  onToken,
  resetKey,
}: {
  config: BotWidgetConfig;
  onToken: (token: string | null) => void;
  resetKey: number;
}) {
  const container = useRef<HTMLDivElement>(null);
  const widget = useRef<{ api: Api; id: string | number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadScript(config.provider)
      .then((api) => {
        if (cancelled || !container.current) return;
        const id = api.render(container.current, {
          sitekey: config.siteKey,
          callback: (token: string) => onToken(token),
          "expired-callback": () => onToken(null),
          "error-callback": () => onToken(null),
        });
        widget.current = { api, id };
      })
      // If the provider cannot load, the server treats the check as skipped
      // only when it cannot reach the provider either; nothing to do here.
      .catch(() => onToken(null));
    return () => {
      cancelled = true;
      if (widget.current?.api.remove) widget.current.api.remove(widget.current.id);
      widget.current = null;
    };
  }, [config.provider, config.siteKey, onToken]);

  useEffect(() => {
    if (resetKey > 0 && widget.current) {
      widget.current.api.reset(widget.current.id);
      onToken(null);
    }
  }, [resetKey, onToken]);

  return <div ref={container} className="flex min-h-[65px] justify-center" />;
}
