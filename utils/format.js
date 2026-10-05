function money(value) {
  return `¥${Number(value || 0).toFixed(2)}`
}

function maskId(value) {
  if (!value) return "未填写"
  return value.length > 8 ? `${value.slice(0, 4)}********${value.slice(-4)}` : value
}

function statusColor(status) {
  const colors = {
    pending_payment: "#B45309",
    paid: "#0F766E",
    shipped: "#2563EB",
    completed: "#64748B",
    cancelled: "#94A3B8",
    pending_review: "#B45309",
    approved: "#0F766E",
    rejected: "#B91C1C"
  }
  return colors[status] || "#64748B"
}

module.exports = { money, maskId, statusColor }
