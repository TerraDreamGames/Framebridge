import { useEffect, useState } from "react";
import { connectionLifetime } from "./connection-lifetime";

// Tick only this small component, rather than rerendering the layer tree every second.
export function ConnectionExpiry({
  expiresAt,
  detail = false,
  label = "Connection",
  calendar = false,
}: {
  expiresAt: number;
  detail?: boolean;
  label?: string;
  calendar?: boolean;
}) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [expiresAt]);
  const remaining = connectionLifetime(expiresAt, now);
  const long = calendar && remaining.seconds >= 86400;
  const duration = long
    ? `${Math.ceil(remaining.seconds / 86400)} days`
    : remaining.label;
  const time = long
    ? new Date(expiresAt).toLocaleDateString([], {
        month: "short",
        day: "numeric",
      })
    : new Date(expiresAt).toLocaleTimeString([], {
        hour: "numeric",
        minute: "2-digit",
      });
  return (
    <span
      className={`connection-expiry ${remaining.soon ? "expiring" : ""}`}
      title={`${label} expires at ${new Date(expiresAt).toLocaleString()}`}
      aria-label={`${label} ${remaining.seconds ? `expires in ${duration}, ${long ? "on" : "at"} ${time}` : "expired"}`}
    >
      {detail && remaining.seconds
        ? `Expires in ${duration} · ${time}`
        : duration}
    </span>
  );
}
