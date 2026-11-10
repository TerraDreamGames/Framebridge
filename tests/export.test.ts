import { expect, it } from "vitest";
import { unzipSync, strFromU8 } from "fflate";
import { buildExport } from "../packages/core/src/export";
import { demoResult } from "../packages/core/src/demo";
it("roundtrips a native-only package as UTF-8 JSON", () => {
  const result = demoResult();
  const file = buildExport(result);
  expect(file.name).toBe("InventoryUI.framebridge.json");
  expect(JSON.parse(strFromU8(file.data))).toEqual(result.package);
});
it("includes the package, image bytes, instructions, and report in a ZIP", () => {
  const result = demoResult();
  result.package.assets = [
    {
      id: "image:1",
      nodeId: "1",
      name: "Art",
      filename: "Art_1.png",
      width: 10,
      height: 10,
      scale: 2,
      reason: "Vector",
    },
  ];
  result.assets["image:1"] = [137, 80, 78, 71];
  const file = buildExport(result);
  const zip = unzipSync(file.data);
  expect(zip["images/Art_1.png"]).toEqual(new Uint8Array([137, 80, 78, 71]));
  expect(JSON.parse(strFromU8(zip["InventoryUI.framebridge.json"]))).toEqual(
    result.package,
  );
  expect(zip["READ_ME.txt"]).toBeDefined();
  expect(zip["conversion-report.json"]).toBeDefined();
});
it("never produces a package missing its referenced artwork", () => {
  const result = demoResult();
  result.package.assets = [
    {
      id: "missing",
      nodeId: "1",
      name: "Logo",
      filename: "Logo_1.png",
      width: 10,
      height: 10,
      scale: 2,
      reason: "Vector",
    },
  ];
  expect(() => buildExport(result)).toThrow("Logo is missing");
});
it("blocks empty or invalid exports", () => {
  const result = demoResult();
  result.package.roots = [];
  expect(() => buildExport(result)).toThrow("no screens");
});

it("exports fully linked artwork as JSON without requiring PNG bytes", () => {
  const result = demoResult();
  result.package.assets = [
    {
      id: "image",
      nodeId: "1",
      name: "Icon",
      filename: "Icon.png",
      width: 10,
      height: 10,
      scale: 2,
      reason: "Vector",
      robloxId: "123456",
    },
  ];
  const file = buildExport(result);
  expect(file.mime).toBe("application/json");
  expect(JSON.parse(strFromU8(file.data)).assets[0].robloxId).toBe("123456");
});
it("includes only unlinked PNGs in a partially uploaded package", () => {
  const result = demoResult();
  const asset = {
    id: "linked",
    nodeId: "1",
    name: "Linked",
    filename: "Linked.png",
    width: 10,
    height: 10,
    scale: 2,
    reason: "Vector",
    robloxId: "123456",
  };
  result.package.assets = [
    asset,
    { ...asset, id: "pending", filename: "Pending.png", robloxId: undefined },
  ];
  result.assets.pending = [137, 80, 78, 71];
  const file = buildExport(result);
  const zip = unzipSync(file.data);
  expect(zip["images/Linked.png"]).toBeUndefined();
  expect(zip["images/Pending.png"]).toEqual(
    new Uint8Array(result.assets.pending),
  );
  expect(
    JSON.parse(strFromU8(zip["InventoryUI.framebridge.json"])).assets[0]
      .robloxId,
  ).toBe("123456");
});
