import { describe, it, expect } from "vitest";
import { familyError, kinship, type Family } from "../shared/family.js";
const f: Family = {
  id: "b3a1765e-741f-43c7-bf15-b1b47e564047",
  name: "Тест",
  description: "",
  home: "",
  members: ["a", "b", "c", "d"],
  links: [
    { id: "1", from: "a", to: "b", kind: "parent" },
    { id: "2", from: "b", to: "c", kind: "adoptive" },
    { id: "3", from: "b", to: "d", kind: "parent" },
  ],
};
describe("family graph", () => {
  it("infers grandchildren and siblings including adoption", () => {
    expect(familyError(f)).toBe("");
    expect(kinship(f, "a", "c")).toBe("Дедушка / бабушка");
    expect(kinship(f, "c", "d")).toBe("Брат / сестра");
    expect(kinship(f, "c", "b")).toBe("Приёмный ребёнок");
  });
  it("rejects cycles, self links and missing members", () => {
    expect(
      familyError({
        ...f,
        links: [...f.links, { id: "4", from: "c", to: "a", kind: "parent" }],
      }),
    ).toContain("замкнутую");
    expect(
      familyError({
        ...f,
        links: [{ id: "4", from: "a", to: "a", kind: "spouse" }],
      }),
    ).toContain("самим");
    expect(familyError({ ...f, members: ["a"] })).toContain("входить");
  });
});
