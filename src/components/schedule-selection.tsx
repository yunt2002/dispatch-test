"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { deleteSchedules } from "@/app/schedule/actions";

type SelectionContextValue = {
  selected: Set<string>;
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
  const idKey = entryIds.join("|");

  useEffect(() => {
    setSelected((prev) => {
      const next = new Set<string>();
      for (const id of entryIds) {
        if (prev.has(id)) next.add(id);
      }
      return next;
    });
  }, [idKey, entryIds]);

  const value = useMemo<SelectionContextValue>(
    () => ({
      selected,
      toggle: (id: string) => {
        setSelected((prev) => {
          const next = new Set(prev);
          if (next.has(id)) next.delete(id);
          else next.add(id);
          return next;
        });
      },
      isSelected: (id: string) => selected.has(id),
    }),
    [selected],
  );

  const allSelected = entryIds.length > 0 && entryIds.every((id) => selected.has(id));
  const selectedCount = selected.size;

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
                  ? `오늘 ${entryIds.length}건`
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
              {[...selected].map((id) => (
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
                    `오늘(${date}) 납품 ${entryIds.length}건을 모두 삭제할까요? 되돌릴 수 없습니다.`,
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
                오늘 전부 삭제
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
