# Optional UI particle example

Import `particles.framebridge.json` with a matching Framebridge Studio build. Play the UI under PlayerGui. Click Celebrate for built-in confetti; Ambient emits built-in 2D particles. Both work without external packages or texture assets. The third container deliberately reports a missing Emitter2D dependency: its placeholder texture and reviewed-client label must be replaced before using that optional engine.

The generated runtime stays separate from your application script. Attach `DemoParticles.client.luau` under the exported root to enable explicit application bursts, cancellation and retry. See [UI_PARTICLES.md](../../docs/UI_PARTICLES.md) for controls, limits, dependency setup and limitations.
