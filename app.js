const TABLE_BODY = document.getElementById("gpu-table");
const LAST_UPDATED = document.getElementById("last-updated");
const NEXT_UPDATE = document.getElementById("next-update");

const searchInput = document.getElementById("search");
const manufacturerSelect = document.getElementById("manufacturer");
const perfMinInput = document.getElementById("perf-min");
const priceMaxInput = document.getElementById("price-max");
const sortSelect = document.getElementById("sort");

const REFRESH_INTERVAL = 12 * 60 * 60 * 1000;
let gpuCache = [];
let mepRate = null;

const formatCurrency = (value, currency) => {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "-";
  }
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency,
    maximumFractionDigits: currency === "ARS" ? 0 : 2,
  }).format(value);
};

const formatNumber = (value, digits = 2) => {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "-";
  }
  return Number(value).toFixed(digits);
};

const pickMinPrice = (pcpp, amazon) => {
  if (pcpp && amazon) {
    return Math.min(pcpp, amazon);
  }
  return pcpp ?? amazon ?? null;
};

const isStale = (timestamp) => {
  if (!timestamp) return true;
  const diff = Date.now() - new Date(timestamp).getTime();
  return diff > REFRESH_INTERVAL;
};

const computeRow = (gpu) => {
  const pcppPrice = gpu.price_usd_pcpartpicker?.price ?? null;
  const amazonPrice = gpu.price_usd_amazon?.price ?? null;
  const arsPrice = gpu.price_ars_min_whitelist?.price ?? null;
  const priceUsdFinal = pickMinPrice(pcppPrice, amazonPrice);
  const arsToUsd = arsPrice && mepRate ? arsPrice / mepRate : null;
  const perfScore = gpu.relative_performance_tpu * 10;

  return {
    ...gpu,
    priceUsdFinal,
    arsToUsd,
    valueUsdCurrent: priceUsdFinal ? perfScore / priceUsdFinal : null,
    valueUsdMsrp: gpu.msrp_usd ? perfScore / gpu.msrp_usd : null,
    valueArsCurrent: arsPrice ? perfScore / arsPrice : null,
  };
};

const renderTable = () => {
  const search = searchInput.value.toLowerCase();
  const manufacturer = manufacturerSelect.value;
  const perfMin = Number(perfMinInput.value) || 0;
  const priceMax = Number(priceMaxInput.value) || Infinity;
  const sortKey = sortSelect.value;

  const rows = gpuCache
    .filter((gpu) => gpu.model_name.toLowerCase().includes(search))
    .filter((gpu) => (manufacturer ? gpu.manufacturer === manufacturer : true))
    .filter((gpu) => gpu.relative_performance_tpu >= perfMin)
    .filter((gpu) => (gpu.priceUsdFinal ?? Infinity) <= priceMax)
    .sort((a, b) => (b[sortKey] ?? 0) - (a[sortKey] ?? 0));

  TABLE_BODY.innerHTML = rows
    .map((gpu) => {
      const badgeClass = gpu.manufacturer.toLowerCase();
      const pcppTimestamp = gpu.price_usd_pcpartpicker?.timestamp;
      const amazonTimestamp = gpu.price_usd_amazon?.timestamp;
      const arsTimestamp = gpu.price_ars_min_whitelist?.timestamp;
      const staleRow = isStale(arsTimestamp || amazonTimestamp || pcppTimestamp);

      return `
        <tr>
          <td><img src="${gpu.image_url}" alt="${gpu.model_name}" /></td>
          <td><span class="badge ${badgeClass}">${gpu.manufacturer}</span></td>
          <td>${gpu.model_name}</td>
          <td>${formatNumber(gpu.relative_performance_tpu, 0)}</td>
          <td>${formatCurrency(gpu.msrp_usd, "USD")}</td>
          <td>${formatCurrency(gpu.price_usd_pcpartpicker?.price, "USD")}</td>
          <td>${formatCurrency(gpu.price_usd_amazon?.price, "USD")}</td>
          <td><span class="value-chip">${formatCurrency(gpu.priceUsdFinal, "USD")}</span></td>
          <td>${formatCurrency(gpu.price_ars_min_whitelist?.price, "ARS")}</td>
          <td>${formatCurrency(gpu.arsToUsd, "USD")}</td>
          <td>${formatNumber(gpu.valueUsdCurrent)}</td>
          <td>${formatNumber(gpu.valueUsdMsrp)}</td>
          <td>${formatNumber(gpu.valueArsCurrent, 4)}</td>
          <td class="sources">
            <a href="${gpu.price_usd_pcpartpicker?.source_url}" target="_blank" rel="noreferrer">PCPP</a>
            <a href="${gpu.price_usd_amazon?.source_url}" target="_blank" rel="noreferrer">Amazon</a>
            <a href="${gpu.price_ars_min_whitelist?.source_url}" target="_blank" rel="noreferrer">${gpu.price_ars_min_whitelist?.store}</a>
            ${staleRow ? "<span class='stale'>Stale</span>" : ""}
          </td>
        </tr>
      `;
    })
    .join("");
};

const updateRefreshTimes = (latestTimestamp) => {
  if (!latestTimestamp) {
    LAST_UPDATED.textContent = "--";
    NEXT_UPDATE.textContent = "--";
    return;
  }
  const lastDate = new Date(latestTimestamp);
  LAST_UPDATED.textContent = lastDate.toLocaleString("es-AR");
  const nextDate = new Date(lastDate.getTime() + REFRESH_INTERVAL);
  NEXT_UPDATE.textContent = nextDate.toLocaleString("es-AR");
};

const loadData = async () => {
  const response = await fetch("data/gpus.json");
  const payload = await response.json();
  mepRate = payload.mep?.rate ?? null;

  gpuCache = payload.gpus.map(computeRow);

  const timestamps = payload.gpus
    .flatMap((gpu) => [
      gpu.price_usd_pcpartpicker?.timestamp,
      gpu.price_usd_amazon?.timestamp,
      gpu.price_ars_min_whitelist?.timestamp,
    ])
    .filter(Boolean)
    .map((stamp) => new Date(stamp).getTime());

  const latestTimestamp = timestamps.length ? new Date(Math.max(...timestamps)) : null;
  updateRefreshTimes(latestTimestamp ? latestTimestamp.toISOString() : null);
  renderTable();
};

const scheduleRefresh = () => {
  setInterval(() => {
    loadData().catch((error) => console.error("Error refreshing data", error));
  }, REFRESH_INTERVAL);
};

[searchInput, manufacturerSelect, perfMinInput, priceMaxInput, sortSelect].forEach((el) => {
  el.addEventListener("input", renderTable);
  el.addEventListener("change", renderTable);
});

loadData().catch((error) => console.error("Error loading data", error));
scheduleRefresh();
