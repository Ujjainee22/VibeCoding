
const $ = (id) => document.getElementById(id);

let currentUser = null;
let repositories = [];
let events = [];
let languageChart = null;

const cacheGet = (key) => {
  try {
    const item = JSON.parse(localStorage.getItem(key));
    if (item && Date.now() - item.time < 5 * 60 * 1000) return item.data;
  } catch (e) {}
  return null;
};

const cacheSet = (key, data) => {
  try {
    localStorage.setItem(key, JSON.stringify({ time: Date.now(), data }));
  } catch (e) {}
};

async function githubFetch(url) {
  const cached = cacheGet(url);
  if (cached) return cached;

  const response = await fetch(url, {
    headers: { Accept: "application/vnd.github+json" }
  });

  if (!response.ok) {
    if (response.status === 404) throw new Error("GitHub username not found.");
    if (response.status === 403) throw new Error("GitHub API rate limit reached. Please try again later.");
    throw new Error("GitHub API request failed: " + response.status);
  }

  const data = await response.json();
  cacheSet(url, data);
  return data;
}

async function loadProfile(username) {
  $("message").textContent = "Connecting to GitHub...";
  $("repoGrid").innerHTML = "<p>Fetching repositories...</p>";

  try {
    const [user, repos, activity] = await Promise.all([
      githubFetch(`https://api.github.com/users/${encodeURIComponent(username)}`),
      githubFetch(`https://api.github.com/users/${encodeURIComponent(username)}/repos?per_page=100&sort=updated`),
      githubFetch(`https://api.github.com/users/${encodeURIComponent(username)}/events/public?per_page=100`)
    ]);

    currentUser = user;
    repositories = repos;
    events = activity;

    renderProfile();
    renderRepositories();
    renderLanguages();
    renderActivity();

    $("message").textContent = `Successfully analysed @${user.login}. Data fetched from GitHub.`;
  } catch (error) {
    $("message").textContent = error.message;
    $("repoGrid").innerHTML = `<p>${error.message}</p>`;
  }
}

function renderProfile() {
  const u = currentUser;
  const stars = repositories.reduce((sum, r) => sum + r.stargazers_count, 0);

  $("avatar").src = u.avatar_url;
  $("name").textContent = u.name || u.login;
  $("handle").textContent = "@" + u.login;
  $("bio").textContent = u.bio || "No bio available.";
  $("followers").textContent = u.followers;
  $("following").textContent = u.following;
  $("reposCount").textContent = u.public_repos;
  $("totalStars").textContent = stars;
  $("githubLink").href = u.html_url;

  $("statRepos").textContent = u.public_repos;
  $("statStars").textContent = stars;
  $("eventCount").textContent = events.length;
}

function renderRepositories() {
  const sort = $("sortRepos").value;
  const sorted = [...repositories].sort((a, b) =>
    sort === "stars"
      ? b.stargazers_count - a.stargazers_count
      : new Date(b.updated_at) - new Date(a.updated_at)
  );

  const featured = sorted.filter(r => !r.fork).slice(0, 8);

  $("repoGrid").innerHTML = featured.length ? featured.map(r => `
    <article class="repo-card">
      <h3><a href="${r.html_url}" target="_blank" rel="noopener">${escapeHTML(r.name)}</a></h3>
      <p>${escapeHTML(r.description || "No description provided for this repository.")}</p>
      <div class="repo-meta">
        <span><i class="language-dot"></i>${escapeHTML(r.language || "Not specified")}</span>
        <span>★ ${r.stargazers_count}</span>
        <span>⑂ ${r.forks_count}</span>
      </div>
    </article>
  `).join("") : "<p>No public repositories found.</p>";
}

function renderLanguages() {
  const counts = {};
  repositories.forEach(r => {
    if (r.language && !r.fork) counts[r.language] = (counts[r.language] || 0) + 1;
  });

  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 6);
  $("topLanguage").textContent = entries[0]?.[0] || "N/A";

  $("languageLegend").innerHTML = entries.map(([name, count]) =>
    `<span>${escapeHTML(name)} · ${count}</span>`
  ).join("");

  if (languageChart) languageChart.destroy();

  const ctx = $("languageChart").getContext("2d");
  languageChart = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels: entries.map(e => e[0]),
      datasets: [{
        data: entries.map(e => e[1]),
        backgroundColor: ["#9a83ff", "#48d6a0", "#54a8ff", "#f3b66a", "#f078a5", "#64d5d9"],
        borderWidth: 0
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: {
          display: true,
          position: "bottom",
          labels: { color: "#aab4c8", padding: 13, font: { size: 10 } }
        }
      },
      cutout: "68%"
    }
  });
}

function renderActivity() {
  const counts = {};
  const today = new Date();
  const start = new Date(today);
  start.setDate(today.getDate() - 29);

  events.forEach(event => {
    const date = new Date(event.created_at).toISOString().slice(0, 10);
    counts[date] = (counts[date] || 0) + 1;
  });

  let html = "";
  for (let i = 0; i < 30; i++) {
    const date = new Date(start);
    date.setDate(start.getDate() + i);
    const key = date.toISOString().slice(0, 10);
    const count = counts[key] || 0;
    const level = count === 0 ? 0 : count < 2 ? 1 : count < 5 ? 2 : 3;
    html += `<div class="heat-cell level${level}" data-tip="${key}: ${count} public events"></div>`;
  }
  $("heatmap").innerHTML = html;
}

