"use client";

import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  consolidateSchedules,
  deleteSchedules,
} from "@/app/schedule/actions";

type SelectionContextValue = {
  toggle: (id: string) => void;
  isSelected: (id: string) => boolean;
};

const SelectionContext = createContext<SelectionContextValue | null>(null);

export function useScheduleSelection() {
  return useContext(SelectionContext);
}

export function ScheduleSelectionRoot({
  date,
  entryIds,
  children,
}: {
  date: string;
  entryIds: string[];
  children: ReactNode;
}) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set());

  // 목록이 바뀌면 남은 id만 유효 — effect setState 없이 파생
  const selectedIds = useMemo(
    () => entryIds.filter((id) => selected.has(id)),
    [entryIds, selected],
  );
  const selectedCount = selectedIds.length;
  const allSelected = entryIds.length > 0 && selectedCount === entryIds.length;

  const value = useMemo<SelectionContextValue>(
    () => ({
      toggle: (id: string) => {
        setSelected((prev) => {
          const next = new Set(prev);
          if (next.has(id)) next.delete(id);
          else next.add(id);
          return next;
        });
      },
      isSelected: (id: string) => selected.has(id) && entryIds.includes(id),
    }),
    [selected, entryIds],
  );

  function selectAll() {
    setSelected(new Set(entryIds));
  }

  function clearSelection() {
    setSelected(new Set());
  }

  return (
    <SelectionContext.Provider value={value}>
      <div className="dispatch-board-stack">
        <div className="dispatch-bulk-bar" aria-label="납품 선택 삭제">
          <div className="dispatch-bulk-bar-left">
            <label className="dispatch-bulk-check">
              <input
                checked={allSelected}
                disabled={!entryIds.length}
                onChange={() => (allSelected ? clearSelection() : selectAll())}
                type="checkbox"
              />
              <span>전체 선택</span>
            </label>
            <span className="dispatch-bulk-count">
              {selectedCount > 0
                ? `${selectedCount}건 선택`
                : entryIds.length
                  ? `${date} · ${entryIds.length}건`
                  : "납품 없음"}
            </span>
          </div>
          <div className="dispatch-bulk-bar-actions">
            {selectedCount > 0 ? (
              <button
                className="dispatch-secondary-button"
                onClick={clearSelection}
                type="button"
              >
                선택 해제
              </button>
            ) : null}
            <form
              action={consolidateSchedules}
              onSubmit={(event) => {
                if (selectedCount < 2) {
                  event.preventDefault();
                  return;
                }
                if (
                  !confirm(
                    `선택한 ${selectedCount}건을 한 대(합차)로 묶을까요?\nPLT를 합산해 같은 차량·방문 순서로 맞춥니다.`,
                  )
                ) {
                  event.preventDefault();
                }
              }}
            >
              <input type="hidden" name="date" value={date} />
              {selectedIds.map((id) => (
                <input key={id} type="hidden" name="ids" value={id} />
              ))}
              <button
                className="dispatch-primary-button"
                disabled={selectedCount < 2}
                type="submit"
              >
                합차{selectedCount >= 2 ? ` (${selectedCount})` : ""}
              </button>
            </form>
            <form
              action={deleteSchedules}
              onSubmit={(event) => {
                if (selectedCount === 0) {
                  event.preventDefault();
                  return;
                }
                if (!confirm(`선택한 ${selectedCount}건을 삭제할까요?`)) {
                  event.preventDefault();
                }
              }}
            >
              <input type="hidden" name="date" value={date} />
              <input type="hidden" name="scope" value="selected" />
              {selectedIds.map((id) => (
                <input key={id} type="hidden" name="ids" value={id} />
              ))}
              <button
                className="dispatch-delete-button"
                disabled={selectedCount === 0}
                type="submit"
              >
                선택 삭제{selectedCount > 0 ? ` (${selectedCount})` : ""}
              </button>
            </form>
            <form
              action={deleteSchedules}
              onSubmit={(event) => {
                if (!entryIds.length) {
                  event.preventDefault();
                  return;
                }
                if (
                  !confirm(
                    `${date} 납품 ${entryIds.length}건을 모두 삭제할까요? 되돌릴 수 없습니다.`,
                  )
                ) {
                  event.preventDefault();
                }
              }}
            >
              <input type="hidden" name="date" value={date} />
              <input type="hidden" name="scope" value="day" />
              <button
                className="dispatch-delete-button"
                disabled={!entryIds.length}
                type="submit"
              >
                이 날짜 전부 삭제
              </button>
            </form>
          </div>
        </div>
        {children}
      </div>
    </SelectionContext.Provider>
  );
}

export function ScheduleSelectCheckbox({ id }: { id: string }) {
  const ctx = useScheduleSelection();
  if (!ctx) return null;
  const checked = ctx.isSelected(id);

  return (
    <label
      className={`dispatch-job-check${checked ? " is-checked" : ""}`}
      onClick={(event) => event.stopPropagation()}
    >
      <input
        aria-label="납품 선택"
        checked={checked}
        onChange={() => ctx.toggle(id)}
        type="checkbox"
      />
    </label>
  );
}
