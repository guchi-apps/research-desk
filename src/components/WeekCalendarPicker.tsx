"use client";

import Link from "next/link";
import { Fragment, useEffect, useRef, useState } from "react";
import type { CalendarMonth, CalendarWeekRow } from "@/lib/industry-information";

const WEEKDAY_LABELS = ["月", "火", "水", "木", "金", "土", "日"];

// "YYYY-MM-DD" から "M月D日" だけを取り出す。日付計算はサーバー側（jst-week.ts）で
// 済ませてあるので、ここではDateを作り直さず文字列のまま扱う。
function monthDayLabel(iso: string): string {
  const [, month, day] = iso.split("-");
  return `${Number(month)}月${Number(day)}日`;
}

type Props = {
  months: CalendarMonth[];
  currentWeekOffset: number;
  currentLabel: string;
  currentWeekNumber: number;
  weekHrefs: Record<string, string>;
};

// 週選択のトリガーボタン＋カレンダーのポップオーバー（#125）。日付グリッド・週番号・選べる
// 範囲はすべてサーバー側（`buildWeekCalendarMonths()`）で計算済みのものをそのまま描画し、
// ここでは開閉・ホバー状態だけを持つ。開閉パターンは`AppShell.tsx`のドロワーに揃えた。
export default function WeekCalendarPicker({ months, currentWeekOffset, currentLabel, currentWeekNumber, weekHrefs }: Props) {
  const [open, setOpen] = useState(false);
  const [hoveredWeek, setHoveredWeek] = useState<number | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(event: PointerEvent) {
      if (rootRef.current && event.target instanceof Node && !rootRef.current.contains(event.target)) setOpen(false);
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const allRows = months.flatMap((month) => month.weeks);
  const previewWeekOffset = hoveredWeek ?? currentWeekOffset;
  const previewRow = allRows.find((row) => row.days.some((day) => day.weekOffset === previewWeekOffset));
  const previewFrom = previewRow?.days[0];
  const previewTo = previewRow?.days.at(-1);
  const previewLabel = previewFrom && previewTo ? `${monthDayLabel(previewFrom.iso)}〜${monthDayLabel(previewTo.iso)}` : currentLabel;
  const previewWeekNumber = previewRow?.weekNumber ?? currentWeekNumber;

  function renderRow(row: CalendarWeekRow) {
    const key = `${row.weekNumber}-${row.days[0]?.iso ?? ""}`;
    const cells = [...row.days];
    while (cells.length < 7) cells.push(null as never);
    // `.cal-grid`はCSS Gridなので、行の中身はラップせず直接の子として並べる必要がある
    // （ラップするとその要素自体が1マス分になり列がずれる）。Fragmentで束ねるだけにする。
    return (
      <Fragment key={key}>
        <div className="gcell weeknum">{row.weekNumber}</div>
        {cells.map((day, index) => {
          if (!day) return <div className="gcell" key={index} />;
          const classes = ["gcell", "daynum"];
          if (day.weekOffset === null) classes.push("disabled");
          if (day.weekOffset === currentWeekOffset) classes.push("in-selected");
          if (day.weekOffset !== null && day.weekOffset === hoveredWeek && hoveredWeek !== currentWeekOffset) classes.push("in-hover");
          if (day.isToday) classes.push("today");
          if (index === 0) classes.push("row-start");
          if (index === cells.length - 1) classes.push("row-end");
          const content = <span>{day.day}</span>;
          if (day.weekOffset === null) return <div className={classes.join(" ")} key={day.iso}>{content}</div>;
          const href = weekHrefs[String(day.weekOffset)];
          return (
            <Link
              key={day.iso}
              href={href ?? "#"}
              className={classes.join(" ")}
              onMouseEnter={() => setHoveredWeek(day.weekOffset)}
              onMouseLeave={() => setHoveredWeek(null)}
              onClick={() => setOpen(false)}
            >
              {content}
            </Link>
          );
        })}
      </Fragment>
    );
  }

  return (
    <div className="week-picker" ref={rootRef}>
      <button type="button" className={open ? "week-trigger open" : "week-trigger"} aria-expanded={open} onClick={() => setOpen((current) => !current)}>
        <span className="cal-ico" aria-hidden>📅</span>
        {currentLabel}
        <span className="caret">▾</span>
      </button>
      {open && (
        <div className="picker" role="dialog" aria-label="週を選ぶ">
          <div className="picker-head">
            <h3>週を選ぶ</h3>
            <button type="button" aria-label="閉じる" onClick={() => setOpen(false)}>×</button>
          </div>
          <div className="picker-legend">
            <b><span className="dot-today" />今日</b>
            <b><span className="dot-selected" />選択中の週</b>
          </div>
          {months.map((month) => (
            <div className="month-block" key={month.label}>
              <p className="month-title">{month.label}</p>
              <div className="cal-grid">
                <div className="gcell weeknum-head">週</div>
                {WEEKDAY_LABELS.map((label) => <div className="gcell" key={label}>{label}</div>)}
                {month.weeks.map((row) => renderRow(row))}
              </div>
            </div>
          ))}
          <div className="picker-foot">
            {hoveredWeek !== null ? "ホバー中: " : "選択中: "}
            <b>{previewLabel}</b>
            <span className="tag">第{previewWeekNumber}週</span>
          </div>
          <p className="picker-note">日付をクリックするとその週へ移動します。今日は二重丸で強調しています。将来の日付・選べる範囲より前の日付はクリックできません。</p>
        </div>
      )}
    </div>
  );
}
