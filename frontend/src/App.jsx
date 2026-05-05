import { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";

const API = import.meta.env.VITE_API_URL || "http://localhost:8000";

const LOADING_MESSAGES = [
  "Cloning repository…",
  "Reading source files…",
  "Filtering out noise…",
  "Splitting code into chunks…",
  "Building vector embeddings…",
  "Indexing into ChromaDB…",
  "Retrieving key context…",
  "Asking Claude to analyze…",
  "Generating summary…",
  "Almost there…",
];

function useLoadingMessages(active) {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    if (!active) { setIdx(0); return; }
    const t = setInterval(() => setIdx(i => Math.min(i + 1, LOADING_MESSAGES.length - 1)), 4000);
    return () => clearInterval(t);
  }, [active]);
  return LOADING_MESSAGES[idx];
}

function CopyButton({ text, small }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
  return (
    <button className={small ? "copy-btn small" : "copy-btn"} onClick={copy} title="Copy">
      {copied ? "✓ Copied" : "⎘ Copy"}
    </button>
  );
}

function RepoStats({ stats }) {
  if (!stats) return null;
  const languages = Object.entries(stats.languages || {}).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const total = languages.reduce((s, [, v]) => s + v, 0);
  const LANG_COLORS = {
    Python: "#3572A5", JavaScript: "#f1e05a", TypeScript: "#3178c6",
    HTML: "#e34c26", CSS: "#563d7c", Java: "#b07219", Go: "#00ADD8",
    Rust: "#dea584", Ruby: "#701516", PHP: "#4F5D95", Swift: "#F05138",
    "C++": "#f34b7d", C: "#555555", default: "#8b949e"
  };
  return (
    <div className="repo-stats">
      <div className="stats-row">
        {stats.stars !== undefined && <div className="stat-pill">⭐ {stats.stars.toLocaleString()} stars</div>}
        {stats.forks !== undefined && <div className="stat-pill">🍴 {stats.forks.toLocaleString()} forks</div>}
        {stats.file_count && <div className="stat-pill">📄 {stats.file_count} files</div>}
        {stats.last_commit && <div className="stat-pill">🕐 {stats.last_commit}</div>}
        {stats.open_issues !== undefined && <div className="stat-pill">🐛 {stats.open_issues} issues</div>}
      </div>
      {languages.length > 0 && (
        <div className="lang-bar-wrap">
          <div className="lang-bar">
            {languages.map(([lang, bytes]) => (
              <div key={lang} className="lang-segment"
                style={{ width: `${(bytes / total) * 100}%`, background: LANG_COLORS[lang] || LANG_COLORS.default }}
                title={`${lang}: ${Math.round((bytes / total) * 100)}%`} />
            ))}
          </div>
          <div className="lang-legend">
            {languages.map(([lang, bytes]) => (
              <span key={lang} className="lang-item">
                <span className="lang-dot" style={{ background: LANG_COLORS[lang] || LANG_COLORS.default }} />
                {lang} {Math.round((bytes / total) * 100)}%
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ReadmePanel({ readme }) {
  if (!readme) return null;
  return (
    <details className="readme-panel">
      <summary>📖 README.md</summary>
      <div className="readme-content summary-text">
        <ReactMarkdown>{readme}</ReactMarkdown>
      </div>
    </details>
  );
}

function HistorySidebar({ history, onSelect, currentUrl }) {
  if (history.length === 0) return null;
  return (
    <div className="history-sidebar">
      <p className="history-label">Recent</p>
      {history.map((item, i) => (
        <button key={i} className={`history-item ${item.url === currentUrl ? "active" : ""}`}
          onClick={() => onSelect(item)} title={item.url}>
          <span className="history-repo">{item.url.split("/").slice(-1)[0]}</span>
          <span className="history-owner">{item.url.split("/").slice(-2, -1)[0]}</span>
        </button>
      ))}
    </div>
  );
}

function SuggestedQuestions({ questions, onSelect }) {
  const generic = [
    "What is the entry point of this app?",
    "Explain the overall architecture",
    "What dependencies does this project use?",
  ];
  const all = [...(questions || []), ...generic];
  return (
    <div className="chat-hints">
      <p>Try asking:</p>
      {all.slice(0, 6).map((q, i) => (
        <button key={i} onClick={() => onSelect(q)}>{q}</button>
      ))}
    </div>
  );
}

function makeSlug(url) {
  const parts = url.replace(/\/$/, "").split("/");
  return parts.slice(-2).join("-").toLowerCase().replace(/_/g, "-");
}

const MAX_HISTORY = 5;
function loadHistory() {
  try { return JSON.parse(localStorage.getItem("repomind_history") || "[]"); } catch { return []; }
}
function saveHistory(history) {
  try { localStorage.setItem("repomind_history", JSON.stringify(history)); } catch {}
}

function HomePage() {
  const [repoUrl, setRepoUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState(null);
  const [files, setFiles] = useState([]);
  const [stats, setStats] = useState(null);
  const [readme, setReadme] = useState(null);
  const [suggestedQs, setSuggestedQs] = useState([]);
  const [messages, setMessages] = useState([]);
  const [question, setQuestion] = useState("");
  const [asking, setAsking] = useState(false);
  const [analyzedUrl, setAnalyzedUrl] = useState("");
  const [slug, setSlug] = useState("");
  const [error, setError] = useState("");
  const [history, setHistory] = useState(loadHistory);
  const [shareMsg, setShareMsg] = useState("");
  const chatRef = useRef(null);
  const loadingMsg = useLoadingMessages(loading);

  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [messages]);

  useEffect(() => {
    const path = window.location.pathname;
    const match = path.match(/^\/analysis\/(.+)$/);
    if (match) {
      fetch(`${API}/analysis/${match[1]}`)
        .then(r => r.json())
        .then(data => { if (data.found) { setRepoUrl(data.github_url); handleAnalyze(data.github_url); } })
        .catch(() => {});
    }
  }, []);

  async function fetchGithubMeta(url) {
    try {
      const match = url.match(/github\.com\/([^/]+)\/([^/]+)/);
      if (!match) return;
      const [, owner, repo] = match;
      const repoClean = repo.replace(/\.git$/, "");
      const [repoRes, langRes, readmeRes] = await Promise.all([
        fetch(`https://api.github.com/repos/${owner}/${repoClean}`),
        fetch(`https://api.github.com/repos/${owner}/${repoClean}/languages`),
        fetch(`https://api.github.com/repos/${owner}/${repoClean}/readme`),
      ]);
      const repoData = await repoRes.json();
      const langData = await langRes.json();
      const lastCommit = repoData.pushed_at
        ? new Date(repoData.pushed_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
        : null;
      setStats({ stars: repoData.stargazers_count, forks: repoData.forks_count, open_issues: repoData.open_issues_count, last_commit: lastCommit, languages: langData });
      if (readmeRes.ok) {
        const readmeData = await readmeRes.json();
        const decoded = atob(readmeData.content.replace(/\n/g, ""));
        setReadme(decoded);
      }
    } catch {}
  }

  async function generateSuggestedQuestions(url, skipIfNoSession = false) {
    try {
        // Quick health check — if no session exists, don't bother
        const checkRes = await fetch(`${API}/analysis/${makeSlug(url)}`);
        const checkData = await checkRes.json();
        if (skipIfNoSession && !checkData.found) return;

        const res = await fetch(`${API}/ask`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                github_url: url,
                question: `Generate exactly 3 short, specific, interesting questions a developer might ask about this codebase. Return ONLY a JSON array of 3 strings, nothing else.`,
                chat_history: [],
            }),
            });
            const data = await res.json();
            const text = data.answer.trim();
            const start = text.indexOf("["); const end = text.lastIndexOf("]");
            if (start !== -1 && end !== -1) setSuggestedQs(JSON.parse(text.slice(start, end + 1)).slice(0, 3));
        } catch {}
    }

  async function handleAnalyze(urlOverride) {
    const url = (urlOverride || repoUrl).trim();
    if (!url) return;
    setLoading(true); setError(""); setSummary(null); setMessages([]);
    setStats(null); setReadme(null); setSuggestedQs([]);
    fetchGithubMeta(url);
    try {
      const res = await fetch(`${API}/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ github_url: url }),
      });
      if (!res.ok) throw new Error((await res.json()).detail);
      const data = await res.json();
      setSummary(data.summary);
      setFiles(data.files || []);
      setAnalyzedUrl(url);
      const newSlug = makeSlug(url);
      setSlug(newSlug);
      window.history.replaceState({}, "", `/analysis/${newSlug}`);
      const newEntry = { url, summary: data.summary, files: data.files || [], slug: newSlug, timestamp: Date.now() };
      const updated = [newEntry, ...loadHistory().filter(h => h.url !== url)].slice(0, MAX_HISTORY);
      setHistory(updated);
      saveHistory(updated);
      generateSuggestedQuestions(url);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  function loadFromHistory(item) {
    setRepoUrl(item.url);
    setSummary(item.summary);
    setFiles(item.files || []);
    setAnalyzedUrl(item.url);
    setSlug(item.slug || makeSlug(item.url));
    setMessages([]); setStats(null); setReadme(null); setSuggestedQs([]);
    fetchGithubMeta(item.url);
    generateSuggestedQuestions(item.url);
    window.history.replaceState({}, "", `/analysis/${item.slug || makeSlug(item.url)}`);
  }

  async function handleAsk(q) {
    const questionText = q || question;
    if (!questionText.trim() || !analyzedUrl) return;
    setQuestion("");
    setMessages(m => [...m, { role: "user", text: questionText }]);
    setAsking(true);
    try {
      const res = await fetch(`${API}/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ github_url: analyzedUrl, question: questionText, chat_history: messages }),
      });
      if (!res.ok) throw new Error((await res.json()).detail);
      const data = await res.json();
      setMessages(m => [...m, { role: "assistant", text: data.answer }]);
    } catch (e) {
      setMessages(m => [...m, { role: "assistant", text: `Error: ${e.message}` }]);
    } finally {
      setAsking(false);
    }
  }

  async function downloadPDF() {
    const { jsPDF } = await import("jspdf");
    const { default: html2canvas } = await import("html2canvas");
    const element = document.querySelector(".summary-text");
    const canvas = await html2canvas(element, { backgroundColor: "#111827", scale: 2 });
    const imgData = canvas.toDataURL("image/png");
    const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const imgWidth = pageWidth - 20;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;
    let y = 10; let remaining = imgHeight;
    pdf.addImage(imgData, "PNG", 10, y, imgWidth, imgHeight);
    remaining -= pageHeight - 10;
    while (remaining > 0) {
      pdf.addPage(); y = -(imgHeight - remaining) - 10;
      pdf.addImage(imgData, "PNG", 10, y, imgWidth, imgHeight);
      remaining -= pageHeight;
    }
    pdf.save(`${analyzedUrl.split("/").slice(-1)[0] || "repo"}-analysis.pdf`);
  }

  function shareLink() {
    navigator.clipboard.writeText(`${window.location.origin}/analysis/${slug}`);
    setShareMsg("Link copied!"); setTimeout(() => setShareMsg(""), 2500);
  }

  const ghMatch = analyzedUrl.match(/github\.com\/([^/]+)\/([^/]+)/);
  const ghBase = ghMatch ? `https://github.com/${ghMatch[1]}/${ghMatch[2]}/blob/main/` : null;

  const codeComponents = {
    code({ inline, children }) {
      const text = String(children).trim();
      if (inline) return <code>{children}</code>;
      return (
        <div className="code-block-wrap">
          <CopyButton text={text} small />
          <pre><code>{children}</code></pre>
        </div>
      );
    },
    a({ href, children }) {
      if (ghBase && href && !href.startsWith("http")) href = ghBase + href;
      return <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>;
    }
  };

  return (
    <div className="home-layout">
      <HistorySidebar history={history} onSelect={loadFromHistory} currentUrl={analyzedUrl} />
      <div className="home-main">
        <div className="input-section">
          <div className="url-bar">
            <input type="text" placeholder="https://github.com/username/repo"
              value={repoUrl} onChange={e => setRepoUrl(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleAnalyze()} />
            <button onClick={() => handleAnalyze()} disabled={loading || !repoUrl}>
              {loading ? <span className="spinner" /> : "Analyze"}
            </button>
          </div>
          {error && <p className="error">{error}</p>}
        </div>

        {loading && (
          <div className="loading-state">
            <div className="pulse-ring" />
            <p className="loading-msg">{loadingMsg}</p>
            <small>Large repos may take up to 60 seconds</small>
          </div>
        )}

        {summary && (
          <div className="results">
            <div className="summary-panel">
              <div className="summary-header">
                <h2>📋 Analysis Summary</h2>
                <div className="summary-actions">
                  <CopyButton text={summary} />
                  <button className="download-btn" onClick={downloadPDF}>⬇ PDF</button>
                  <button className="share-btn" onClick={shareLink}>🔗 Share</button>
                  {shareMsg && <span className="share-msg">{shareMsg}</span>}
                </div>
              </div>

              <RepoStats stats={stats} />

              <div className="summary-text">
                <ReactMarkdown components={codeComponents}>{summary}</ReactMarkdown>
              </div>

              {files.length > 0 && (
                <details className="file-tree">
                  <summary>{files.length} files indexed</summary>
                  <ul>
                    {files.map(f => (
                      <li key={f}>
                        {ghBase
                          ? <a href={ghBase + f} target="_blank" rel="noopener noreferrer">{f}</a>
                          : f}
                      </li>
                    ))}
                  </ul>
                </details>
              )}

              <ReadmePanel readme={readme} />
            </div>

            <div className="chat-panel">
              <h2>💬 Ask Questions</h2>
              <div className="chat-messages" ref={chatRef}>
                {messages.length === 0 && (
                  <SuggestedQuestions questions={suggestedQs} onSelect={q => handleAsk(q)} />
                )}
                {messages.map((m, i) => (
                  <div key={i} className={`message ${m.role}`}>
                    <div className="message-top">
                      <span className="role-label">{m.role === "user" ? "You" : "RepoMind"}</span>
                      {m.role === "assistant" && <CopyButton text={m.text} small />}
                    </div>
                    <div className="message-content">
                      {m.role === "assistant"
                        ? <ReactMarkdown components={codeComponents}>{m.text}</ReactMarkdown>
                        : <p>{m.text}</p>}
                    </div>
                  </div>
                ))}
                {asking && (
                  <div className="message assistant">
                    <span className="role-label">RepoMind</span>
                    <p className="typing">thinking…</p>
                  </div>
                )}
              </div>
              <div className="chat-input">
                <input type="text" placeholder="Ask anything about this codebase…"
                  value={question} onChange={e => setQuestion(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && handleAsk()} disabled={asking} />
                <button onClick={() => handleAsk()} disabled={asking || !question}>Send</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function HowItWorksPage() {
  const steps = [
    { icon: "⟨/⟩", title: "Paste GitHub URL", desc: "You provide any public GitHub repository URL. RepoMind accepts repos in any language or framework." },
    { icon: "⬇", title: "Clone & Parse", desc: "The backend clones the repo into a temp directory and reads every supported source file, filtering out noise like node_modules and build artifacts." },
    { icon: "✂", title: "Chunk & Embed", desc: "Files are split into overlapping chunks using a recursive text splitter. Each chunk is converted into a vector embedding using HuggingFace's sentence transformer model." },
    { icon: "⬡", title: "Vector Store", desc: "All embeddings are stored in ChromaDB — an in-memory vector database. This enables semantic search: finding code that is conceptually relevant, not just keyword matching." },
    { icon: "⚡", title: "RAG Pipeline", desc: "When you ask a question, the top 8 most relevant chunks are retrieved from the vector store and injected into the prompt as context for Claude." },
    { icon: "◆", title: "Claude Answers", desc: "Claude Sonnet reads the retrieved code context and your question, then generates a precise, technical answer grounded in the actual codebase." },
  ];
  return (
    <div className="page-content">
      <div className="page-hero">
        <h1>How It Works</h1>
        <p>RepoMind uses Retrieval-Augmented Generation (RAG) to give an AI model deep knowledge of any codebase — without fine-tuning or uploading the entire repo into a prompt.</p>
      </div>
      <div className="steps-grid">
        {steps.map((s, i) => (
          <div className="step-card" key={i}>
            <div className="step-number">{i + 1}</div>
            <div className="step-icon">{s.icon}</div>
            <h3>{s.title}</h3>
            <p>{s.desc}</p>
          </div>
        ))}
      </div>
      <div className="pipeline-diagram">
        <h2>The RAG Pipeline</h2>
        <div className="pipeline">
          {["GitHub Repo", "Clone & Parse", "Chunk & Embed", "ChromaDB", "Retrieve Top-K", "Claude Sonnet", "Answer"].map((label, i, arr) => (
            <div key={i} className="pipeline-row">
              <div className="pipeline-node">{label}</div>
              {i < arr.length - 1 && <div className="pipeline-arrow">→</div>}
            </div>
          ))}
        </div>
      </div>
      <div className="tech-stack">
        <h2>Tech Stack</h2>
        <div className="tech-grid">
          {[
            { name: "FastAPI", role: "Backend API", color: "#00d4ff" },
            { name: "LangChain", role: "RAG orchestration", color: "#7c3aed" },
            { name: "ChromaDB", role: "Vector store", color: "#10b981" },
            { name: "HuggingFace", role: "Embeddings", color: "#f59e0b" },
            { name: "Claude Sonnet", role: "LLM", color: "#ef4444" },
            { name: "React + Vite", role: "Frontend", color: "#00d4ff" },
          ].map((t, i) => (
            <div className="tech-card" key={i}>
              <div className="tech-dot" style={{ background: t.color }} />
              <div><strong>{t.name}</strong><span>{t.role}</span></div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function AboutPage() {
  return (
    <div className="page-content">
      <div className="page-hero">
        <h1>About RepoMind</h1>
        <p>A portfolio project exploring how RAG (Retrieval-Augmented Generation) can bridge the gap between large language models and real-world codebases.</p>
      </div>
      <div className="about-grid">
        <div className="about-card"><h3>🎯 The Problem</h3><p>When you join a new codebase, onboarding is slow and painful. Reading through hundreds of files to understand architecture, find functions, or trace data flow takes days. Existing LLMs can't help because they haven't seen your private repo.</p></div>
        <div className="about-card"><h3>💡 The Solution</h3><p>RepoMind uses RAG to dynamically index any GitHub repository and give Claude precise, grounded context about that specific codebase. No fine-tuning. No hallucination about code that doesn't exist. Just accurate answers backed by the actual source.</p></div>
        <div className="about-card"><h3>🧠 What I Learned</h3><p>Building this taught me how vector embeddings work, how chunk size and overlap affect retrieval quality, and how to structure prompts so an LLM reasons about code rather than guessing. RAG is a powerful pattern for any domain-specific AI tool.</p></div>
        <div className="about-card"><h3>🚀 What's Next</h3><p>Planned improvements include support for private repos via GitHub OAuth, persistent vector stores with Pinecone for faster re-analysis, and syntax-highlighted code previews in answers.</p></div>
      </div>
      <div className="about-me">
        <h2>Built by Hareem</h2>
        <p>I built RepoMind as part of my exploration into applied AI — specifically how RAG patterns can make LLMs genuinely useful for software engineering tasks.</p>
        <div className="about-links">
          <a href="https://github.com/Hareem-K" target="_blank" rel="noopener noreferrer" className="about-link">GitHub</a>
          <a href="https://www.linkedin.com/in/hareemzkhan" target="_blank" rel="noopener noreferrer" className="about-link">LinkedIn</a>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [page, setPage] = useState("home");
  const [menuOpen, setMenuOpen] = useState(false);
  const navLinks = [{ id: "home", label: "Analyzer" }, { id: "how", label: "How It Works" }, { id: "about", label: "About" }];
  return (
    <div className="app">
      <header>
        <button className="hamburger" onClick={() => setMenuOpen(o => !o)} aria-label="Menu">
          <span className={menuOpen ? "bar open" : "bar"} />
          <span className={menuOpen ? "bar open" : "bar"} />
          <span className={menuOpen ? "bar open" : "bar"} />
        </button>
        {menuOpen && (
          <nav className="nav-dropdown">
            {navLinks.map(l => (
              <button key={l.id} className={`nav-item ${page === l.id ? "active" : ""}`}
                onClick={() => { setPage(l.id); setMenuOpen(false); }}>{l.label}</button>
            ))}
          </nav>
        )}
        <div className="header-center" onClick={() => setPage("home")} style={{ cursor: "pointer" }}>
          <div className="logo">⟨/⟩</div>
          <h1>RepoMind</h1>
          <p>Drop a GitHub repo. Understand everything.</p>
        </div>
        <div className="nav-pills">
          {navLinks.map(l => (
            <button key={l.id} className={`nav-pill ${page === l.id ? "active" : ""}`}
              onClick={() => setPage(l.id)}>{l.label}</button>
          ))}
        </div>
      </header>
      <main>
        {page === "home" && <HomePage />}
        {page === "how" && <HowItWorksPage />}
        {page === "about" && <AboutPage />}
      </main>
    </div>
  );
}