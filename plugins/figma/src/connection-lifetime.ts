export function connectionLifetime(expiresAt: number, now = Date.now()) {
  const seconds = Math.max(0, Math.ceil((expiresAt - now) / 1000));
  return {
    seconds,
    soon: seconds <= 300,
    label: !seconds
      ? "Expired"
      : seconds >= 3600
        ? `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`
        : seconds >= 300
          ? `${Math.ceil(seconds / 60)}m`
          : `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`,
  };
}
