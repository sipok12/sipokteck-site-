const $ = s => document.querySelector(s);
let projectsCache = [];
let csrfToken = "";

async function api(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.method && options.method !== "GET" && csrfToken ? { "X-CSRF-Token": csrfToken } : {}),
      ...(options.headers || {})
    }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401 && !url.includes("/login")) showLogin();
    throw new Error(data.error || "Une erreur est survenue.");
  }
  return data;
}
function setFeedback(selector, message, error = false) {
  const el = $(selector);
  if (!el) return;
  el.textContent = message;
  el.classList.toggle("error", error);
}
function showLogin() {
  $("#login-view").hidden = false;
  $("#dashboard").hidden = true;
}
function showDashboard(admin) {
  $("#login-view").hidden = true;
  $("#dashboard").hidden = false;
  $("#admin-name").textContent = admin.name || "Administrateur";
  loadProjects();
}
async function checkSession() {
  try {
    const data = await api("/api/admin/me");
    csrfToken = data.csrfToken || "";
    showDashboard(data.admin);
  } catch { showLogin(); }
}
$("#login-form").addEventListener("submit", async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector("button");
  button.disabled = true;
  setFeedback("#login-feedback", "Connexion en cours…");
  try {
    const body = Object.fromEntries(new FormData(form).entries());
    const data = await api("/api/admin/login", { method: "POST", body: JSON.stringify(body) });
    form.reset();
    csrfToken = data.csrfToken || "";
    showDashboard(data.admin);
  } catch (error) { setFeedback("#login-feedback", error.message, true); }
  finally { button.disabled = false; }
});
$("#logout-button").addEventListener("click", async () => {
  try { await api("/api/admin/logout", { method: "POST" }); showLogin(); }
  catch (error) { alert(error.message); }
});
document.querySelectorAll(".tab").forEach(tab => tab.addEventListener("click", async () => {
  document.querySelectorAll(".tab").forEach(t => {
    const active = t === tab;
    t.classList.toggle("active", active);
    t.setAttribute("aria-selected", String(active));
  });
  const projectsActive = tab.dataset.tab === "projects";
  $("#projects-panel").hidden = !projectsActive;
  $("#messages-panel").hidden = projectsActive;
  if (!projectsActive) await loadMessages();
}));

function resetProjectForm() {
  $("#project-form").reset();
  $("#project-form").elements.id.value = "";
  $("#project-form").elements.icon.value = "💻";
  $("#project-form").elements.demo.checked = true;
  $("#project-form-title").textContent = "Ajouter un projet";
  setFeedback("#project-feedback", "");
}
$("#new-project").addEventListener("click", () => {
  resetProjectForm();
  $("#project-form").hidden = false;
  $("#project-form").scrollIntoView({ behavior: "smooth", block: "start" });
});
$("#cancel-edit").addEventListener("click", () => { $("#project-form").hidden = true; resetProjectForm(); });

$("#project-form").addEventListener("submit", async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector('button[type="submit"]');
  const raw = Object.fromEntries(new FormData(form).entries());
  const id = raw.id;
  const body = {
    title: raw.title, category: raw.category, description: raw.description,
    url: raw.url, icon: raw.icon || "💻",
    featured: form.elements.featured.checked, demo: form.elements.demo.checked
  };
  button.disabled = true;
  try {
    await api(id ? `/api/admin/projects/${encodeURIComponent(id)}` : "/api/admin/projects", {
      method: id ? "PUT" : "POST", body: JSON.stringify(body)
    });
    $("#project-form").hidden = true;
    resetProjectForm();
    await loadProjects();
  } catch (error) { setFeedback("#project-feedback", error.message, true); }
  finally { button.disabled = false; }
});

