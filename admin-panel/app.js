const state = {
  accessToken: localStorage.getItem("admin_access_token") || "",
  refreshToken: localStorage.getItem("admin_refresh_token") || "",
  currentUser: null,
  selectedUserId: null
};

const loginCard = document.getElementById("loginCard");
const panel = document.getElementById("panel");
const loginStatus = document.getElementById("loginStatus");
const usersBody = document.getElementById("usersBody");
const recentLogins = document.getElementById("recentLogins");
const auditList = document.getElementById("auditList");
const ipBanList = document.getElementById("ipBanList");
const adminIdentity = document.getElementById("adminIdentity");
const userDialog = document.getElementById("userDialog");
const userDetail = document.getElementById("userDetail");
const statTotal = document.getElementById("statTotal");
const statActive = document.getElementById("statActive");
const statBanned = document.getElementById("statBanned");

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatDate(value) {
  return value ? new Date(value).toLocaleString("tr-TR") : "-";
}

function setLoginStatus(message, isError = true) {
  loginStatus.textContent = message;
  loginStatus.style.color = isError ? "#b91c1c" : "#0f766e";
}

function statusBadge(user) {
  if (user.isBanned) return '<span class="badge danger">Banlı</span>';
  if (!user.isActive) return '<span class="badge warn">Pasif</span>';
  return '<span class="badge">Aktif</span>';
}

function saveTokens(accessToken, refreshToken) {
  state.accessToken = accessToken || "";
  state.refreshToken = refreshToken || state.refreshToken;
  if (state.accessToken) localStorage.setItem("admin_access_token", state.accessToken);
  else localStorage.removeItem("admin_access_token");
  if (state.refreshToken) localStorage.setItem("admin_refresh_token", state.refreshToken);
  else localStorage.removeItem("admin_refresh_token");
}

async function api(path, options = {}, retry = true) {
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  if (state.accessToken) headers.Authorization = `Bearer ${state.accessToken}`;

  const response = await fetch(path, { ...options, headers });
  if (response.status === 401 && retry && state.refreshToken) {
    const refreshed = await refreshAccessToken();
    if (refreshed) return api(path, options, false);
  }

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(payload?.error || `${response.status}`);
  }
  return response.status === 204 ? null : response.json();
}

async function refreshAccessToken() {
  if (!state.refreshToken) return false;
  try {
    const result = await fetch("/api/auth/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: state.refreshToken })
    });
    if (!result.ok) {
      saveTokens("", "");
      return false;
    }
    const data = await result.json();
    saveTokens(data.accessToken, state.refreshToken);
    return true;
  } catch {
    return false;
  }
}

async function checkSession() {
  if (!state.accessToken) return false;
  try {
    const me = await api("/api/auth/me");
    if (me.user.role !== "ADMIN") {
      saveTokens("", "");
      return false;
    }
    state.currentUser = me.user;
    return true;
  } catch {
    saveTokens("", "");
    return false;
  }
}

