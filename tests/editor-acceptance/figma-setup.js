// Run only in the approved native QA file. No Framebridge settings are preconfigured.
return await (async () => {
  const namespace = "FramebridgeEditorQA", key = "final-editor-checks-20261003";
  if (figma.currentPage.children.some(n => n.getSharedPluginData(namespace, "owner") === key))
    throw new Error("Inspect/clean the previous owned editor fixture first");
  await figma.loadFontAsync({ family: "Inter", style: "Regular" });
  const previous = figma.currentPage.selection.map(n => n.id);
  const viewport = { center: figma.viewport.center, zoom: figma.viewport.zoom };
  const created = [];
  const track = n => { created.push(n); return n; };
  let section;
  try {
    section = track(figma.createSection()); section.name = "Framebridge · Final editor QA";
    section.setSharedPluginData(namespace, "owner", key);
    section.setSharedPluginData(namespace, "previous", JSON.stringify({ selection: previous, viewport }));
    section.x = Math.max(0, ...figma.currentPage.children.filter(n => n !== section).map(n => n.x + n.width)) + 100;
    section.y = 0; section.resizeWithoutConstraints(1060, 820);
    const screen = track(figma.createFrame()); screen.name = "Final editor QA"; screen.resize(960, 720);
    screen.x = 40; screen.y = 60; screen.fills = [{ type: "SOLID", color: { r: .06, g: .08, b: .12 } }];
    section.appendChild(screen);
    const text = (parent, name, characters, x, y, width = 140, height = 24) => {
      const t = track(figma.createText()); t.name = name; t.fontName = { family: "Inter", style: "Regular" };
      t.fontSize = 16; t.characters = characters; t.resize(width, height); t.x = x; t.y = y;
      t.fills = [{ type: "SOLID", color: { r: 1, g: 1, b: 1 } }]; parent.appendChild(t); return t;
    };
    const states = ["Default", "Hover", "Pressed", "Disabled", "Selected"];
    const colors = [[.12,.28,.5],[.2,.55,.85],[.08,.18,.35],[.2,.2,.23],[.12,.65,.38]];
    const variants = states.map((state, i) => {
      const c = track(figma.createComponent()); c.name = `State=${state}`; c.resize(160, 48);
      c.fills = [{ type: "SOLID", color: { r: colors[i][0], g: colors[i][1], b: colors[i][2] } }];
      screen.appendChild(c); c.x = 180 * i; c.y = 0;
      text(c, "Caption", "Purchase", 10, 12, 140, 24); return c;
    });
    const family = track(figma.combineAsVariants(variants, screen)); family.name = "QA Button family"; family.x = 20; family.y = 20;
    const image = figma.createImage(new Uint8Array(/* SOURCE_PNG */ []));
    const slice = track(figma.createRectangle()); slice.name = "QA Slice artwork"; slice.resize(64, 64); slice.x = 20; slice.y = 120;
    slice.fills = [{ type: "IMAGE", imageHash: image.hash, scaleMode: "STRETCH" }]; screen.appendChild(slice);
    const vertical = track(figma.createFrame()); vertical.name = "QA Vertical viewport"; vertical.resize(240, 180); vertical.x = 220; vertical.y = 120;
    vertical.clipsContent = true; vertical.fills = [{ type: "SOLID", color: { r: .1, g: .14, b: .2 } }]; screen.appendChild(vertical);
    for (let i = 0; i < 6; i++) text(vertical, `Vertical row ${i+1}`, `Vertical row ${i+1}`, 8, 8 + 52*i, 210, 44);
    const vArt = track(figma.createRectangle()); vArt.name = "QA Vertical ScrollBar"; vArt.resize(12, 100); vArt.x = 470; vArt.y = 125;
    vArt.cornerRadius = 5; vArt.fills = [{ type: "SOLID", color: { r: .25, g: .7, b: .9 } }]; screen.appendChild(vArt);
    const horizontal = track(figma.createFrame()); horizontal.name = "QA Horizontal viewport"; horizontal.resize(320, 100); horizontal.x = 530; horizontal.y = 120;
    horizontal.clipsContent = true; horizontal.fills = [{ type: "SOLID", color: { r: .1, g: .14, b: .2 } }]; screen.appendChild(horizontal);
    for (let i = 0; i < 5; i++) text(horizontal, `Horizontal card ${i+1}`, `Reward ${i+1}`, 8 + 132*i, 8, 120, 60);
    const hArt = track(figma.createRectangle()); hArt.name = "QA Horizontal ScrollBar"; hArt.resize(140, 12); hArt.x = 535; hArt.y = 235;
    hArt.cornerRadius = 5; hArt.fills = [{ type: "SOLID", color: { r: .8, g: .4, b: .85 } }]; screen.appendChild(hArt);
    const label = text(screen, "QA Property and conditional label", "Editor acceptance", 20, 360, 300, 42);
    const button = track(figma.createFrame()); button.name = "QA Motion button"; button.resize(180, 56); button.x = 20; button.y = 440;
    button.fills = [{ type: "SOLID", color: { r: .15, g: .35, b: .55 } }]; screen.appendChild(button); text(button, "Caption", "Motion button", 12, 16, 156, 24);
    const ids = { section: section.id, screen: screen.id, family: family.id, variants: variants.map(n => n.id), slice: slice.id,
      vertical: vertical.id, verticalArtwork: vArt.id, horizontal: horizontal.id, horizontalArtwork: hArt.id, label: label.id, motion: button.id };
    section.setSharedPluginData(namespace, "ids", JSON.stringify(ids));
    figma.currentPage.selection = [screen]; figma.viewport.scrollAndZoomIntoView([section]);
    return { preparedSourceOnly: true, ids, states, sliceTexture: [64,64], imageHash: image.hash, sourceSettingsPreconfigured: false };
  } catch (error) {
    for (const n of created.reverse()) if (!n.removed) n.remove();
    const restored = [];
    for (const id of previous) { const n = await figma.getNodeByIdAsync(id); if (n && "visible" in n) restored.push(n); }
    figma.currentPage.selection = restored; figma.viewport.center = viewport.center; figma.viewport.zoom = viewport.zoom;
    throw error;
  }
})();
