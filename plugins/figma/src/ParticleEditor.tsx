import { Disclosure, DisclosureSummary } from "./components/Disclosure";
import { cloneSettings } from "../../../packages/core/src/clone-settings";
import {
  PARTICLE_DEFAULTS,
  validParticles,
  type ParticleSettings,
} from "../../../packages/core/src/particles";
import { Input } from "./components/ui/input";
import { Switch } from "./components/ui/switch";
import { SelectControl } from "./components/SelectControl";
import { Button } from "./components/ui/button";
export function ParticleEditor({
  value,
  onChange,
  onError,
}: {
  value?: ParticleSettings;
  onChange: (value?: ParticleSettings) => void;
  onError: (message: string) => void;
}) {
  const patch = (change: Partial<ParticleSettings>) => {
    const next = { ...value, ...change };
    if (validParticles(next)) {
      onChange(next);
      onError("");
      return true;
    }
    onError(
      "Check particle ranges, capacity, texture and dependency names. This edit was not saved.",
    );
    return false;
  };
  const scalar = (
    key:
      "count" | "rate" | "capacity" | "direction" | "spread" | "drag" | "seed",
    label: string,
  ) => (
    <div className="property-row" key={key}>
      <label htmlFor={`particle-${key}`}>{label}</label>
      <Input
        id={`particle-${key}`}
        type="number"
        step="any"
        defaultValue={value![key]}
        key={value![key]}
        onBlur={(e) => {
          if (
            !patch({
              [key]: e.target.value.trim() ? Number(e.target.value) : NaN,
            })
          )
            e.target.value = String(value![key]);
        }}
      />
    </div>
  );
  const pair = (
    key: "lifetime" | "speed" | "size" | "rotationSpeed" | "acceleration",
    label: string,
  ) => (
    <div className="property-row" key={key}>
      <label>{label}</label>
      <div className="property-number">
        {value![key].map((n, i) => (
          <Input
            type="number"
            step="any"
            key={`${key}:${i}:${n}`}
            aria-label={`${label} ${key === "acceleration" ? (i === 0 ? "X" : "Y") : i === 0 ? "minimum" : "maximum"}`}
            defaultValue={n}
            onBlur={(e) => {
              const next = [...value![key]] as [number, number];
              next[i] = e.target.value.trim() ? Number(e.target.value) : NaN;
              if (!patch({ [key]: next })) e.target.value = String(n);
            }}
          />
        ))}
      </div>
    </div>
  );
  const external = value?.engine === "dogwarrior24-template-v1";
  return (
    <Disclosure className="export-setup particle-setup editor-section">
      <DisclosureSummary>
        <span>Particles</span>
        <span className="export-setup-summary">
          {value?.kind ?? "Optional"}
        </span>
      </DisclosureSummary>
      <div className="property-row">
        <label htmlFor="particle-kind">Effect</label>
        <SelectControl
          id="particle-kind"
          value={!value ? "none" : external ? "external" : value.kind}
          onChange={(e) => {
            if (e.target.value === "none") {
              onChange(undefined);
              onError("");
              return;
            }
            const next = cloneSettings(PARTICLE_DEFAULTS);
            if (e.target.value !== "confetti") {
              next.kind = "emitter2d";
              next.trigger = "mount";
              next.rate = 8;
              next.colors = [[1, 0.8, 0.2]];
            }
            if (e.target.value === "external") {
              next.engine = "dogwarrior24-template-v1";
              next.texture = "rbxassetid://123456789";
              next.acceleration = [0, 0];
              next.dependency = {
                template: "ReviewedEmitter",
                configVersion: "1",
                clientRevision: "reviewed-v1",
              };
            }
            onChange(next);
            onError("");
          }}
        >
          <option value="none">None</option>
          <option value="confetti">Confetti · built in</option>
          <option value="emitter2d">2D emitter · built in</option>
          <option value="external">Emitter2D · installed template</option>
        </SelectControl>
      </div>
      {value && (
        <>
          <p className="property-note">
            Up to 128 particles per emitter, 512 per root. Test UI shows an
            approximation.
          </p>
          <div className="property-row">
            <label htmlFor="particle-trigger">Burst trigger</label>
            <SelectControl
              id="particle-trigger"
              value={value.trigger}
              onChange={(e) =>
                patch({
                  trigger: e.target.value as ParticleSettings["trigger"],
                })
              }
            >
              <option value="manual">Application attribute</option>
              <option value="mount">When visible after mount</option>
              <option value="activate">Button Activated</option>
            </SelectControl>
          </div>
          {(["enabled", "clip", "respectReducedMotion"] as const).map((key) => (
            <div className="property-row" key={key}>
              <label htmlFor={`particle-${key}`}>
                {
                  {
                    enabled: "Enabled",
                    clip: "Clip to layer",
                    respectReducedMotion: "Respect reduced motion",
                  }[key]
                }
              </label>
              <Switch
                id={`particle-${key}`}
                checked={value[key]}
                onCheckedChange={(v) => patch({ [key]: v })}
              />
            </div>
          ))}
          {scalar("count", "Particles per burst")}
          {scalar("capacity", "Emitter capacity")}
          {scalar("rate", "Particles per second")}
          {pair("lifetime", "Lifetime seconds")}
          {pair("size", "Size pixels")}
          {pair("speed", "Speed pixels/second")}
          {scalar("direction", "Direction degrees")}
          {scalar("spread", "Spread degrees")}
          {pair("rotationSpeed", "Rotation degrees/second")}
          {!external && (
            <>
              {pair("acceleration", "Acceleration X/Y")}
              {scalar("drag", "Drag")}
            </>
          )}
          <div className="property-row">
            <label htmlFor="particle-shape">Spawn area</label>
            <SelectControl
              id="particle-shape"
              value={value.shape}
              onChange={(e) =>
                patch({ shape: e.target.value as ParticleSettings["shape"] })
              }
            >
              <option value="point">Center point</option>
              <option value="rectangle">Layer rectangle</option>
            </SelectControl>
          </div>
          <div className="property-row">
            <label htmlFor="particle-texture">Texture Roblox ID</label>
            <Input
              id="particle-texture"
              defaultValue={value.texture}
              key={value.texture}
              placeholder={
                external ? "Required owned texture" : "Optional · native shapes"
              }
              onBlur={(e) => {
                const raw = e.target.value.trim(),
                  texture = /^[1-9]\d*$/.test(raw)
                    ? `rbxassetid://${raw}`
                    : raw;
                if (!patch({ texture })) e.target.value = value.texture;
              }}
            />
          </div>
          <div className="property-row">
            <label>Particle colors</label>
            <div className="property-number">
              {value.colors.map((rgb, i) => (
                <Input
                  type="color"
                  aria-label={`Particle color ${i + 1}`}
                  key={i}
                  value={
                    "#" +
                    rgb
                      .map((v) =>
                        Math.round(v * 255)
                          .toString(16)
                          .padStart(2, "0"),
                      )
                      .join("")
                  }
                  onChange={(e) =>
                    patch({
                      colors: value.colors.map((c, j) =>
                        j === i
                          ? ([1, 3, 5].map(
                              (k) =>
                                parseInt(e.target.value.slice(k, k + 2), 16) /
                                255,
                            ) as [number, number, number])
                          : c,
                      ),
                    })
                  }
                />
              ))}
            </div>
          </div>
          <div className="property-row">
            <Button
              variant="outline"
              disabled={value.colors.length >= 8}
              onClick={() => patch({ colors: [...value.colors, [1, 1, 1]] })}
            >
              Add color
            </Button>
            <Button
              variant="ghost"
              disabled={value.colors.length <= 1}
              onClick={() => patch({ colors: value.colors.slice(0, -1) })}
            >
              Remove last color
            </Button>
          </div>
          {!external && scalar("seed", "Random seed")}
          {external && (
            <Disclosure className="export-setup" open>
              <DisclosureSummary>Installed engine dependency</DisclosureSummary>
              <p className="property-note">
                Install the official Emitter2D client in your game, review its
                revision, and place its script-free template inside
                ReplicatedStorage.FramebridgeParticleTemplates. Copy its exact
                Version and your reviewed client revision. Framebridge reports
                missing/mismatched dependencies and never downloads engine
                scripts. Acceleration, drag and seeds belong to the reviewed
                template.
              </p>
              {(["template", "configVersion", "clientRevision"] as const).map(
                (key) => (
                  <div className="property-row" key={key}>
                    <label htmlFor={`particle-${key}`}>
                      {
                        {
                          template: "Template folder",
                          configVersion: "Template Version",
                          clientRevision: "Reviewed client revision",
                        }[key]
                      }
                    </label>
                    <Input
                      id={`particle-${key}`}
                      defaultValue={value.dependency![key]}
                      key={value.dependency![key]}
                      onBlur={(e) => {
                        if (
                          !patch({
                            dependency: {
                              ...value.dependency!,
                              [key]: e.target.value.trim(),
                            },
                          })
                        )
                          e.target.value = value.dependency![key];
                      }}
                    />
                  </div>
                ),
              )}
            </Disclosure>
          )}
        </>
      )}
    </Disclosure>
  );
}
