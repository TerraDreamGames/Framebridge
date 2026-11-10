# 3D display areas with ViewportFrame

Choose **ViewportFrame** for a Figma container that will display an inventory item, character or other 3D scene. Framebridge exports its layout, appearance and UI children. Add the model, camera and gameplay logic in Studio. It does not infer a model from 2D artwork. Roblox documents the native class and its properties in [ViewportFrame](https://create.roblox.com/docs/reference/engine/classes/ViewportFrame).

## Prepare in Figma

1. Analyze the design, select the container in Layers, and open **Export setup**.
2. Set **Render as → Editable UI**, then **Instance type → ViewportFrame**. For automatically baked artwork, switch to Editable UI first to expose container choices.
3. Configure Position, Size and optional constraints. The **3D lighting** section exposes Ambient light, Light color and Light direction. Direction starts collapsed and expands to one row of X, Y and Z fields. **3D appearance** controls rendered-image tint and transparency separately from the background.
4. Export for Studio, send through the connection, or download one of the four source-code formats. Vector artwork inside the container remains an image; text remains editable. Link/upload any required child artwork normally.

The Roblox preview displays a **3D scene · finish in Studio** placeholder and UI overlays. It does not render a 3D model or simulate lighting. The class uses a licensed SVG icon bundled in the plugin HTML for offline use.

## Finish in Studio

Use the matching updated Studio companion: older builds reject this new class. Import with your desired Source, Scale or Pixels sizing. Aspect and size constraints and native selection tools apply to ViewportFrame as they do to other GUI containers.

Add a Camera and, where appropriate, a WorldModel containing the desired 3D objects. Assign the viewport's CurrentCamera in client code for the running game. For example, after locating your imported viewport:

```luau
local camera = Instance.new("Camera")
camera.Name = "PreviewCamera"
camera.CFrame = CFrame.new(0, 0, 8)
camera.Parent = viewport
viewport.CurrentCamera = camera
-- Add your model and adjust the camera to fit it.
```

CurrentCamera is an instance reference owned by your game and is not encoded in the data-only transfer package. Generated source modules similarly leave camera/model setup to your code.

Reimporting the same source and layer identity updates managed UI properties while retaining the ViewportFrame instance, attached camera, WorldModel, custom scripts and event connections. Removing an owned lighting override resets that property to the native default. Changing an existing Frame to ViewportFrame requires **New copy**; deleting a viewport containing user-added scene content is blocked until that content is moved. These safeguards preserve custom work.
