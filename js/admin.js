(function () {
  const KEYS = ["D", "I", "S", "C"];
  const COLORS = { D: "var(--d)", I: "var(--i)", S: "var(--s)", C: "var(--c)" };
  const NAMES = { D: "Thống trị", I: "Ảnh hưởng", S: "Kiên định", C: "Tuân thủ" };
  const LANGS = { vi: "Tiếng Việt", en: "English", ja: "日本語" };
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  let rows = [], totalAll = 0, confirmId = null;

  const fmtTime = iso => { const d = new Date(iso); return isNaN(d) ? iso : d.toLocaleString("vi-VN", { dateStyle: "short", timeStyle: "short" }); };
  const fmtDob = dob => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dob || ""); return m ? `${m[3]}/${m[2]}/${m[1]}` : esc(dob); };
  function age(dob) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dob || ""); if (!m) return "";
    const now = new Date(); let a = now.getFullYear() - +m[1];
    if (now.getMonth() + 1 < +m[2] || (now.getMonth() + 1 === +m[2] && now.getDate() < +m[3])) a--;
    return a;
  }
  const pct = (r, k) => Math.round(r[k.toLowerCase()] / (r.total || 1) * 100);

  async function load() {
    $("rows").innerHTML = `<tr><td colspan="13" class="empty">Đang tải…</td></tr>`;
    try {
      const q = $("q").value.trim();
      const res = await fetch("/api/admin/results?limit=5000" + (q ? "&q=" + encodeURIComponent(q) : ""), { cache: "no-store" });
      if (res.status === 401 || res.status === 403) { location.reload(); return; }
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || res.status);
      const data = await res.json();
      rows = data.results || []; totalAll = data.total || 0;
      render();
    } catch (e) {
      $("rows").innerHTML = `<tr><td colspan="13" class="empty">Không tải được dữ liệu (${esc(e.message)}). Bấm “Tải lại” để thử lại.</td></tr>`;
    }
  }

  function render() {
    $("t-all").textContent = totalAll;
    KEYS.forEach(k => $("t-" + k).textContent = rows.filter(r => r.primary_style === k).length);
    $("count").textContent = $("q").value.trim() ? `${rows.length} kết quả khớp / ${totalAll} lượt` : `Hiển thị ${rows.length} / ${totalAll} lượt`;
    if (!rows.length) {
      $("rows").innerHTML = `<tr><td colspan="13" class="empty">${totalAll ? "Không có kết quả khớp." : "Chưa có ai làm bài. Kết quả sẽ hiện ở đây sau khi người dùng hoàn thành bài test."}</td></tr>`;
      return;
    }
    $("rows").innerHTML = rows.map(r => {
      const p = r.primary_style, s = r.secondary_style;
      const bar = KEYS.map(k => `<span style="width:${pct(r, k)}%;background:${COLORS[k]}" title="${k} ${pct(r, k)}%"></span>`).join("");
      const del = confirmId === r.id
        ? `<span class="confirm">Xóa?<button class="btn danger" data-del="${r.id}">Xóa</button><button class="btn danger" data-cancel style="color:var(--muted)">Hủy</button></span>`
        : `<button class="btn danger" data-ask="${r.id}" aria-label="Xóa kết quả của ${esc(r.name)}">Xóa</button>`;
      return `<tr>
        <td>${esc(fmtTime(r.created_at))}</td>
        <td class="name">${esc(r.name)}</td>
        <td>${fmtDob(r.dob)}</td>
        <td class="num">${age(r.dob)}</td>
        <td><span class="pill"><i style="background:${COLORS[p]}">${p}</i>${NAMES[p] || ""}${s ? `<span class="muted"> · ${p}${s}</span>` : ""}</span></td>
        <td><div class="mini">${bar}</div></td>
        ${KEYS.map(k => `<td class="num">${pct(r, k)}%</td>`).join("")}
        <td>${r.mode === "full" ? "Đầy đủ" : "Nhanh"} · ${r.total}</td>
        <td>${LANGS[r.lang] || esc(r.lang)}</td>
        <td>${del}</td>
      </tr>`;
    }).join("");
  }

  $("rows").addEventListener("click", async e => {
    const ask = e.target.closest("[data-ask]"), del = e.target.closest("[data-del]"), cancel = e.target.closest("[data-cancel]");
    if (ask) { confirmId = +ask.dataset.ask; render(); }
    else if (cancel) { confirmId = null; render(); }
    else if (del) {
      const id = +del.dataset.del;
      const res = await fetch("/api/admin/results?id=" + id, { method: "DELETE" });
      if (res.ok) { rows = rows.filter(r => r.id !== id); totalAll--; }
      confirmId = null; render();
    }
  });

  function csv() {
    const head = ["id", "created_at", "name", "dob", "age", "primary", "secondary", "D_pct", "I_pct", "S_pct", "C_pct", "D", "I", "S", "C", "total", "mode", "lang"];
    const cell = v => { v = String(v == null ? "" : v); return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v; };
    const lines = rows.map(r => [r.id, r.created_at, r.name, r.dob, age(r.dob), r.primary_style, r.secondary_style || "",
      pct(r, "D"), pct(r, "I"), pct(r, "S"), pct(r, "C"), r.d, r.i, r.s, r.c, r.total, r.mode, r.lang].map(cell).join(","));
    const blob = new Blob(["﻿" + [head.join(","), ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `disc-results-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  let timer;
  $("q").addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(load, 300); });
  $("reload").onclick = load;
  $("csv").onclick = csv;
  fetch("/auth/me").then(r => r.ok ? r.json() : null).then(u => { if (u) $("me").textContent = u.email; }).catch(() => {});
  load();
})();
