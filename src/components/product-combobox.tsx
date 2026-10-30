"use client";

import { useEffect, useMemo, useState } from "react";

export function ProductCombobox({ id, names, value, onValueChange, required = false }: {
  id: string; names: string[]; value?: string; onValueChange?: (value: string) => void; required?: boolean;
}) {
  const [localValue, setLocalValue] = useState("");
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const current = value ?? localValue;
  const options = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return needle ? names.filter((name) => name.toLocaleLowerCase().includes(needle)) : names;
  }, [names, query]);
  useEffect(() => {
    if (open) document.getElementById(`${id}-option-${active}`)?.scrollIntoView({ block: "nearest" });
  }, [active, id, open]);

  function change(next: string) {
    if (onValueChange) onValueChange(next); else setLocalValue(next);
  }
  function choose(next: string) {
    change(next);
    setQuery("");
    setOpen(false);
    setActive(0);
  }

  return <div className="product-combobox" onBlur={(event) => {
    if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
  }}>
    <div className="product-combobox-input">
      <input className="dispatch-input" id={id} name="productName" placeholder="품명 검색 또는 선택" required={required} value={current}
        role="combobox" aria-autocomplete="list" aria-expanded={open} aria-controls={`${id}-options`}
        aria-activedescendant={open && options[active] ? `${id}-option-${active}` : undefined}
        onFocus={(event) => { setQuery(""); setActive(0); setOpen(true); event.currentTarget.select(); }}
        onClick={(event) => { setQuery(""); setActive(0); setOpen(true); event.currentTarget.select(); }}
        onChange={(event) => { change(event.target.value); setQuery(event.target.value); setActive(0); setOpen(true); }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") { event.preventDefault(); setOpen(true); setActive((index) => Math.min(index + (open ? 1 : 0), Math.max(0, options.length - 1))); }
          else if (event.key === "ArrowUp") { event.preventDefault(); setOpen(true); setActive((index) => Math.max(0, index - 1)); }
          else if (event.key === "Enter" && open && options[active]) { event.preventDefault(); choose(options[active]); }
          else if (event.key === "Escape" && open) { event.preventDefault(); event.stopPropagation(); setOpen(false); }
        }} />
      {current ? <button type="button" className="product-combobox-clear" aria-label="품명 지우기" onMouseDown={(event) => event.preventDefault()} onClick={() => { change(""); setQuery(""); setActive(0); setOpen(true); document.getElementById(id)?.focus(); }}>×</button> : null}
      <button type="button" className="product-combobox-toggle" aria-label="품목 목록 열기" onMouseDown={(event) => event.preventDefault()} onClick={() => { setQuery(""); setActive(0); setOpen(true); document.getElementById(id)?.focus(); }}>▾</button>
    </div>
    {open ? <div className="product-combobox-list" id={`${id}-options`} role="listbox" aria-label="품목 목록">
      {options.length ? options.map((name, index) => <div id={`${id}-option-${index}`} key={name} role="option" aria-selected={index === active} className={index === active ? "is-active" : ""} onMouseDown={(event) => event.preventDefault()} onClick={() => choose(name)}>{name}</div>) : <p>검색 결과가 없습니다. 입력한 품명을 사용할 수 있습니다.</p>}
    </div> : null}
  </div>;
}
