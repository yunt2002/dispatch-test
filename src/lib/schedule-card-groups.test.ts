import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { groupScheduleCards } from "./schedule-card-groups";

describe("schedule card groups", () => {
  it("shows grouped items together and leaves unrelated items separate", () => {
    const items = [
      { id: "a", status: "PLANNED", consolidateGroupId: "g" },
      { id: "b", status: "PLANNED", consolidateGroupId: "g" },
      { id: "c", status: "PLANNED", consolidateGroupId: null },
    ];
    assert.deepEqual(groupScheduleCards(items).map((group) => group.map((item) => item.id)), [["a", "b"], ["c"]]);
  });
  it("never hides group members in a different status", () => {
    const items = [
      { id: "a", status: "PLANNED", consolidateGroupId: "g" },
      { id: "b", status: "DONE", consolidateGroupId: "g" },
    ];
    assert.deepEqual(groupScheduleCards(items).map((group) => group.map((item) => item.id)), [["a"], ["b"]]);
  });
});