function extractTechnologies(text) {
  const techs = [
    "javascript", "typescript", "python", "java", "c++", "c#", "go",
    "rust", "php", "ruby", "swift", "kotlin", "react", "next.js",
    "node.js", "express", "angular", "vue", "django", "flask",
    "fastapi", "sql", "mysql", "postgresql", "mongodb", "sqlite",
    "html", "css", "tailwind", "docker", "kubernetes", "aws",
    "azure", "git", "machine learning", "tensorflow", "pytorch"
  ];

  const lower = text.toLowerCase();
  return techs.filter(t => {
    const escaped = t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(^|[^a-z0-9])${escaped}($|[^a-z0-9])`, "i").test(lower);
  });
}

function getDeveloperTechnologies() {
  const techs = new Set();

  repositories.forEach(r => {
    if (r.language) techs.add(r.language.toLowerCase());
    if (r.description) extractTechnologies(r.description).forEach(t => techs.add(t));
    if (r.name) extractTechnologies(r.name).forEach(t => techs.add(t));
  });

  return techs;
}

$("checkVibe").addEventListener("click", () => {
  const description = $("jobDescription").value.trim();
  if (!description) {
    $("vibeResult").textContent = "Please paste a job description first.";
    return;
  }

  const required = extractTechnologies(description);
  const owned = getDeveloperTechnologies();

  if (!required.length) {
    $("vibeResult").textContent = "No recognised technology keywords found. Try a more detailed job description.";
    return;
  }

  const matched = required.filter(t => owned.has(t));
  const missing = required.filter(t => !owned.has(t));
  const score = Math.round(matched.length / required.length * 100);

  $("vibeResult").innerHTML = `
    <div class="score">${score}%</div>
    <strong>${matched.length} of ${required.length} technologies detected</strong>
    <p class="muted">This score measures GitHub evidence, not verified proficiency.</p>
    ${matched.map(t => `<div class="match-item">✓ ${escapeHTML(t)} — Detected</div>`).join("")}
    ${missing.map(t => `<div class="match-item">○ ${escapeHTML(t)} — Not detected</div>`).join("")}
  `;
});

function answerQuestion(question) {
  const q = question.toLowerCase();
  const stars = [...repositories].sort((a, b) => b.stargazers_count - a.stargazers_count);
  const popular = stars[0];

  if (q.includes("popular") || q.includes("star")) {
    return popular
      ? `${popular.name} is the most starred repository with ${popular.stargazers_count} stars and ${popular.forks_count} forks.`
      : "No repositories are available.";
  }

  if (q.includes("language") || q.includes("tech")) {
    const languages = [...new Set(repositories.map(r => r.language).filter(Boolean))];
    return `The detected programming languages are: ${languages.join(", ") || "No languages detected"}.`;
  }

  if (q.includes("how many") || q.includes("repository") || q.includes("project")) {
    return `This developer has ${currentUser.public_repos} public repositories. ${repositories.filter(r => !r.fork).length} repositories were retrieved for analysis.`;
  }

  if (q.includes("fork")) {
    return `The repositories have ${repositories.reduce((sum, r) => sum + r.forks_count, 0)} forks in total.`;
  }

  if (q.includes("bio") || q.includes("about") || q.includes("profile")) {
    return `${currentUser.name || currentUser.login}: ${currentUser.bio || "No bio available."} They have ${currentUser.followers} followers.`;
  }

  return "I can answer questions about the developer's profile, repository count, most popular project, stars, forks and programming languages. Try asking one of those!";
}

$("chatForm").addEventListener("submit", e => {
  e.preventDefault();
  if (!currentUser) return;

  const question = $("chatInput").value.trim();
  if (!question) return;

  $("chatMessages").innerHTML += `<div class="user-msg">${escapeHTML(question)}</div>`;
  $("chatMessages").innerHTML += `<div class="bot-msg">${escapeHTML(answerQuestion(question))}</div>`;
  $("chatInput").value = "";
  $("chatMessages").scrollTop = $("chatMessages").scrollHeight;
});

$("careerButton").addEventListener("click", () => {
  if (!currentUser) return;

  const technologies = getDeveloperTechnologies();
  const suggestions = [];

  if (!technologies.has("sql") && !technologies.has("mysql") && !technologies.has("postgresql")) {
    suggestions.push("Build a database-backed application to demonstrate SQL and data modelling.");
  }
  if (!technologies.has("docker")) {
    suggestions.push("Learn Docker and containerise one of your existing projects.");
  }
  if (!technologies.has("typescript")) {
    suggestions.push("Try TypeScript to strengthen your JavaScript development skills.");
  }
  if (repositories.filter(r => !r.fork).length < 3) {
    suggestions.push("Create more original repositories with detailed README files and screenshots.");
  }
  if (!suggestions.length) {
    suggestions.push("Explore advanced system design, testing and deployment. Document your best projects.");
  }

  $("careerResult").innerHTML = `
    <strong>Suggested next steps</strong>
    <ul>${suggestions.map(s => `<li>${escapeHTML(s)}</li>`).join("")}</ul>
    <p class="muted">Rule-based suggestions derived from available public repository metadata.</p>
  `;
});

function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;",
    '"': "&quot;", "'": "&#39;"
  })[char]);
}

$("searchForm").addEventListener("submit", e => {
  e.preventDefault();
  const username = $("username").value.trim();
  if (username) loadProfile(username);
});

$("sortRepos").addEventListener("change", renderRepositories);

loadProfile("octocat");
