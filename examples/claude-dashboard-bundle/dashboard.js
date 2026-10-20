const list = root.querySelector(".bars");
const status = root.querySelector(".status");
const clear = root.querySelector(".clear");

function render() {
  const source = dash.data("sales");
  list.replaceChildren();
  if (source.status !== "ok") {
    status.textContent = source.message || "Waiting for governed data…";
    return;
  }
  const rows = source.data;
  const maximum = d3.max(rows, (row) => row.total_sales) || 1;
  status.textContent = `${rows.length} categories loaded`;
  for (const row of rows) {
    const item = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.className = "bar-row";
    button.setAttribute("aria-label", `Filter to ${row.category}`);
    const label = document.createElement("span");
    label.textContent = row.category;
    const track = document.createElement("span");
    track.className = "track";
    const bar = document.createElement("span");
    bar.className = "bar";
    bar.style.width = `${Math.max(2, row.total_sales / maximum * 100)}%`;
    track.appendChild(bar);
    const value = document.createElement("strong");
    value.textContent = dash.format(row.total_sales, { style: "currency", currency: "AUD", decimals: 0 });
    button.append(label, track, value);
    button.addEventListener("click", () => dash.setParams({ category: row.category }));
    item.appendChild(button);
    list.appendChild(item);
  }
}

const unsubscribe = dash.onData(render);
clear.addEventListener("click", () => dash.resetParams());
return () => unsubscribe();
