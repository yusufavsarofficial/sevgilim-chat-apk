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

function setLoginStatus(message, isError = true) {
  loginStatus.textContent = message;
  loginStatus.style.color = isError ? "#b91c1c" : "#0f766e";
}

function saveTokens(accessToken, refreshToken) {
  state.accessToken = accessToken || "";
  state.refreshToken = refreshToken || state.refreshToken;
  if (state.accessToken) {
    localStorage.setItem("admin_access_token", state.accessToken);
  } else {
    localStorage.removeItem("admin_access_token");
  }

  if (state.refreshToken) {
    localStorage.setItem("admin_refresh_token", state.refreshToken);
  } else {
    localStorage.removeItem("admin_refresh_token");
  }
}

async function api(path, options = {}, retry = true) {
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {})
  };

  if (state.accessToken) {
    headers.Authorization = `Bearer ${state.accessToken}`;
  }

  const response = await fetch(path, { ...options, headers });
  if (response.status === 401 && retry && state.refreshToken) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      return api(path, options, false);
    }
  }

  if (!response.ok) {
    let errorText = `${response.status}`;
    try {
      const data = await response.json();
      errorText = data.error || errorText;
    } catch {
      try {
        errorText = await response.text();
      } catch {
        errorText = `${response.status}`;
      }
    }
    throw new Error(errorText);
  }

  if (response.status === 204) {
    return null;
  }
  return response.json();
}

async function refreshAccessToken() {
  if (!state.refreshToken) {
    return false;
  }

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
  if (!state.accessToken) {
    return false;
  }
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
    const statusLabel = `${user.isActive ? "Aktif" : "Pasif"} / ${user.isBanned ? "Banlı" : "Ban Yok"}`;
    tr.innerHTML = `
      <td>${user.username}</td>
      <td>${user.role}</td>
      <td>${statusLabel}</td>
      <td>${user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString("tr-TR") : "-"}</td>
      <td>${user.lastIp || "-"}</td>
      <td><button data-user-id="${user.id}">Detay</button></td>
    `;
    const btn = tr.querySelector("button");
    btn.addEventListener("click", () => openUserDetail(user.id));
    usersBody.appendChild(tr);
  }
}

function renderRecentLogins(items) {
  recentLogins.innerHTML = "";
  for (const item of items) {
    const li = document.createElement("li");
    const loginText = item.lastLoginAt ? new Date(item.lastLoginAt).toLocaleString("tr-TR") : "-";
    li.textContent = `${item.username} | ${loginText} | ${item.lastIp || "-"}`;
    recentLogins.appendChild(li);
  }
}

function renderAuditLogs(logs) {
  auditList.innerHTML = "";
  for (const log of logs) {
    const li = document.createElement("li");
    li.textContent = `[${new Date(log.created_at).toLocaleString("tr-TR")}] ${log.action} | hedef=${log.target_user_id || "-"} | ip=${log.ip_address || "-"}`;
    auditList.appendChild(li);
  }
}

function renderIpBans(items) {
  ipBanList.innerHTML = "";
  for (const item of items) {
    const li = document.createElement("li");
    const removeBtn = document.createElement("button");
    removeBtn.className = "danger";
    removeBtn.textContent = "Kaldır";
    removeBtn.style.width = "auto";
    removeBtn.style.marginLeft = "8px";
    removeBtn.addEventListener("click", async () => {
      await api(`/api/admin/ip-bans/${item.id}`, { method: "DELETE" });
      await loadIpBans();
    });
    li.textContent = `${item.ipAddress} | ${item.reason || "Sebep yok"}`;
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

  userDetail.innerHTML = `
    <p><strong>Kullanıcı:</strong> ${user.username}</p>
    <p><strong>Rol:</strong> ${user.role}</p>
    <p><strong>Durum:</strong> ${user.isActive ? "Aktif" : "Pasif"} / ${user.isBanned ? "Banlı" : "Ban Yok"}</p>
    <p><strong>Ban sebebi:</strong> ${user.banReason || "-"}</p>
    <p><strong>Son giriş:</strong> ${user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString("tr-TR") : "-"}</p>
    <p><strong>IP:</strong> ${user.lastIp || "-"}</p>
    <p><strong>Cihaz:</strong> ${user.deviceInfo || "-"}</p>
    <p><strong>Aktif oturum sayısı:</strong> ${Array.isArray(data.sessions) ? data.sessions.filter((x) => !x.revokedAt).length : 0}</p>
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
  const ok = confirm("Kullanıcının puantaj verileri silinsin mi?");
  if (!ok) return;
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
    if (state.accessToken) {
      await api("/api/auth/logout", { method: "POST" }, false);
    }
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
document.getElementById("searchBtn").addEventListener("click", () => {
  const q = document.getElementById("searchInput").value.trim();
  loadUsers(q);
});
document.getElementById("refreshLogsBtn").addEventListener("click", loadLogs);

document.getElementById("addIpBanBtn").addEventListener("click", async () => {
  const ipAddress = document.getElementById("ipBanInput").value.trim();
  const reason = document.getElementById("ipBanReasonInput").value.trim();
  if (!ipAddress) {
    alert("IP alanı boş olamaz.");
    return;
  }
  await api("/api/admin/ip-bans", {
    method: "POST",
    body: JSON.stringify({ ipAddress, reason })
  });
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