// js/state.js
// 全域狀態管理

export const AppState = {
  currentTab: 'salaryEntry', // salaryEntry | differenceForecast | calendar | unit | hour | budget
  searchFilters: {
    hour: ''  // 時數設定頁查詢字串
  },
  // 其他可擴充
};

export function setCurrentTab(tab) {
  AppState.currentTab = tab;
}

export function setHourSearchFilter(val) {
  AppState.searchFilters.hour = val || '';
}

export function getHourSearchFilter() {
  return AppState.searchFilters.hour;
}
