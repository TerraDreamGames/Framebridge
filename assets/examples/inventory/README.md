# Inventory artwork

Transparent PNG resources used by the editable InventoryUI example. Drag these files into Figma or reuse them in your own UI. Layout, text and controls remain editable; illustrations and component skins are separate image layers.

| Equipment | Consumables | Crystals | Materials |
| --- | --- | --- | --- |
| [Wayfinder sword](wayfinder-sword.png) | [Health potion](health-potion.png) | [Azure](azure-crystal.png) | [Oak logs](oak-wood.png) |
| [Trail dagger](trail-dagger.png) | [Energy potion](energy-potion.png) | [Amethyst](amethyst-crystal.png) | [Gold coins](gold-coins.png) |
| [Iron shield](iron-shield.png) | [Mana potion](mana-potion.png) | [Ruby](ruby-crystal.png) | |
| | | [Emerald](emerald-crystal.png) | |

Item masters are 1254×1254 RGBA PNGs with actual transparency. The browser demo caches smaller textures for fast previews and prepares its exported PNGs at the selected image scale. No image is uploaded to Roblox automatically.

The inventory header uses [inventory-backpack.png](inventory-backpack.png), with its exact generation prompt in [backpack-generation.json](backpack-generation.json).

## Interface components

These generated skins are separate image layers beneath native, editable controls and text. Their original PNG canvases and alpha are preserved; the browser normalizes transparent outer margins when preparing a component texture.

| Component | Resource |
| --- | --- |
| Window background with header and footer | [window-skin.png](window-skin.png) |
| Inset detail panel | [inset-panel.png](inset-panel.png) |
| Item slot | [slot-idle.png](slot-idle.png) |
| Selected item slot | [slot-selected.png](slot-selected.png) |
| Close button | [close-button.png](close-button.png) |
| Category button | [category-idle.png](category-idle.png) |
| Active category | [category-active.png](category-active.png) |
| Primary action button | [primary-button.png](primary-button.png) |
| Capacity counter pill | [capacity-pill.png](capacity-pill.png) |

The interface asset prompts are recorded in [interface-generation.json](interface-generation.json). Source and Roblox previews use the same artwork. Grid/list layouts, labels, item buttons, Equip and Close remain independent native instances.

Created with the built-in image generator. The exact generation and edit prompts are in [generation.json](generation.json). See the project [asset license](../../LICENSE).
