import type { IControl, Map as MlMap } from "maplibre-gl";

/** ความยาวแถบตอนอยู่มุมซ้ายล่าง (px) — กด x / ดูดกลับมุม แล้วจะกลับมาเท่านี้ */
const DEFAULT_LEN = 96;
const MIN_LEN = 48;
/** จุดหมุน (ปลายซ้ายของเส้นสเกล) เทียบมุมซ้ายบนของการ์ด — ต้องตรงกับ CSS (.map-scale-body สูง 30px, padding ซ้าย 10px + ขอบ 1px, เส้นอยู่ที่ y=18) */
const PIVOT_X = 11;
const PIVOT_Y = 18;
/** ระยะห่างจากขอบแผนที่ที่การ์ดทั้งใบ (รวมตัวเลขรวมท้ายแถบและปุ่ม x) ห้ามเลย */
const EDGE = 8;
/** ปุ่ม x ยื่นออกนอกการ์ดเท่านี้ (ขวา+บน) / ความสูงการ์ดไม่มี/มีเลขใต้ขีด — ต้องตรงกับ CSS (.map-scale-reset, .map-scale-body) */
const RESET_OVERHANG = 9;
const BODY_H = 30;
const BODY_H_TICKS = 40;
/** ปล่อยแถบห่างจุดเดิมไม่เกินนี้ = ดูดกลับมุม */
const SNAP_PX = 40;
/** หรือเคอร์เซอร์/นิ้วอยู่บนกรอบเส้นประ (ขยายขอบออกเท่านี้) ก็ดูด — แถบที่หมุนกลับหัวเอาจุดหมุนไปชิดมุมไม่ได้ (ปลายอีกข้างทะลุขอบ) จึงต้องวัดจากจุดที่ผู้ใช้จับด้วย */
const SNAP_PAD = 24;
/** ขยับเกินนี้ถึงนับว่าลาก (น้อยกว่า = แตะเฉยๆ) — นิ้ว/ปากกาสั่นมากกว่าเมาส์ ใช้ค่าใหญ่กว่า กันแตะแล้วหลุดออกจากมุมโดยไม่ตั้งใจ */
const DRAG_SLOP = 3;
const TOUCH_SLOP = 8;
const HOME_MS = 380;
/** ขีดแบ่ง: แสดงเมื่อแถบลอยอยู่และยาวอย่างน้อยเท่านี้ / ขีดห่างกันบนจออย่างน้อยราวนี้ / ไม่วางขีดใกล้ปลายขวาเกินนี้ (กันชนจุดจับ) */
const TICK_MIN_LEN = 120;
const TICK_GAP = 60;
const TICK_END_GAP = 28;
/** ขีดสองอันห่างกันบนจอน้อยกว่านี้ = เลขจะทับกัน */
const TICK_MIN_PX = 36;
/** จำนวน element ขีดที่สร้างไว้ (รวมขีด 0) */
const TICK_POOL = 11;
/** จุดตัวอย่างตามแนวเส้นเพื่อแปลง ระยะจริง ↔ ตำแหน่งบนจอ (unproject เป็นงานหนักตอนเปิด 3D จึงไม่ค้นหาทีละขีด) */
const SAMPLES = 16;
/** เปิด 3D (terrain) unproject แพงกว่ามาก → ใช้จุดตัวอย่างน้อยลง */
const SAMPLES_TERRAIN = 4;

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
// เด้งเกินปลายทางนิดๆ ตอนบินกลับมุม
const easeOutBack = (t: number) => {
  const c1 = 1.2;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** แปลงเมตร → ข้อความ (m / km) */
export function formatDistance(meters: number): string {
  // ปัดก่อนแล้วค่อยเลือกหน่วย กันเคส 999.6 m → "1000 m" หรือ 9.96 km → "10.0 km"
  const m = meters < 10 ? Math.round(meters * 10) / 10 : Math.round(meters);
  if (m < 1000) return `${m < 10 ? m.toFixed(1) : m} m`;
  const km = meters / 1000;
  const k = km < 10 ? Math.round(km * 10) / 10 : Math.round(km);
  return `${k < 10 ? k.toFixed(1) : k.toLocaleString("en-US")} km`;
}

/** ระยะห่างขีดที่เป็นเลขกลม (1/2/5 × 10ⁿ เมตร) เล็กสุดที่ไม่น้อยกว่า raw */
function niceStep(raw: number): number {
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  for (const m of [1, 2, 5, 10]) if (m * pow >= raw) return m * pow;
  return 10 * pow;
}

/** เลขใต้ขีด: ไม่ใส่ .0 (ต่างจาก formatDistance ของเลขรวมท้ายแถบ) เช่น "500 m", "1.5 km", "2 km" */
function formatTick(meters: number): string {
  if (meters < 1000) return `${Math.round(meters * 10) / 10} m`;
  // ใส่จุลภาคหลักพันให้เหมือนเลขรวมท้ายแถบ (formatDistance) เช่น "1,500 km"
  return `${(meters / 1000).toLocaleString("en-US", { maximumFractionDigits: 2 })} km`;
}

/** จุดตัวอย่างตามแนวเส้น: t = ระยะบนจอ (px) จากปลายซ้าย, d = ระยะจริง (เมตร) จากปลายซ้าย */
interface Line {
  t: number[];
  d: number[];
}

/** ตำแหน่งบนจอ (px) ที่ระยะจริงเท่ากับ target — แทรกค่าเชิงเส้นระหว่างจุดตัวอย่าง */
function tAt(line: Line, target: number): number {
  const { t, d } = line;
  for (let i = 1; i < d.length; i++) {
    if (d[i] >= target) {
      const span = d[i] - d[i - 1];
      const f = span > 0 ? (target - d[i - 1]) / span : 0;
      return t[i - 1] + f * (t[i] - t[i - 1]);
    }
  }
  return t[t.length - 1];
}

interface Drag {
  mode: "move" | "resize";
  id: number;
  /** clientX/Y ตอนกด */
  sx: number;
  sy: number;
  /** จุดหมุนตอนกด (พิกัดเทียบกล่องแผนที่) */
  p0x: number;
  p0y: number;
  /** resize: ระยะระหว่างเคอร์เซอร์กับจุดกลางของจุดจับ (กันจุดจับกระโดดตอนเริ่มลาก) */
  ox: number;
  oy: number;
  /** ขยับเกินเท่านี้ (px) ถึงนับว่าลาก — เมาส์/นิ้วต่างกัน */
  slop: number;
  /** "mouse" | "touch" | "pen" */
  pointerType: string;
  /** จุดหมุนของมุมเดิม — คำนวณครั้งเดียวตอนเริ่มลาก (อ่านจาก DOM ทุก pointermove แพงเกินไป) */
  home: { x: number; y: number };
  /** กรอบ ghost ที่มุมเดิม (พิกัด client เทียบกับ clientX/Y ได้ตรงๆ) — คำนวณพร้อม home */
  ghost: DOMRect | null;
  started: boolean;
}

/**
 * สเกลบาร์แบบไม้บรรทัด
 * - อยู่มุมซ้ายล่างตามปกติ (วัดที่กลางจอ ความยาว 96px) → ลากการ์ดออกมาวางบนแผนที่ได้ (วัดระยะตามแนวเส้นตรงที่วางอยู่)
 * - ลากจุดจับปลายขวาเพื่อยืด/หมุน (ปลายซ้ายอยู่กับที่) — อยู่มุมยืดได้แค่แนวนอน
 * - ปุ่ม x (โผล่เมื่อย้าย/ยืดแล้ว) หรือปล่อยใกล้มุมเดิม → บินกลับ + รีเซ็ตทั้งหมด
 * ทำด้วย DOM ล้วน (ไม่ใช้ React) เพราะต้องอัปเดตทุก pointermove / map move
 */
export class ScaleRulerControl implements IControl {
  private map?: MlMap;
  /** ช่องในคอนโทรลซ้ายล่าง — ตอนการ์ดลอยออกไปจะเหลือเป็นกรอบเส้นประ (ghost) บอกที่เดิม */
  private slot?: HTMLDivElement;
  private card?: HTMLDivElement;
  private body?: HTMLDivElement;
  private bar?: HTMLDivElement;
  private label?: HTMLSpanElement;
  private reset?: HTMLButtonElement;
  /** element ขีดแบ่งที่สร้างไว้ล่วงหน้า (ขีดแรก = ขีด 0 ที่ปลายซ้าย) */
  private ticks: HTMLSpanElement[] = [];
  /** ส่วนของการ์ดที่ยื่นเลยปลายขวาของเส้น (px) — วัดใหม่เฉพาะตอนข้อความตัวเลขเปลี่ยน (tailKey) */
  private tail = 70;
  private tailKey = "";

  private docked = true;
  /** จุดหมุน (ปลายซ้ายของเส้น) เทียบกล่องแผนที่ — ใช้เมื่อ docked = false */
  private px = 0;
  private py = 0;
  private len = DEFAULT_LEN;
  /** เรเดียน 0 = แนวนอนชี้ขวา */
  private angle = 0;
  private homing = false;
  /** 0→1 ตอนบินกลับ: ผสมเลขที่วัดตรงจุดที่วาง → เลขที่กลางจอ (เลขจะไม่กระตุกตอนจบ) */
  private mix = 0;
  private snap = false;
  private raf = 0;
  private drag: Drag | null = null;

  onAdd(map: MlMap): HTMLElement {
    this.map = map;
    const slot = document.createElement("div");
    // ใช้ class ของเราเอง (ไม่ใช้ maplibregl-ctrl-scale เพราะ css ของ MapLibre ทับสไตล์เรา) — ตำแหน่งยกเหนือแผ่นล่างบนมือถือผูกกับ .maplibregl-ctrl-bottom-left อยู่แล้ว
    slot.className = "maplibregl-ctrl map-scale-slot";

    const card = document.createElement("div");
    card.className = "map-scale";
    card.setAttribute("role", "group");
    card.setAttribute("aria-label", "แถบสเกลแผนที่ ลากเพื่อย้าย ลากจุดปลายขวาเพื่อยืดหรือหมุน");

    // body = หน้าตาการ์ด (ยกขึ้น/ย่อตอนลาก) / card ข้างนอกเป็นตัววางตำแหน่ง+หมุนอย่างเดียว ไม่ให้ transform ชนกัน
    const body = document.createElement("div");
    body.className = "map-scale-body";

    const bar = document.createElement("div");
    bar.className = "map-scale-bar";
    const ticks: HTMLSpanElement[] = [];
    for (let i = 0; i < TICK_POOL; i++) {
      const tick = document.createElement("span");
      tick.className = i === 0 ? "map-scale-tick is-zero" : "map-scale-tick";
      const text = document.createElement("span");
      text.className = "map-scale-tick-label";
      tick.append(text);
      bar.append(tick);
      ticks.push(tick);
    }
    this.ticks = ticks;
    const knob = document.createElement("div");
    knob.className = "map-scale-knob";
    bar.append(knob);

    const label = document.createElement("span");
    label.className = "map-scale-label";

    const reset = document.createElement("button");
    reset.type = "button";
    reset.className = "map-scale-reset";
    reset.title = "วางแถบสเกลกลับที่เดิม";
    reset.setAttribute("aria-label", "วางแถบสเกลกลับที่เดิม");
    reset.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>';

    body.append(bar, label, reset);
    card.append(body);
    slot.append(card);

    this.slot = slot;
    this.card = card;
    this.body = body;
    this.bar = bar;
    this.label = label;
    this.reset = reset;

    // กันเหตุการณ์ทะลุไปถึงแผนที่ / เครื่องมือวาด
    card.addEventListener("pointerdown", this.onCardDown);
    for (const type of ["mousedown", "touchstart", "click", "dblclick"] as const) {
      card.addEventListener(type, stopEvent);
    }
    // กดค้างบนมือถือ (long-press) ไม่ให้เมนูของเบราว์เซอร์เด้งขัดการลาก
    card.addEventListener("contextmenu", preventEvent);
    reset.addEventListener("click", this.onResetClick);
    window.addEventListener("pointerdown", this.onOutsideDown);
    window.addEventListener("blur", this.onBlur);

    map.on("move", this.update);
    map.on("resize", this.onMapResize);
    map.on("terrain", this.update); // เปิด/ปิด 3D เปลี่ยนผล unproject แต่ไม่ยิง move
    this.render();
    return slot;
  }

  onRemove() {
    cancelAnimationFrame(this.raf);
    this.stopDragListeners();
    window.removeEventListener("pointerdown", this.onOutsideDown);
    window.removeEventListener("blur", this.onBlur);
    this.map?.off("move", this.update);
    this.map?.off("resize", this.onMapResize);
    this.map?.off("terrain", this.update);
    this.card?.remove();
    this.slot?.remove();
    this.map = undefined;
    this.slot = this.card = this.body = this.bar = this.label = this.reset = undefined;
    this.ticks = [];
    this.tailKey = "";
  }

  // ---------- การโต้ตอบ ----------

  private onCardDown = (e: PointerEvent) => {
    // ไม่ stopPropagation ของ pointerdown: MapLibre ฟังเฉพาะที่ canvas container (การ์ดไม่ได้อยู่ในนั้น) และ Radix ต้องเห็นเพื่อปิดเมนูที่เปิดอยู่
    const { map, card } = this;
    const target = e.target as Element;
    if (!map || !card || this.homing) return;
    if (target.closest(".map-scale-reset")) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if (this.drag) {
      // เมาส์มีตัวเดียว → drag ที่ค้างอยู่คือของเก่าที่ไม่เคยได้ pointerup (ล้างแล้วเริ่มใหม่) / นิ้วที่สองแตะการ์ด → ไม่แย่งการควบคุมจากนิ้วแรก
      if (e.pointerType !== "mouse") return;
      this.endDrag();
    }

    const cr = map.getContainer().getBoundingClientRect();
    let p0x = this.px;
    let p0y = this.py;
    if (this.docked) {
      const r = card.getBoundingClientRect();
      p0x = r.left - cr.left + PIVOT_X;
      p0y = r.top - cr.top + PIVOT_Y;
    }
    const resize = !!target.closest(".map-scale-knob");
    const slop = e.pointerType === "mouse" ? DRAG_SLOP : TOUCH_SLOP;
    const d: Drag = {
      mode: resize ? "resize" : "move",
      id: e.pointerId,
      sx: e.clientX,
      sy: e.clientY,
      p0x,
      p0y,
      ox: 0,
      oy: 0,
      slop,
      pointerType: e.pointerType,
      home: { x: 0, y: 0 },
      ghost: null,
      started: false,
    };
    if (resize) {
      const kx = this.docked ? p0x + this.len : p0x + this.len * Math.cos(this.angle);
      const ky = this.docked ? p0y : p0y + this.len * Math.sin(this.angle);
      d.ox = e.clientX - cr.left - kx;
      d.oy = e.clientY - cr.top - ky;
      d.started = true;
      card.classList.add("is-dragging");
    }
    this.drag = d;
    window.addEventListener("pointermove", this.onMove);
    window.addEventListener("pointerup", this.onUp);
    window.addEventListener("pointercancel", this.onUp);
  };

  private onMove = (e: PointerEvent) => {
    const d = this.drag;
    const { map, card, slot } = this;
    if (!d || !map || !card || !slot || e.pointerId !== d.id) return;
    // เมาส์ไม่ได้กดอยู่แล้วแต่เรายังไม่ได้ pointerup (ปล่อยนอกหน้าต่าง ฯลฯ) → จบการลาก ไม่ให้การ์ดตามเมาส์ไปเรื่อยๆ
    if (e.pointerType === "mouse" && e.buttons === 0) {
      this.endDrag();
      return;
    }

    if (d.mode === "move") {
      if (!d.started) {
        if (Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < d.slop) return;
        d.started = true;
        if (this.docked) this.detach(d.p0x, d.p0y);
        d.home = this.homePivot();
        d.ghost = slot.getBoundingClientRect();
        card.classList.add("is-dragging");
      }
      this.px = d.p0x + (e.clientX - d.sx);
      this.py = d.p0y + (e.clientY - d.sy);
      this.clampPose();
      // เคอร์เซอร์อยู่บนกรอบ ghost หรือจุดหมุนใกล้จุดเดิมพอ → กรอบเปลี่ยนสี บอกว่าปล่อยแล้วจะดูดกลับ
      const g = d.ghost;
      const overGhost =
        !!g &&
        e.clientX >= g.left - SNAP_PAD &&
        e.clientX <= g.right + SNAP_PAD &&
        e.clientY >= g.top - SNAP_PAD &&
        e.clientY <= g.bottom + SNAP_PAD;
      this.snap = overGhost || Math.hypot(this.px - d.home.x, this.py - d.home.y) < SNAP_PX;
      slot.classList.toggle("is-snap", this.snap);
    } else {
      const cr = map.getContainer().getBoundingClientRect();
      const qx = e.clientX - cr.left - d.ox;
      const qy = e.clientY - cr.top - d.oy;
      if (this.docked) {
        this.len = clamp(qx - d.p0x, MIN_LEN, this.maxDockedLen());
      } else {
        const vx = qx - this.px;
        const vy = qy - this.py;
        const dist = Math.hypot(vx, vy);
        this.len = Math.max(MIN_LEN, dist);
        if (dist > 12) this.angle = Math.atan2(vy, vx);
        // ปลายซ้ายอยู่กับที่ — ถ้าการ์ดทั้งใบ (รวมตัวเลข/ปุ่ม x) จะหลุดขอบ ให้หยุดยืดแค่ที่พอดี
        this.clampPose(true);
      }
    }
    this.render();
  };

  private onUp = (e: PointerEvent) => {
    const d = this.drag;
    if (!d || e.pointerId !== d.id) return;
    const snap = this.snap;
    this.endDrag();
    if (e.type === "pointercancel") return;
    if (d.mode === "move" && !d.started) {
      // แตะเฉยๆ → โชว์/ซ่อนจุดจับ (เฉพาะจอสัมผัส — คอมใช้ hover ถ้าสลับด้วยการคลิก จุดจับจะค้างแม้เอาเมาส์ออก)
      if (d.pointerType !== "mouse") this.card?.classList.toggle("is-active");
      return;
    }
    if (d.mode === "move" && snap) {
      // กรอบ ghost คงสี teal ไว้ตลอดตอนบินกลับ (endDrag เอาออกไปแล้ว)
      this.slot?.classList.add("is-snap");
      this.goHome();
    }
  };

  /** จบการลาก (ปล่อย / ยกเลิก / หน้าต่างเสียโฟกัส) — ล้าง listener + สถานะลากทั้งหมด */
  private endDrag() {
    this.stopDragListeners();
    this.drag = null;
    this.snap = false;
    this.card?.classList.remove("is-dragging");
    this.slot?.classList.remove("is-snap");
  }

  // สลับหน้าต่าง/แท็บระหว่างลาก → บางครั้งไม่มี pointerup ส่งมา
  private onBlur = () => {
    if (this.drag) this.endDrag();
  };

  private onOutsideDown = (e: PointerEvent) => {
    // แตะนอกการ์ด → ซ่อนจุดจับที่โชว์ค้างไว้ (มือถือ)
    if (!this.card?.contains(e.target as Node)) this.card?.classList.remove("is-active");
  };

  private onResetClick = (e: MouseEvent) => {
    e.stopPropagation();
    this.goHome();
  };

  private stopDragListeners() {
    window.removeEventListener("pointermove", this.onMove);
    window.removeEventListener("pointerup", this.onUp);
    window.removeEventListener("pointercancel", this.onUp);
  }

  // ---------- ตำแหน่ง ----------

  /** ย้ายการ์ดจากช่องไปลอยบนกล่องแผนที่ ณ จุดหมุนเดิม — slot คงขนาดเดิมไว้เป็นกรอบเส้นประ ไม่ให้คอนโทรลข้างๆ ขยับ */
  private detach(p0x: number, p0y: number) {
    const { map, slot, card } = this;
    if (!map || !slot || !card) return;
    slot.style.width = `${card.offsetWidth - (this.len - DEFAULT_LEN)}px`;
    slot.style.height = `${card.offsetHeight}px`;
    slot.classList.add("is-ghost");
    map.getContainer().append(card);
    card.classList.add("is-floating");
    this.docked = false;
    this.px = p0x;
    this.py = p0y;
  }

  /** เอาการ์ดกลับเข้าช่อง + รีเซ็ตทุกอย่าง */
  private dock() {
    const { slot, card } = this;
    if (!slot || !card) return;
    slot.append(card);
    card.classList.remove("is-floating", "is-dragging", "is-homing");
    slot.classList.remove("is-ghost", "is-snap");
    slot.style.width = "";
    slot.style.height = "";
    this.docked = true;
    this.homing = false;
    this.mix = 0;
    this.len = DEFAULT_LEN;
    this.angle = 0;
    this.render();
  }

  /** จุดหมุนของมุมเดิม (พิกัดเทียบกล่องแผนที่) อ่านจากกรอบ ghost */
  private homePivot() {
    const cr = this.map!.getContainer().getBoundingClientRect();
    const r = this.slot!.getBoundingClientRect();
    return { x: r.left - cr.left + PIVOT_X, y: r.top - cr.top + PIVOT_Y };
  }

  /** ขอบเขตที่ปลายแถบอยู่ได้ — ขอบล่างเลี่ยงแผ่นล่างบนมือถือ (คอนโทรลซ้ายล่างถูกยกด้วย --map-bottom-inset) */
  private bounds() {
    const c = this.map!.getContainer();
    const parent = this.slot?.parentElement;
    const inset = parent ? parseFloat(getComputedStyle(parent).bottom) || 0 : 0;
    return { minX: EDGE, maxX: c.clientWidth - EDGE, minY: EDGE, maxY: c.clientHeight - inset - EDGE };
  }

  /** ยืดตอนอยู่มุมได้สูงสุดเท่าไร: เหลือที่ให้ตัวเลขทางขวา + เลี่ยงปุ่มขวาล่าง */
  private maxDockedLen() {
    const c = this.map!.getContainer();
    const left = this.homePivotX();
    return Math.max(DEFAULT_LEN, Math.min(520, c.clientWidth - left - 130));
  }

  private homePivotX() {
    const cr = this.map!.getContainer().getBoundingClientRect();
    const r = this.slot!.getBoundingClientRect();
    return r.left - cr.left + PIVOT_X;
  }

  /** ส่วนของการ์ดที่ยื่นเลยปลายขวาของเส้น: ช่อง + ตัวเลขรวม + padding + ปุ่ม x ที่ยื่นออกไป — วัดจาก DOM เฉพาะตอนข้อความตัวเลขเปลี่ยน (อ่าน layout ทุก pointermove แพง) */
  private tailLength(): number {
    const { body, bar, label } = this;
    if (!body || !bar || !label) return this.tail;
    const key = label.textContent ?? "";
    if (key !== this.tailKey) {
      this.tailKey = key;
      this.tail = body.offsetWidth - bar.offsetWidth - PIVOT_X + RESET_OVERHANG;
    }
    return this.tail;
  }

  /** กรอบสี่เหลี่ยมที่ล้อมการ์ดทั้งใบ (รวมตัวเลขรวมและปุ่ม x) หลังหมุนแล้ว — เทียบกับจุดหมุน */
  private extents(len: number) {
    const tail = this.tailLength();
    const h = len >= TICK_MIN_LEN ? BODY_H_TICKS : BODY_H;
    const cos = Math.cos(this.angle);
    const sin = Math.sin(this.angle);
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const x of [-PIVOT_X, len + tail]) {
      for (const y of [-(PIVOT_Y + RESET_OVERHANG), h - PIVOT_Y]) {
        const rx = x * cos - y * sin;
        const ry = x * sin + y * cos;
        minX = Math.min(minX, rx);
        maxX = Math.max(maxX, rx);
        minY = Math.min(minY, ry);
        maxY = Math.max(maxY, ry);
      }
    }
    return { minX, maxX, minY, maxY };
  }

  /**
   * ให้การ์ดทั้งใบ (รวมตัวเลขรวมท้ายแถบและปุ่ม x) อยู่ในกล่องแผนที่
   * keepPivot = true (ยืด/หมุนด้วยจุดจับ): ปลายซ้ายอยู่กับที่ → ย่อ len ลงแค่ที่พอดี
   * ไม่งั้น (ย้าย/จอเปลี่ยนขนาด): ย่อ len ถ้าการ์ดใหญ่กว่ากล่อง แล้วเลื่อนจุดหมุนให้อยู่ในกล่อง
   */
  private clampPose(keepPivot = false) {
    if (this.docked || !this.map) return;
    const b = this.bounds();
    const insideAt = (len: number) => {
      const e = this.extents(len);
      return this.px + e.minX >= b.minX && this.px + e.maxX <= b.maxX && this.py + e.minY >= b.minY && this.py + e.maxY <= b.maxY;
    };
    const fits = (len: number) => {
      const e = this.extents(len);
      return e.maxX - e.minX <= b.maxX - b.minX && e.maxY - e.minY <= b.maxY - b.minY;
    };
    // len ยาวที่สุดในช่วง [MIN_LEN, len ปัจจุบัน] ที่ pred ยังเป็นจริง (ต้องจริงที่ MIN_LEN)
    const longest = (pred: (len: number) => boolean) => {
      let lo = MIN_LEN;
      let hi = this.len;
      for (let i = 0; i < 16; i++) {
        const mid = (lo + hi) / 2;
        if (pred(mid)) lo = mid;
        else hi = mid;
      }
      return lo;
    };
    if (keepPivot) {
      if (insideAt(this.len)) return;
      if (insideAt(MIN_LEN)) {
        this.len = longest(insideAt);
        return;
      }
    }
    if (!fits(this.len)) this.len = fits(MIN_LEN) ? longest(fits) : MIN_LEN;
    const e = this.extents(this.len);
    this.px = clamp(this.px, b.minX - e.minX, b.maxX - e.maxX);
    this.py = clamp(this.py, b.minY - e.minY, b.maxY - e.maxY);
  }

  // ---------- บินกลับมุม ----------

  private goHome() {
    const { card } = this;
    if (!this.map || !card || this.homing) return;
    const floating = !this.docked;
    if (!floating && Math.abs(this.len - DEFAULT_LEN) < 0.5) return;
    cancelAnimationFrame(this.raf);
    // ยกเลิกการลากที่ค้างอยู่ (เช่น กด x ด้วยนิ้วที่สอง/คีย์บอร์ดระหว่างลากจุดจับ) ไม่ให้ onMove แย่งค่ากับ tween
    this.stopDragListeners();
    this.drag = null;
    this.snap = false;

    const from = { px: this.px, py: this.py, len: this.len, angle: this.angle };
    const home = floating ? this.homePivot() : { x: this.px, y: this.py };
    // หมุนทางสั้นสุดกลับ 0°
    const turn = ((((-from.angle + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) - Math.PI;
    const to = { px: home.x, py: home.y, len: DEFAULT_LEN, angle: from.angle + turn };

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const dur = reduced ? 0 : floating ? HOME_MS : 240;
    this.homing = true;
    card.classList.add("is-homing");
    card.classList.remove("is-dragging");

    const t0 = performance.now();
    const step = (now: number) => {
      const t = dur === 0 ? 1 : Math.min(1, (now - t0) / dur);
      const e = easeOutBack(t);
      const m = easeOutCubic(t);
      this.px = from.px + (to.px - from.px) * e;
      this.py = from.py + (to.py - from.py) * e;
      this.len = Math.max(MIN_LEN, from.len + (to.len - from.len) * e);
      this.angle = from.angle + (to.angle - from.angle) * m;
      this.mix = floating ? m : 0;
      this.render();
      if (t < 1) this.raf = requestAnimationFrame(step);
      else this.dock();
    };
    this.raf = requestAnimationFrame(step);
  }

  // ---------- วาด / วัด ----------

  private render() {
    const { card, bar, label, reset } = this;
    if (!card || !bar || !label || !reset) return;
    bar.style.width = `${this.len}px`;
    if (this.docked) {
      card.style.transform = "";
      card.style.transformOrigin = "";
    } else {
      card.style.transformOrigin = `${PIVOT_X}px ${PIVOT_Y}px`;
      card.style.transform = `translate(${this.px - PIVOT_X}px, ${this.py - PIVOT_Y}px) rotate(${this.angle}rad)`;
    }
    // ปุ่ม x โผล่เมื่อย้าย/ยืดแล้ว (ซ่อนตั้งแต่เริ่มบินกลับ)
    const dirty = !this.homing && (!this.docked || Math.abs(this.len - DEFAULT_LEN) > 0.5);
    card.dataset.dirty = String(dirty);
    reset.tabIndex = dirty ? 0 : -1;
    reset.setAttribute("aria-hidden", String(!dirty));
    // ปุ่มถูกซ่อนแล้ว (กด x เสร็จ) ต้องไม่ถือโฟกัสค้าง — aria-hidden บน element ที่โฟกัสอยู่ผิดหลัก a11y
    if (!dirty && document.activeElement === reset) reset.blur();
    // เอียงเกิน ±90° แล้วพลิกตัวเลขให้อ่านได้ ไม่กลับหัว
    const a = ((((this.angle + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) - Math.PI;
    card.classList.toggle("is-flipped", Math.abs(a) > Math.PI / 2);
    this.update();
  }

  /** ระยะจริง (เมตร) ของแถบ — อยู่มุม: วัดแนวนอนที่กลางจอ / ลอย: วัดตามแนวเส้นที่วางอยู่ */
  private measure(docked: boolean, len: number): number {
    const { map } = this;
    if (!map) return NaN;
    let a: [number, number];
    let b: [number, number];
    if (docked) {
      const c = map.getContainer();
      const x = c.clientWidth / 2;
      const y = c.clientHeight / 2;
      a = [x - len / 2, y];
      b = [x + len / 2, y];
    } else {
      a = [this.px, this.py];
      b = [this.px + len * Math.cos(this.angle), this.py + len * Math.sin(this.angle)];
    }
    return map.unproject(a).distanceTo(map.unproject(b));
  }

  private update = () => {
    const { label } = this;
    if (!label || !this.map) return;
    // ลอยและยาวพอจะมีขีด → วัดจุดตัวอย่างครั้งเดียว ใช้ทั้งเลขรวม (จุดสุดท้าย) และตำแหน่งขีด (unproject หนักตอนเปิด 3D)
    const line = !this.docked && !this.homing && this.len >= TICK_MIN_LEN ? this.sampleLine() : null;
    let m = line ? line.d[line.d.length - 1] : this.measure(this.docked, this.len);
    if (this.mix > 0 && !this.docked) {
      const center = this.measure(true, DEFAULT_LEN);
      if (Number.isFinite(m) && Number.isFinite(center)) m += (center - m) * this.mix;
    }
    // เหนือเส้นขอบฟ้าตอนเอียง 3D ฯลฯ → วัดไม่ได้
    label.textContent = Number.isFinite(m) ? formatDistance(m) : "—";
    this.updateTicks(line);
  };

  /** จุดตัวอย่างตามแนวเส้นของแถบที่ลอยอยู่ — null ถ้าวัดไม่ได้ (เช่น ทะลุขอบฟ้าตอนเอียง 3D) */
  private sampleLine(): Line | null {
    const { map } = this;
    if (!map) return null;
    const cos = Math.cos(this.angle);
    const sin = Math.sin(this.angle);
    const origin = map.unproject([this.px, this.py]);
    const n = map.getTerrain() ? SAMPLES_TERRAIN : SAMPLES;
    const t: number[] = [];
    const d: number[] = [];
    for (let i = 0; i <= n; i++) {
      const s = (this.len * i) / n;
      const dist = i === 0 ? 0 : origin.distanceTo(map.unproject([this.px + s * cos, this.py + s * sin]));
      if (!Number.isFinite(dist)) return null;
      t.push(s);
      d.push(dist);
    }
    return { t, d };
  }

  /** วางขีดแบ่งที่ระยะเลขกลม + เลขใต้ขีด — เฉพาะตอนลอยและแถบยาวพอ (อยู่มุมต้องเตี้ยเท่าปุ่ม (i)) */
  private updateTicks(line: Line | null) {
    const { card, ticks } = this;
    if (!card) return;
    let count = 0;
    const total = line ? line.d[line.d.length - 1] : 0;
    if (line && total > 0) {
      const n = clamp(Math.floor(this.len / TICK_GAP), 1, TICK_POOL - 1);
      let step = niceStep(total / n);
      let spots: { pos: number; text: string }[] = [];
      // ตอนเอียง 3D ระยะจริงต่อพิกเซลไม่เท่ากันตลอดเส้น ขีดฝั่งไกลอาจเบียดจนเลขทับกัน → ขยับไปใช้ระยะห่างเลขกลมตัวถัดไป (ลองไม่เกิน 4 ครั้ง)
      for (let tries = 0; tries < 4; tries++) {
        spots = [];
        let last = 0;
        let crowded = false;
        for (let k = 1; k < TICK_POOL; k++) {
          const target = Math.round(k * step * 1e6) / 1e6;
          if (target > total) break;
          const pos = tAt(line, target);
          if (pos > this.len - TICK_END_GAP) break;
          if (pos - last < TICK_MIN_PX) crowded = true;
          last = pos;
          spots.push({ pos, text: formatTick(target) });
        }
        if (!crowded) break;
        step = niceStep(step * 1.01);
      }
      // มีแค่ขีด 0 ลอยเดี่ยวๆ ไม่มีความหมาย → ไม่โชว์
      if (spots.length > 0) {
        spots.unshift({ pos: 0, text: "0" });
        count = spots.length;
        spots.forEach((s, i) => {
          const tick = ticks[i];
          const text = tick.firstElementChild as HTMLElement;
          tick.style.left = `${s.pos}px`;
          if (text.textContent !== s.text) text.textContent = s.text;
        });
      }
    }
    card.classList.toggle("has-ticks", count > 0);
    ticks.forEach((tick, i) => tick.classList.toggle("is-on", i < count));
  }

  private onMapResize = () => {
    if (!this.map) return;
    if (this.docked) this.len = Math.min(this.len, this.maxDockedLen());
    else this.clampPose();
    this.render();
  };
}

function stopEvent(e: Event) {
  e.stopPropagation();
}

function preventEvent(e: Event) {
  e.preventDefault();
}
