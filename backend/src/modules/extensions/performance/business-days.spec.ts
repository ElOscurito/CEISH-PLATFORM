import { businessDays, trafficLight } from "./business-days";

describe("CEISH business days", () => {
  it.each([
    ["2026-11-20T14:00:00Z", "2026-11-23T14:00:00Z", 1],
    ["2026-11-20T14:00:00Z", "2026-11-22T14:00:00Z", 0],
    ["2026-11-16T14:00:00Z", "2026-11-30T14:00:00Z", 10],
    ["2026-11-23T04:59:00Z", "2026-11-23T05:00:00Z", 1],
    ["2026-11-23T05:00:00Z", "2026-11-24T04:59:00Z", 0],
    ["2026-11-24T05:00:00Z", "2026-11-23T05:00:00Z", 0],
  ])("counts %s through %s as %i", (start, end, expected) => {
    expect(businessDays(new Date(start), new Date(end))).toBe(expected);
  });

  it.each([
    [4, "green"],
    [5, "yellow"],
    [9, "yellow"],
    [10, "red"],
    [11, "red"],
  ])("classifies %i days as %s", (days, expected) => {
    expect(trafficLight(days, { warning_days: 5, critical_days: 10 })).toBe(
      expected,
    );
  });
});
