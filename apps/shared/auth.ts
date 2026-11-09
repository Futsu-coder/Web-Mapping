// กติกาบัญชีผู้ใช้ที่ใช้ร่วมกันทั้ง server (สมัคร) และ web (ฟอร์ม login/สมัคร)

/** a-z 0-9 _ ยาว 3–20 ตัว (ตรวจ "ห้ามเป็นตัวเลขล้วน" แยกด้วย isValidUsername) */
export const USERNAME_PATTERN = "^[a-z0-9_]{3,20}$";
export const PASSWORD_MIN = 8;
/** ขีดจำกัดของ bcrypt ที่ Supabase ใช้ */
export const PASSWORD_MAX = 72;
export const USERNAME_TAKEN = "ชื่อผู้ใช้นี้ถูกใช้แล้ว";

export const normalizeUsername = (raw: string) => raw.trim().toLowerCase();

/** ห้ามเป็นตัวเลขล้วน เพราะช่องเชิญถือว่าตัวเลขล้วนคือ UserID */
export const isValidUsername = (username: string) =>
  new RegExp(USERNAME_PATTERN).test(username) && !/^[0-9]+$/.test(username);

// Supabase Auth ต้องใช้อีเมล → แปลง username เป็นอีเมลภายใน (โดเมน example.com สงวนไว้ ไม่มีอยู่จริง ไม่มีการส่งเมล)
export const emailOf = (username: string) => `${username}@users.example.com`;
