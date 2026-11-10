# Native keyframe chains

Import [chains.framebridge.json](chains.framebridge.json) with the matching Studio plugin into a disposable place. Play: the mount chain repeats and returns, Hover / focus and Pressed respond to native buttons, Activate restarts its chain, and Toggle animated panel replays an entrance. Explorer and Properties show the real reservation Frames, UIScales, metadata and status attributes.

Optionally insert [DemoTriggers.client.luau](DemoTriggers.client.luau) as a separate LocalScript inside the imported ScreenGui. It gives the Selected example a local selection toggle and fires the Layer attribute example three times. These local values demonstrate triggers; your own application scripts should own game state.

See [KEYFRAME_MOTION.md](../../docs/KEYFRAME_MOTION.md) for recording, runtime APIs, bounds, source/model outputs and usage.
