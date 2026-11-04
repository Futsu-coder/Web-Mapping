// รายการ category ที่ใช้ร่วมกันทั้ง server (validation) และ web (dropdown)
export const CATEGORIES = ["Environment", "Transport", "Public Service", "Other"] as const;
export type Category = (typeof CATEGORIES)[number];
