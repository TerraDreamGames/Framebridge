# Prepare image artwork

Select an image layer in **Layers**, then expand **Properties → Framebridge tools → Image preparation**. **Clean transparent edges** is on by default; **Tintable white mask** starts off. Either choice is saved with that layer in the Figma document. A layer inside a baked image is configured through its baked parent. Choosing preparation does not force a native layer to become an image; its settings are retained if you switch render strategies. Generated background/effect images expose edge cleanup on their editable owner, and scrollbar images use their artwork layer's choice.

## Tintable white mask

Enable **Tintable white mask** for artwork that should take one color in Roblox, such as a monochrome icon. It sets RGB samples to white and preserves every alpha sample, including partially transparent antialiased edges. It removes all original colors, rather than converting them to different shades of gray. Use **Image tint** to choose the color, or change the imported ImageLabel/ImageButton's `ImageColor3` in Studio. See [Roblox ImageLabel](https://create.roblox.com/docs/reference/engine/classes/ImageLabel#ImageColor3).

Bounds and pixel dimensions do not change. The Roblox preview uses the prepared alpha mask and configured image tint. It remains an approximation: Roblox texture loading, sampling, fonts and Slice/Tile behavior require native review.

## Clean transparent edges

**Clean transparent edges** runs automatically on new image exports. Turn it off per layer to disable alpha bleeding. Explicit Off choices survive plugin reopen and later exports, including when white-mask settings change. Every fully transparent pixel receives the RGB color of its nearest nonzero-alpha pixel by Euclidean distance, including transparent holes, corners and wide margins. The tool leaves visible colors and every alpha sample unchanged, and does not resize, sharpen or crop the artwork. It can reduce sampling fringes; it cannot guarantee the appearance of every Roblox scale/filter setting. A fully transparent image has no visible color to extend and stays unchanged.

Transparent-edge cleanup uses a linear-time squared-distance transform. Monochrome icons use a direct fill; opaque, fully transparent and already-clean artwork avoid re-encoding. Processing runs inside the plugin, without an external executable or additional service. `:bleed-v2` artwork identities prevent a previous two-pixel-cleaned upload from satisfying the new variant.

With both settings on, the white mask already makes every RGB sample white, so separate color extension has no additional effect.

## Upload and update

Changing preparation clears that layer's explicit **Image asset** override. Each preparation variant has a versioned artwork identity, so an uploaded raw image cannot silently satisfy a mask or cleaned variant. Upload the prepared image through **Images** or **Send to Studio**, or link the matching prepared image manually. Returning to an earlier variant can reuse its previous matching binding when available. Layer identity remains stable: a normal reimport updates the image/tint on the existing UI instance and preserves user scripts.

The controller caches the raw Figma PNG and prepared variants inside the existing bounded render cache. Toggling preparation or changing image tint reuses unchanged source renders. Source verification and cancellation rules still govern cache commits. Connected transfers upload prepared PNGs; offline Studio and all four source-code ZIPs contain those same bytes and preparation metadata.

Pixel preparation runs locally in one background browser worker. It processes one PNG at a time to bound CPU and memory on weaker machines while keeping preparation off the UI thread. Its code is embedded in `ui.html`; testers still install only the usual three Figma files and need no Node.js or server. If a host blocks workers, the same lossless processor falls back to yielding between browser jobs. Legacy/headless clients retain the in-sandbox processor. Cancellation terminates active worker processing, removes cancelled queued jobs and rejects late replies; failed work never publishes or enters the render cache. Cleanup stays on by default and uses the same transparent-edge cleanup algorithm.

The common non-interlaced RGBA8 path reuses the bounded validation inflate instead of decompressing twice, then uses bulk scanline encoding with lossless Up prediction and fast compression. Other formats retain the precision/palette/Adam7 path. Native base64 transport avoids serializing individual pixel bytes between contexts; unchanged PNGs need no return payload. Equivalent references share one preparation job per PNG/options/slice variant.

Changing a layer's render type no longer invalidates every other image. Only omitted descendants within that rendered subtree affect its cache context; own-fill renders ignore child omissions. Raw/prepared pairs can retain 1,000 references, with the same 64 MiB buffer budget and bounded entry count. Shared immutable PNG buffers count once toward memory and reuse their pooled byte array. Source changes, scale changes, relevant skipped descendants and consumed scrollbar artwork still invalidate affected renders.
