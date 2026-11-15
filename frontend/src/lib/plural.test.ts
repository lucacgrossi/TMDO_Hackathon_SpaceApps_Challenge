import { describe, expect, it } from "vitest";
import { meses, plural } from "./plural";

describe("plural", () => {
  it("usa el singular solo con 1 o −1", () => {
    expect(meses(1)).toBe("mes");
    expect(meses(-1)).toBe("mes");
    expect(meses(0)).toBe("meses");
    expect(meses(2)).toBe("meses");
    expect(meses(1.5)).toBe("meses");
  });

  it("sin dato va en plural", () => {
    expect(meses(null)).toBe("meses");
    expect(plural(undefined, "año", "años")).toBe("años");
  });
});
