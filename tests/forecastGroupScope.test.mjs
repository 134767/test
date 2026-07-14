import test from "node:test";
import assert from "node:assert/strict";
import {
  getDistinctBudgetNames,
  getValidBudgetGroups,
  buildBudgetScope,
  normalizeBudgetUnitCodes,
  sumBudgetAmounts,
  getBudgetsByName
} from "../js/budgetGroupUtils.js";

const budgets = [
  { academicYear: "114", budgetName: "Group_Alpha", unitCodes: ["U_A1","U_A2"], budgetAmount: 1000 },
  { academicYear: "114", budgetName: "Group_Beta", unitCodes: ["U_B1"], budgetAmount: 500 },
  { academicYear: "114", budgetName: "", unitCodes: ["U_Z"], budgetAmount: 9 },
  { academicYear: "114", budgetName: "Legacy", unitCodes: [], budgetAmount: 1 },
  { academicYear: "115", budgetName: "Group_Alpha", unitCodes: ["U_A1"], budgetAmount: 200 }
];

test("distinct valid group names only", () => {
  assert.deepEqual(getDistinctBudgetNames(budgets), ["Group_Alpha", "Group_Beta"]);
});

test("invalid groups excluded from valid list", () => {
  assert.equal(getValidBudgetGroups(budgets).length, 3);
});

test("cross year scope keeps per-year unit codes", () => {
  const s = buildBudgetScope({ budgetName: "Group_Alpha", mode: "dateRange", startYm: "2025-08", endYm: "2026-09" }, budgets);
  assert.equal(s.ok, true);
  assert.deepEqual(s.scope.budgets.map(b => b.unitCodes), [["U_A1","U_A2"],["U_A1"]]);
  assert.equal(sumBudgetAmounts(s.scope.budgets), 1200);
});

test("unselected budget name is unsafe blocked", () => {
  const s = buildBudgetScope({ budgetName: "", mode: "academicYear", academicYear: "114" }, budgets);
  assert.equal(s.ok, false);
});
