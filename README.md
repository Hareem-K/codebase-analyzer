# RepoMind 🔍

An AI-powered codebase analyzer built on a Retrieval-Augmented Generation (RAG) pipeline. Drop in any public GitHub repository URL and instantly get a comprehensive analysis of its architecture, tech stack, code flow, and key components — then ask follow-up questions in natural language.

🔗 **[Live Demo](https://repomindanalyzer.netlify.app)**

---

## Features

- **Instant Codebase Analysis** — architecture, tech stack, entry points, and code flow summarized automatically
- **Natural Language Q&A** — ask anything about the repo and get answers grounded in the actual source code
- **Repo Stats Bar** — stars, forks, open issues, last commit date, and language breakdown
- **Suggested Questions** — Claude generates repo-specific questions based on the codebase
- **Session History** — last 5 analyzed repos saved locally so results persist on refresh
- **Collapsible README** — fetches and renders the repo's README inline
- **PDF Export** — download the full analysis summary as a PDF
- **Shareable Links** — copy a link to share a pre-loaded analysis result
- **Copy Buttons** — copy the summary, any answer, or any code snippet with one click
- **Clickable File Links** — every indexed file links directly to its source on GitHub

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React, Vite, Tailwind-inspired CSS |
| Backend | Python, FastAPI |
| RAG Pipeline | LangChain, ChromaDB |
| Embeddings | HuggingFace `sentence-transformers/all-MiniLM-L6-v2` |
| LLM | Anthropic Claude Sonnet |
| Deployment | Render (backend), Netlify (frontend) |

---

## How It Works

1. **Clone & Parse** — the backend clones the repo into a temp directory and reads every supported source file
2. **Chunk & Embed** — files are split into overlapping chunks and converted into vector embeddings
3. **Vector Store** — embeddings are stored in ChromaDB for semantic search
4. **Retrieve & Answer** — when you ask a question, the top 8 most relevant chunks are retrieved and passed to Claude as context
5. **Cleanup** — the temp directory is deleted after indexing

```
GitHub Repo → Clone & Parse → Chunk & Embed → ChromaDB → Retrieve Top-K → Claude Sonnet → Answer
```

---

## Deployment

- **Backend** — deployed on [Render](https://render.com) as a Web Service
- **Frontend** — deployed on [Netlify](https://netlify.com) 

---

## Supported File Types

`.py` `.js` `.ts` `.jsx` `.tsx` `.java` `.go` `.rs` `.cpp` `.c` `.h` `.cs` `.rb` `.php` `.swift` `.kt` `.md` `.yaml` `.yml` `.json` `.toml`

---

## Notes

- Only public GitHub repositories are supported
- Render's free tier spins down after 15 minutes of inactivity — the first request after sleep may take ~30 seconds
- Large repos (1000+ files) may take up to 60 seconds to analyze

---

Built by [Hareem](https://github.com/Hareem-K)
