// js/seedData.js
// 初始種子資料：第一次開啟且 localStorage 無資料時載入

const seedBudgets = [
  {
    id: 'BUD_001',
    academicYear: '114',
    budgetName: '',
    unitCodes: [],
    budgetAmount: 5744800,
    note: '原預算5544800，2026年5月新增10萬預算',
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z'
  },
  {
    id: 'BUD_002',
    academicYear: '115',
    budgetName: '',
    unitCodes: [],
    budgetAmount: 5844800,
    note: '115學年度初始測試預算',
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z'
  }
];

const seedUnits = [
  {
    id: 'UNIT_001',
    unitCode: 'AB_1',
    unitName: '公博流通',
    note: '原單位公博閱典因應學校政策改名公博流通',
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z'
  },
  {
    id: 'UNIT_002',
    unitCode: 'SB_1',
    unitName: '自學中心',
    note: '',
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z'
  }
];

const seedHourSettings = [
  {
    id: 'HOUR_001',
    academicYear: '115',
    scheduleType: '開學期間',
    unitCode: 'AB_1',
    unitName: '公博流通',
    weekdays: '星期一|星期二|星期三|星期四|星期五',
    startTime: '08:00',
    endTime: '21:30',
    hours: 34,
    hourlyWage: 196,
    note: '',
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z'
  },
  {
    id: 'HOUR_002',
    academicYear: '115',
    scheduleType: '開學期間',
    unitCode: 'SB_1',
    unitName: '自學中心',
    weekdays: '星期一|星期二|星期三|星期四|星期五',
    startTime: '08:00',
    endTime: '21:30',
    hours: 34,
    hourlyWage: 196,
    note: '',
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z'
  }
];

// calendarPeriods 與 calendarRows 初始為空
const seedCalendarPeriods = [];
const seedCalendarRows = [];
const seedCalendarHolidays = [];

export {
  seedBudgets,
  seedUnits,
  seedHourSettings,
  seedCalendarPeriods,
  seedCalendarRows,
  seedCalendarHolidays
};
