const $ = (selector) => document.querySelector(selector);

async function loadConfig() {
  try {
    const response = await fetch("/api/config");
    if (!response.ok) throw new Error("Configuration indisponible");
    const config = await response.json();
    const email = $("#contact-email");
    const wa = $("#contact-wa");
    const heroWa = $("#hero-whatsapp");
    if (email) {
      email.href = `mailto:${config.email}`;
      email.querySelector("strong").textContent = config.email;
    }
    if (wa) {
      wa.href = `https://wa.me/${config.whatsappPrimary}`;
      wa.querySelector("strong").textContent = `+${config.whatsappPrimary}`;
    }
    if (heroWa) heroWa.href = `https://wa.me/${config.whatsappPrimary}`;
  } catch (error) {
    console.warn(error.message);
  }
}

function renderProjects(projects) {
  const grid = $("#project-grid");
  if (!projects.length) {
    grid.innerHTML = '<div class="empty-state">Les projets seront bientôt ajoutés. Vous pouvez me contacter pour en savoir plus.</div>';
    return;
  }
  grid.replaceChildren();
  projects.forEach(project => {
    const article = document.createElement("article");
    article.className = "project-card";
    const art = document.createElement("div");
    art.className = "project-art";
    const icon = document.createElement("span");
    icon.textContent = project.icon || "💻";
    art.append(icon);
    const content = document.createElement("div");
    content.className = "project-content";
    const tags = document.createElement("div");
    tags.className = "project-tags";
    const category = document.createElement("span");
    category.textContent = project.category;
    tags.append(category);
    if (project.featured) {
      const featured = document.createElement("span");
      featured.textContent = "À LA UNE";
      tags.append(featured);
    }
    const title = document.createElement("h3");
    title.textContent = project.title;
    const description = document.createElement("p");
    description.textContent = project.description;
    const footer = document.createElement("div");
    footer.className = "project-footer";
    const label = document.createElement("span");
    label.textContent = project.demo ? "Projet de démonstration" : "Projet";
    footer.append(label);
    if (project.url) {
      try {
        const parsed = new URL(project.url);
        if (["http:", "https:"].includes(parsed.protocol)) {
          const link = document.createElement("a");
          link.href = parsed.href;
          link.target = "_blank";
          link.rel = "noopener noreferrer";
          link.textContent = "Voir le projet ↗";
          footer.append(link);
        }
      } catch {}
    }
    content.append(tags, title, description, footer);
    article.append(art, content);
    grid.append(article);
  });
}

async function loadProjects() {
  const grid = $("#project-grid");
  try {
    const response = await fetch("/api/projects");
    if (!response.ok) throw new Error("Impossible de charger les projets.");
    const data = await response.json();
    renderProjects(data.projects || []);
  } catch {
    grid.innerHTML = '<div class="empty-state">Les projets ne peuvent pas être chargés pour le moment. Réessayez plus tard.</div>';
  }
}

const menuToggle = $("#menu-toggle");
const nav = $("#nav-links");
menuToggle?.addEventListener("click", () => {
  const open = nav.classList.toggle("open");
  menuToggle.setAttribute("aria-expanded", String(open));
  menuToggle.setAttribute("aria-label", open ? "Fermer le menu" : "Ouvrir le menu");
  menuToggle.textContent = open ? "✕" : "☰";
});
nav?.querySelectorAll("a").forEach(link => link.addEventListener("click", () => {
  nav.classList.remove("open");
  menuToggle?.setAttribute("aria-expanded", "false");
  if (menuToggle) { menuToggle.textContent = "☰"; menuToggle.setAttribute("aria-label", "Ouvrir le menu"); }
}));

const skillObserver = new IntersectionObserver(entries => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.querySelectorAll(".skill-track span").forEach(bar => { bar.style.width = bar.dataset.width; });
      skillObserver.unobserve(entry.target);
    }
  });
}, { threshold: 0.2 });
const skills = document.querySelector(".skill-panel");
if (skills && "IntersectionObserver" in window) skillObserver.observe(skills);
else document.querySelectorAll(".skill-track span").forEach(bar => { bar.style.width = bar.dataset.width; });

$("#year").textContent = new Date().getFullYear();

$("#contact-form")?.addEventListener("submit", async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector("button[type=submit]");
  const feedback = $("#form-feedback");
  if (!form.reportValidity()) return;
  const body = Object.fromEntries(new FormData(form).entries());
  button.disabled = true;
  button.textContent = "Envoi en cours…";
  feedback.className = "form-feedback";
  feedback.textContent = "";
  try {
    const response = await fetch("/api/contact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Échec de l'envoi.");
    feedback.textContent = data.message || "Message envoyé.";
    form.reset();
  } catch (error) {
    feedback.className = "form-feedback error";
    feedback.textContent = error.message || "Erreur réseau. Réessayez.";
  } finally {
    button.disabled = false;
    button.innerHTML = 'Envoyer le message <span>↗</span>';
  }
});

loadConfig();
loadProjects();
