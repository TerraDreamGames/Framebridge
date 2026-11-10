# Generated runtime lifecycle

Version 11 imports and model downloads use a small generated `FramebridgeInteractions` LocalScript and its generated `FramebridgeRuntime` ModuleScript child. The child initializes the trusted runtime and owns its signals during `require()`. Transfer packages contain bounded configuration only; they cannot supply either script's source.

This addresses Roblox's deferred destruction behavior: connections initialized by the deleted LocalScript itself could be cancelled before its `Destroying` cleanup callback ran. Initializing the connections in a required module lets cleanup run when the bootstrap, initializer or UI root is destroyed. Cleanup is idempotent, restores owned properties when the application has not changed them, and disconnects further updates. Source exports continue to expose the existing explicit mount/destroy API.

Both generated scripts have reserved stable identities, source provenance and update guards. Reimport retains their instance identity, including migration from the prior inline version 9 LocalScript. An edited generated bootstrap or initializer blocks update/removal; application scripts and custom children remain protected.

Conditional rules reject properties also owned by base/hover themes and reject visibility controlled by advanced tooltips. Independent properties can coexist, such as conditional button availability with theme colors.