async function loadProjects() {
  const list = $("#projects-list");
  list.replaceChildren();
  try {
    const data = await api("/api/projects");
    projectsCache = data.projects || [];
    if (!projectsCache.length) { list.textContent = "Aucun projet pour le moment."; return; }
    projectsCache.forEach(project => {
      const item = document.createElement("article");
      item.className = "admin-item";
      const main = document.createElement("div"); main.className = "item-main";
      const title = document.createElement("p"); title.className = "item-title"; title.textContent = `${project.icon || "💻"} ${project.title}`;
      const meta = document.createElement("div"); meta.className = "item-meta";
      meta.textContent = `${project.category} · ${project.featured ? "À LA UNE" : "Standard"} · ${project.demo ? "DÉMO" : "PROJET"}`;
      const description = document.createElement("p"); description.className = "item-description"; description.textContent = project.description;
      main.append(title, meta, description);
      const actions = document.createElement("div"); actions.className = "item-actions";
      const edit = document.createElement("button"); edit.className = "small-button"; edit.textContent = "Modifier";
      edit.addEventListener("click", () => editProject(project.id));
      const del = document.createElement("button"); del.className = "small-button danger"; del.textContent = "Supprimer";
      del.addEventListener("click", () => deleteProject(project.id, project.title));
      actions.append(edit, del); item.append(main, actions); list.append(item);
    });
  } catch (error) { list.textContent = error.message; }
}
function editProject(id) {
  const project = projectsCache.find(p => String(p.id) === String(id));
  if (!project) return;
  const form = $("#project-form");
  form.hidden = false;
  form.elements.id.value = project.id;
  form.elements.title.value = project.title;
  form.elements.category.value = project.category;
  form.elements.description.value = project.description;
  form.elements.url.value = project.url || "";
  form.elements.icon.value = project.icon || "💻";
  form.elements.featured.checked = Boolean(project.featured);
  form.elements.demo.checked = Boolean(project.demo);
  $("#project-form-title").textContent = "Modifier le projet";
  setFeedback("#project-feedback", "");
  form.scrollIntoView({ behavior: "smooth", block: "start" });
}
async function deleteProject(id, title) {
  if (!confirm(`Supprimer « ${title} » ? Cette action est définitive.`)) return;
  try { await api(`/api/admin/projects/${encodeURIComponent(id)}`, { method: "DELETE" }); await loadProjects(); }
  catch (error) { alert(error.message); }
}
$("#refresh-messages").addEventListener("click", loadMessages);
async function loadMessages() {
  const list = $("#messages-list");
  list.replaceChildren();
  try {
    const data = await api("/api/admin/messages?limit=100");
    if (!(data.messages || []).length) { list.textContent = "Aucun message reçu pour le moment."; return; }
    data.messages.forEach(message => {
      const item = document.createElement("article"); item.className = "admin-item";
      const main = document.createElement("div"); main.className = "item-main";
      const title = document.createElement("p"); title.className = "item-title"; title.textContent = message.subject;
      const meta = document.createElement("div"); meta.className = "item-meta";
      meta.textContent = `${message.name} · ${new Date(message.created_at).toLocaleString("fr-FR")}`;
      const email = document.createElement("a"); email.className = "message-email"; email.href = `mailto:${message.email}`; email.textContent = message.email;
      const body = document.createElement("p"); body.className = "item-description"; body.textContent = message.message;
      main.append(title, meta, email, body);
      const actions = document.createElement("div"); actions.className = "item-actions";
      const select = document.createElement("select"); select.className = "status-select"; select.setAttribute("aria-label", `Statut du message ${message.id}`);
      ["nouveau", "lu", "traité"].forEach(status => {
        const option = document.createElement("option"); option.value = status; option.textContent = status; option.selected = status === message.status; select.append(option);
      });
      select.addEventListener("change", async () => {
        select.disabled = true;
        try { await api(`/api/admin/messages/${encodeURIComponent(message.id)}`, { method: "PATCH", body: JSON.stringify({ status: select.value }) }); }
        catch (error) { alert(error.message); }
        finally { select.disabled = false; }
      });
      actions.append(select); item.append(main, actions); list.append(item);
    });
  } catch (error) { list.textContent = error.message; }
}
checkSession();
