# Third-party notices

Framebridge's original code, documentation and branding are available under the [MIT license](LICENSE). Third-party material retains its own copyright and license:

| Material                                                                 | License                                                        | Full notices                                                                                               |
| ------------------------------------------------------------------------ | -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| JavaScript runtime dependencies, including React, Radix and image codecs | MIT, ISC and other permissive licenses as recorded per package | [Dependency notices](docs/licenses/JavaScript-dependencies.txt)                                            |
| React Lua 17.2.1, bundled in the Studio plugin                           | MIT, with retained upstream MIT and Apache-2.0 portions        | [React Lua](docs/licenses/React-Lua.txt), [runtime dependencies](docs/licenses/React-Lua-dependencies.txt) |
| Google Sans variable font                                                | SIL Open Font License 1.1                                      | [Google Sans](docs/licenses/GoogleSans.txt)                                                                |
| Inter variable font                                                      | SIL Open Font License 1.1                                      | [Inter](docs/licenses/Inter.txt)                                                                           |
| Studio component design adaptations from Codify                          | MIT                                                            | [Codify](docs/licenses/Codify.txt)                                                                         |
| PNG codecs                                                               | MIT                                                            | [PNG codecs](docs/licenses/PNG-codecs.txt)                                                                 |

Class and interface glyphs are original Framebridge SVG artwork covered by the project's MIT license. Studio disclosure controls draw the same original glyphs using native UI shapes. The current source and installable plugins do not contain icons extracted from Roblox Studio. Figma and Roblox names identify compatibility; their trademarks are not licensed by Framebridge's MIT license and do not imply endorsement.

`npm run licenses:update` regenerates JavaScript notices from the installed, locked production dependencies. `npm run licenses:check` verifies that the checked-in notices match. A version-pinned upstream notice supplies the license omitted from the published `react-remove-scroll-bar` package. Its source is recorded in the generated notices.

Required notices also ship in the plugin ZIP and are embedded in the standalone Figma and Studio artifacts. Generated Framebridge interaction runtimes carry the project's MIT notice; that notice applies to the runtime, not the user's design or artwork. Build tools and their dependencies remain under their respective licenses; they are not bundled in the plugins. If you redistribute `node_modules`, native build tools or a development container, include those tools' licenses too. Keep all applicable notices when distributing modified plugins.
