export const mockRevenueData = [
  { region: "APAC", revenue: 482, growth: 34 },
  { region: "EMEA", revenue: 356, growth: 12 },
  { region: "NA", revenue: 610, growth: 8 },
  { region: "LATAM", revenue: 198, growth: 21 },
];

export const mockHistory = [
  { id: 1, title: "Q3 regional revenue breakdown", time: "10:42 AM", channel: "web", active: true },
  { id: 2, title: "“show me last month too”", time: "9:15 AM", channel: "whatsapp", active: false },
  { id: 3, title: "Inventory turnover — warehouse B", time: "Yesterday", channel: "web", active: false },
  { id: 4, title: "Marketing spend vs. conversions", time: "Yesterday", channel: "whatsapp", active: false },
  { id: 5, title: "Headcount by department.xlsx", time: "Mon", channel: "web", active: false },
];

export const mockAllConversations = [
  { id: 1, title: "Q3 regional revenue breakdown", messages: 14, channel: "web", updated: "10:42 AM today" },
  { id: 2, title: "Inventory turnover — warehouse B", messages: 6, channel: "web", updated: "Yesterday" },
  { id: 3, title: "Marketing spend vs. conversions", messages: 9, channel: "whatsapp", updated: "Yesterday" },
  { id: 4, title: "Headcount by department.xlsx", messages: 3, channel: "web", updated: "Monday" },
  { id: 5, title: "APAC shipping delays Q2", messages: 21, channel: "whatsapp", updated: "Last week" },
  { id: 6, title: "Warehouse capacity planning", messages: 11, channel: "web", updated: "Last week" },
];

export const mockAllFiles = [
  { id: 1, name: "Regional Revenue.pbip", conversation: "Q3 regional revenue breakdown", created: "10:44 AM today", status: "ready" },
  { id: 2, name: "Warehouse B Turnover.pbip", conversation: "Inventory turnover — warehouse B", created: "Yesterday", status: "ready" },
  { id: 3, name: "Conversion Funnel.pbip", conversation: "Marketing spend vs. conversions", created: "Yesterday", status: "ready" },
  { id: 4, name: "Headcount Overview.pbip", conversation: "Headcount by department.xlsx", created: "Monday", status: "ready" },
  { id: 5, name: "Shipping Delay Analysis.pbip", conversation: "APAC shipping delays Q2", created: "Last week", status: "failed" },
];