function renderUsers(users) {
  usersBody.innerHTML = "";
  for (const user of users) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><strong>${escapeHtml(user.username)}</strong><br><span class="muted">${escapeHtml(user.id)}</span></td>
      <td>${escapeHtml(user.role)}</td>
      <td>${statusBadge(user)}</td>
      <td>${formatDate(user.lastLoginAt)}</td>
      <td>${escapeHtml(user.lastIp || "-")}<br><span class="muted">${escapeHtml(user.deviceInfo || "-")}</span></td>
      <td><button data-user-id="${escapeHtml(user.id)}">Detay</button></td>
    `;
    tr.querySelector("button").addEventListener("click", () => openUserDetail(user.id));
    usersBody.appendChild(tr);
  }
}

function renderRecentLogins(items) {
  recentLogins.innerHTML = "";
  for (const item of items) {
    const li = document.createElement("li");
    li.innerHTML = `<strong>${escapeHtml(item.username)}</strong><br>${formatDate(item.lastLoginAt)}<br><span class="muted">${escapeHtml(item.lastIp || "-")}</span>`;
    recentLogins.appendChild(li);
  }
}

function renderAuditLogs(logs) {
  auditList.innerHTML = "";
  for (const log of logs) {
    const li = document.createElement("li");
    li.innerHTML = `<strong>${escapeHtml(log.action)}</strong><br>${formatDate(log.created_at)}<br><span class="muted">hedef=${escapeHtml(log.target_user_id || "-")} | ip=${escapeHtml(log.ip_address || "-")}</span>`;
    auditList.appendChild(li);
  }
}

function renderIpBans(items) {
  ipBanList.innerHTML = "";
  for (const item of items) {
    const li = document.createElement("li");
    li.innerHTML = `<strong>${escapeHtml(item.ipAddress)}</strong><br><span class="muted">${escapeHtml(item.reason || "Sebep yok")}</span>`;
    const removeBtn = document.createElement("button");
    removeBtn.className = "danger";
    removeBtn.textContent = "Kaldır";
    removeBtn.style.width = "auto";
    removeBtn.style.marginTop = "8px";
    removeBtn.addEventListener("click", async () => {
      await api(`/api/admin/ip-bans/${item.id}`, { method: "DELETE" });
      await loadIpBans();
    });
    li.appendChild(removeBtn);
    ipBanList.appendChild(li);
  }
}

async function loadStats() {
  const data = await api("/api/admin/stats");
  statTotal.textContent = String(data.totalUsers);
  statActive.textContent = String(data.activeUsers);
  statBanned.textContent = String(data.bannedUsers);
  renderRecentLogins(data.recentLogins || []);
}

async function loadUsers(search = "") {
  const suffix = search ? `?q=${encodeURIComponent(search)}` : "";
  const data = await api(`/api/admin/users${suffix}`);
  renderUsers(data.users || []);
}

async function loadLogs() {
  const data = await api("/api/admin/audit-logs");
  renderAuditLogs(data.logs || []);
}

async function loadIpBans() {
  const data = await api("/api/admin/ip-bans");
  renderIpBans(data.items || []);
}

async function loadDashboard() {
  await Promise.all([loadStats(), loadUsers(), loadLogs(), loadIpBans()]);
}

async function openUserDetail(userId) {
  state.selectedUserId = userId;
  const data = await api(`/api/admin/users/${userId}`);
  const user = data.user;
  const sessions = Array.isArray(data.sessions) ? data.sessions : [];
  const attempts = Array.isArray(data.loginAttempts) ? data.loginAttempts : [];
  const notes = Array.isArray(data.adminNotes) ? data.adminNotes : [];

  userDetail.innerHTML = `
    <div class="detail-grid">
      <div class="detail-item"><strong>Kullanıcı</strong>${escapeHtml(user.username)}</div>
      <div class="detail-item"><strong>Rol</strong>${escapeHtml(user.role)}</div>
      <div class="detail-item"><strong>Durum</strong>${statusBadge(user)}</div>
      <div class="detail-item"><strong>Ban sebebi</strong>${escapeHtml(user.banReason || "-")}</div>
      <div class="detail-item"><strong>Kayıt tarihi</strong>${formatDate(user.createdAt)}</div>
      <div class="detail-item"><strong>Son giriş</strong>${formatDate(user.lastLoginAt)}</div>
      <div class="detail-item"><strong>Son IP</strong>${escapeHtml(user.lastIp || "-")}</div>
      <div class="detail-item"><strong>Cihaz</strong>${escapeHtml(user.deviceInfo || "-")}</div>
    </div>
    <h4>Oturum Geçmişi</h4>
    <div class="session-grid">
      ${sessions.slice(0, 8).map((session) => `
        <div class="detail-item">
          <strong>${session.revokedAt ? "Sonlanmış oturum" : "Aktif oturum"}</strong>
          IP: ${escapeHtml(session.ipAddress || "-")}<br>
          Cihaz: ${escapeHtml(session.deviceInfo || "-")}<br>
          Başlangıç: ${formatDate(session.createdAt)}<br>
          Bitiş: ${session.revokedAt ? formatDate(session.revokedAt) : "-"}
        </div>
      `).join("") || '<div class="detail-item">Oturum kaydı yok.</div>'}
    </div>
    <h4>Giriş Denemeleri</h4>
    <div class="session-grid">
      ${attempts.slice(0, 8).map((attempt) => `
        <div class="detail-item">
          <strong>${attempt.success ? "Başarılı" : "Başarısız"}</strong>
          IP: ${escapeHtml(attempt.ipAddress || "-")}<br>
          Sebep: ${escapeHtml(attempt.failReason || "-")}<br>
          Tarih: ${formatDate(attempt.createdAt)}
        </div>
      `).join("") || '<div class="detail-item">Giriş denemesi yok.</div>'}
    </div>
    <h4>Admin Notları</h4>
    <div class="session-grid">
      ${notes.slice(0, 8).map((note) => `
        <div class="detail-item">
          <strong>${formatDate(note.createdAt)}</strong>
          ${escapeHtml(note.note)}
        </div>
      `).join("") || '<div class="detail-item">Admin notu yok.</div>'}
    </div>
  `;
  userDialog.showModal();
}

async function performUserAction(path, body) {
  if (!state.selectedUserId) return;
  await api(path.replace(":id", state.selectedUserId), {
    method: "POST",
    body: body ? JSON.stringify(body) : undefined
  });
  await loadDashboard();
  await openUserDetail(state.selectedUserId);
}

async function doDeleteUserData() {
  if (!state.selectedUserId) return;
  if (!confirm("Kullanıcının puantaj verileri silinsin mi?")) return;
  await api(`/api/admin/users/${state.selectedUserId}/data`, { method: "DELETE" });
  await loadDashboard();
  userDialog.close();
}

async function doLogin() {
  const username = document.getElementById("username").value.trim();
  const password = document.getElementById("password").value;
  if (!username || !password) {
    setLoginStatus("Kullanıcı adı ve şifre zorunlu.");
    return;
  }

  setLoginStatus("Giriş yapılıyor...", false);
  try {
    const data = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password })
    });
    if (!data.ok) {
      const err = await data.json().catch(() => ({ error: "Giriş başarısız." }));
      throw new Error(err.error || "Giriş başarısız.");
    }

    const payload = await data.json();
    if (!payload.user || payload.user.role !== "ADMIN") {
      throw new Error("Bu hesap admin yetkisine sahip değil.");
    }

    saveTokens(payload.accessToken, payload.refreshToken);
    state.currentUser = payload.user;
    adminIdentity.textContent = `${payload.user.username} (${payload.user.role})`;
    loginCard.classList.add("hidden");
    panel.classList.remove("hidden");
    setLoginStatus("", false);
    await loadDashboard();
  } catch (error) {
    setLoginStatus(error.message || "Giriş başarısız.");
  }
}

async function doLogout() {
  try {
    if (state.accessToken) await api("/api/auth/logout", { method: "POST" }, false);
  } catch {
    // no-op
  }
  saveTokens("", "");
  state.currentUser = null;
  panel.classList.add("hidden");
  loginCard.classList.remove("hidden");
}

document.getElementById("loginBtn").addEventListener("click", doLogin);
document.getElementById("logoutBtn").addEventListener("click", doLogout);
document.getElementById("refreshUsersBtn").addEventListener("click", () => loadUsers());
document.getElementById("searchBtn").addEventListener("click", () => loadUsers(document.getElementById("searchInput").value.trim()));
document.getElementById("refreshLogsBtn").addEventListener("click", loadLogs);
document.getElementById("addIpBanBtn").addEventListener("click", async () => {
  const ipAddress = document.getElementById("ipBanInput").value.trim();
  const reason = document.getElementById("ipBanReasonInput").value.trim();
  if (!ipAddress) {
    alert("IP alanı boş olamaz.");
    return;
  }
  await api("/api/admin/ip-bans", { method: "POST", body: JSON.stringify({ ipAddress, reason }) });
  document.getElementById("ipBanInput").value = "";
  document.getElementById("ipBanReasonInput").value = "";
  await loadIpBans();
});

document.getElementById("banBtn").addEventListener("click", async () => {
  const reason = prompt("Ban sebebini yaz:", "Politika ihlali") || "Sebep belirtilmedi";
  await performUserAction("/api/admin/users/:id/ban", { reason });
});
document.getElementById("unbanBtn").addEventListener("click", () => performUserAction("/api/admin/users/:id/unban"));
document.getElementById("disableBtn").addEventListener("click", () => performUserAction("/api/admin/users/:id/disable"));
document.getElementById("enableBtn").addEventListener("click", () => performUserAction("/api/admin/users/:id/enable"));
document.getElementById("revokeBtn").addEventListener("click", () => performUserAction("/api/admin/users/:id/revoke-sessions"));
document.getElementById("deleteDataBtn").addEventListener("click", doDeleteUserData);
document.getElementById("closeDialogBtn").addEventListener("click", () => userDialog.close());

(async () => {
  const ok = await checkSession();
  if (ok && state.currentUser && state.currentUser.role === "ADMIN") {
    adminIdentity.textContent = `${state.currentUser.username} (${state.currentUser.role})`;
    loginCard.classList.add("hidden");
    panel.classList.remove("hidden");
    await loadDashboard();
  }
})();
